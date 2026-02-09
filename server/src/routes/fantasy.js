import express from "express";
import FantasyRule from "../models/FantasyRule.js";
import FantasyMatchPoints from "../models/FantasyMatchPoints.js";
import Player from "../models/Player.js";
import Team from "../models/Team.js";
import { authRequired } from "../middleware/auth.js";
import { cricapiGet } from "../services/cricapi.js";
import { calculateMatchPoints, DEFAULT_RULESET } from "../services/fantasyScoring.js";

const router = express.Router();

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function totalWithCaptaincy(points, captainName, viceName) {
  let total = 0;
  const capKey = normalizeName(captainName);
  const vcKey = normalizeName(viceName);
  for (const p of points) {
    const nameKey = normalizeName(p.name);
    const base = Number(p.total || 0);
    if (capKey && nameKey === capKey) {
      total += base * 2;
    } else if (vcKey && nameKey === vcKey) {
      total += base * 1.5;
    } else {
      total += base;
    }
  }
  return total;
}

function isCompletedMatch(match) {
  const ms = String(match?.ms || "").toLowerCase();
  if (ms === "result") return true;
  if (match?.matchEnded === true) return true;
  const status = String(match?.status || match?.matchStatus || "").toLowerCase();
  return /match ended|result|won|abandoned|no result|draw|tied|complete|completed|match over|finished/.test(status);
}

function isCompletedScorecard(scoreData) {
  if (scoreData?.matchEnded === true) return true;
  const status = String(scoreData?.status || scoreData?.matchStatus || "").toLowerCase();
  return /match ended|result|won|abandoned|no result|draw|tied|complete|completed|match over|finished/.test(status);
}


function matchDateFromMatch(match) {
  const dt = match?.dateTimeGMT || match?.dateTime;
  if (!dt) return null;
  const iso = new Date(dt).toISOString();
  return iso.slice(0, 10);
}

function matchStartMsFromMatch(match) {
  const dt = match?.dateTimeGMT || match?.dateTime;
  if (!dt) return null;
  const ms = new Date(dt).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isT20WorldCup2026(match) {
  const seriesId = String(match?.series_id || match?.seriesId || "");
  const expected = String(process.env.CRICAPI_SERIES_ID || "0cdf6736-ad9b-4e95-a647-5ee3a99c5510");
  if (seriesId && seriesId === expected) return true;
  const series = String(match?.series || match?.seriesName || "").toLowerCase();
  if (!series) return true;
  return series === "icc men's t20 world cup 2026";
}

async function ensureRules() {
  const existing = await FantasyRule.findOne({ name: DEFAULT_RULESET.name });
  if (!existing) {
    await FantasyRule.create(DEFAULT_RULESET);
  }
}

router.get("/rules", async (req, res) => {
  try {
    await ensureRules();
    const rules = await FantasyRule.findOne({ name: DEFAULT_RULESET.name }).lean();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/rules/reset", async (req, res) => {
  try {
    await FantasyRule.deleteMany({ name: DEFAULT_RULESET.name });
    await FantasyRule.create(DEFAULT_RULESET);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/score/:matchId", async (req, res) => {
  try {
    await ensureRules();
    const rules = await FantasyRule.findOne({ name: DEFAULT_RULESET.name }).lean();

    const { matchId } = req.params;
    const apiData = await cricapiGet("/match_scorecard", { id: matchId });
    const scorecard = apiData?.data?.scorecard || apiData?.data?.innings || apiData?.data;

    const points = calculateMatchPoints(scorecard, rules);

    const warnings = [
      "Dot ball points and LBW/Bowled bonuses require ball-by-ball data and are not applied.",
      "Run-out direct/indirect and stumping points require detailed fielding data and may be incomplete.",
      "Captain/Vice-captain multipliers are not applied in this endpoint.",
      "Live match points are provisional and will update as the scorecard changes."
    ];

    const payload = {
      matchId,
      ruleset: rules.name,
      points,
      warnings
    };

    await FantasyMatchPoints.findOneAndUpdate(
      { matchId, ruleset: rules.name },
      payload,
      { upsert: true, new: true }
    );

    res.json(payload);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});


router.post("/sync", async (req, res) => {
  try {
    await ensureRules();
    const rules = await FantasyRule.findOne({ name: DEFAULT_RULESET.name }).lean();
    const seriesInfo = await cricapiGet("/series_info", {
      id: process.env.CRICAPI_SERIES_ID || "0cdf6736-ad9b-4e95-a647-5ee3a99c5510"
    }, process.env.CRICAPI_SERIES_KEY || process.env.CRICAPI_KEY);
    const rawMatches =
      seriesInfo?.data?.matchList ||
      seriesInfo?.data?.matches ||
      seriesInfo?.data?.match ||
      [];
    const list = Array.isArray(rawMatches) ? rawMatches : [];
    const matches = list.filter(isT20WorldCup2026);

    const aggregate = new Map();
    let processed = 0;

    for (const match of matches) {
      const matchId = match?.id || match?.match_id || match?.matchId || match?.unique_id;
      if (!matchId) continue;
      const scoreData = await cricapiGet(
        "/match_scorecard",
        { id: matchId },
        process.env.CRICAPI_SCORECARD_KEY || process.env.CRICAPI_KEY
      );
      const scoreRoot = scoreData?.data;
      if (!isCompletedMatch(match) && !isCompletedScorecard(scoreRoot)) {
        continue;
      }
      const scorecard = scoreRoot?.scorecard || scoreRoot?.innings || scoreRoot;
      const points = calculateMatchPoints(scorecard, rules);
      if (!points.length) {
        continue;
      }
      processed += 1;

      const matchDate = matchDateFromMatch(match);
      const matchStartMs = matchStartMsFromMatch(match);
      await FantasyMatchPoints.findOneAndUpdate(
        { matchId: matchId, ruleset: rules.name },
        { matchId: matchId, matchDate, matchStartMs, ruleset: rules.name, points },
        { upsert: true, new: true }
      );

      for (const p of points) {
        const key = normalizeName(p.name);
        const current = aggregate.get(key) || 0;
        aggregate.set(key, current + (p.total || 0));
      }
    }

    const players = await Player.find({}).lean();
    const bulk = [];
    for (const player of players) {
      const key = normalizeName(player.name);
      const total = aggregate.get(key) || 0;
      bulk.push({
        updateOne: {
          filter: { _id: player._id },
          update: { $set: { fantasyPoints: total, lastPointsUpdatedAt: new Date() } }
        }
      });
    }

    if (bulk.length) {
      await Player.bulkWrite(bulk);
    }

    res.json({
      ok: true,
      matchesProcessed: processed,
      playersUpdated: players.length,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});


router.get("/daily", authRequired, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const team = await Team.findOne({ user: req.user.id }).populate("players").lean();
    if (!team) return res.json({ date, totalPoints: 0, matches: 0 });

    const nameSet = new Set(team.players.map((p) => normalizeName(p.name)));
    const docs = await FantasyMatchPoints.find({ matchDate: date }).lean();

    let total = 0;
    for (const doc of docs) {
      const points = Array.isArray(doc.points) ? doc.points : [];
      for (const p of points) {
        if (nameSet.has(normalizeName(p.name))) {
          total += Number(p.total || 0);
        }
      }
    }

    res.json({ date, totalPoints: total, matches: docs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/points/since", authRequired, async (req, res) => {
  try {
    const { playerIds = [], since } = req.body || {};
    let startMs = Number(since);
    const team = await Team.findOne({ user: req.user.id })
      .select("submittedForMatchStart players captain viceCaptain")
      .populate("players")
      .populate("captain")
      .populate("viceCaptain")
      .lean();
    if (!Number.isFinite(startMs)) {
      if (team?.submittedForMatchStart) {
        startMs = new Date(team.submittedForMatchStart).getTime();
      }
      if (!Number.isFinite(startMs)) {
        return res.json({ since: null, totalPoints: 0, matches: 0 });
      }
      if (!playerIds.length && Array.isArray(team?.players)) {
        req.body.playerIds = team.players.map((p) => p._id);
      }
    }

    const ids = Array.isArray(req.body.playerIds) ? req.body.playerIds : [];
    if (!ids.length) {
      return res.json({ since: startMs, totalPoints: 0, matches: 0 });
    }

    const players = await Player.find({ _id: { $in: ids } }).lean();
    const nameSet = new Set(players.map((p) => normalizeName(p.name)));
    const captainName = team?.captain?.name || null;
    const viceName = team?.viceCaptain?.name || null;

    const docs = await FantasyMatchPoints.find({
      $or: [
        { matchStartMs: { $gt: startMs } },
        { matchStartMs: { $exists: false }, matchDate: { $gte: new Date(startMs).toISOString().slice(0, 10) } }
      ]
    }).lean();

    let total = 0;
    for (const doc of docs) {
      const points = Array.isArray(doc.points) ? doc.points : [];
      const filtered = points.filter((p) => nameSet.has(normalizeName(p.name)));
      total += totalWithCaptaincy(filtered, captainName, viceName);
    }

    res.json({ since: startMs, totalPoints: total, matches: docs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
