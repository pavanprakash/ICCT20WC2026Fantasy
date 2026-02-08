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

function isCompletedMatch(match) {
  if (match?.matchEnded === true) return true;
  const status = String(match?.status || match?.matchStatus || "").toLowerCase();
  return /match ended|result|won|abandoned|no result|draw|tied|complete|completed|match over/.test(status);
}


function matchDateFromMatch(match) {
  const dt = match?.dateTimeGMT || match?.dateTime;
  if (!dt) return null;
  const iso = new Date(dt).toISOString();
  return iso.slice(0, 10);
}

function isT20WorldCup2026(match) {
  const hay = [
    match?.name,
    match?.series,
    match?.seriesName,
    match?.matchType,
    match?.matchTypeLower
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const dateText = `${match?.dateTime || ""} ${match?.dateTimeGMT || ""} ${match?.date || ""}`;
  return hay.includes("t20") && hay.includes("world cup") && (hay.includes("2026") || dateText.includes("2026"));
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
      "Captain/Vice-captain multipliers are not applied in this endpoint."
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
    const apiData = await cricapiGet("/matches", {});
    const list = Array.isArray(apiData?.data) ? apiData.data : [];
    const matches = list.filter(isT20WorldCup2026).filter(isCompletedMatch);

    const aggregate = new Map();

    for (const match of matches) {
      if (!match?.id) continue;
      const scoreData = await cricapiGet("/match_scorecard", { id: match.id });
      const scorecard = scoreData?.data?.scorecard || scoreData?.data?.innings || scoreData?.data;
      const points = calculateMatchPoints(scorecard, rules);

      const matchDate = matchDateFromMatch(match);
      await FantasyMatchPoints.findOneAndUpdate(
        { matchId: match.id, ruleset: rules.name },
        { matchId: match.id, matchDate, ruleset: rules.name, points },
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
      matchesProcessed: matches.length,
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

export default router;
