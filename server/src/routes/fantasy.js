import express from "express";
import FantasyRule from "../models/FantasyRule.js";
import FantasyMatchPoints from "../models/FantasyMatchPoints.js";
import Player from "../models/Player.js";
import Team from "../models/Team.js";
import TeamSubmission from "../models/TeamSubmission.js";
import { authRequired } from "../middleware/auth.js";
import { cricapiGet } from "../services/cricapi.js";
import { applyPlayingXIPoints, calculateMatchPoints, DEFAULT_RULESET } from "../services/fantasyScoring.js";
import { getPlayingSubstitutes, getPlayingXI } from "../services/playingXI.js";
import { applySuperSubByLowest } from "../services/superSub.js";
import { normalizeNameKey } from "../utils/nameCanonical.js";

const router = express.Router();

function normalizeName(value) {
  return normalizeNameKey(value);
}

function buildRoleMap(players = []) {
  const out = new Map();
  for (const p of players) {
    out.set(normalizeName(p?.name), p?.role || "");
  }
  return out;
}

function getPlayerNameById(players, idOrObj) {
  if (!idOrObj || !Array.isArray(players)) return null;
  const id = idOrObj?._id || idOrObj;
  const found = players.find((p) => String(p._id) === String(id));
  return found?.name || null;
}

function totalWithCaptaincy(points, captainName, viceName, boosterType, roleByName = new Map(), boosterPlayerNameKey = null) {
  let total = 0;
  const capKey = normalizeName(captainName);
  const vcKey = normalizeName(viceName);
  for (const p of points) {
    const nameKey = normalizeName(p.name);
    const base = Number(p.total || 0);
    let multiplier = 1;
    let skipCaptaincy = false;
    if (boosterType === "batsman" || boosterType === "bowler" || boosterType === "wk" || boosterType === "allrounder" || boosterType === "teamx2" || boosterType === "captainx3") {
      const role = roleByName.get(nameKey) || "";
      const lower = String(role).toLowerCase();
      const isBatsman = lower.includes("bat") && !lower.includes("all");
      const isBowler = lower.includes("bowl");
      const isWicketkeeper = lower.includes("wk") || lower.includes("keeper");
      const isAllRounder = lower.includes("all");
      if (boosterType === "batsman" && isBatsman) multiplier *= 2;
      if (boosterType === "bowler" && isBowler) multiplier *= 2;
      if (boosterType === "wk" && isWicketkeeper) multiplier *= 2;
      if (boosterType === "allrounder" && isAllRounder) multiplier *= 2;
      if (boosterType === "teamx2") multiplier *= 2;
      if (boosterType === "captainx3" && boosterPlayerNameKey && nameKey === boosterPlayerNameKey) {
        multiplier *= 3;
        skipCaptaincy = true;
      }
    }
    if (!skipCaptaincy && capKey && nameKey === capKey) {
      multiplier *= 2;
    } else if (!skipCaptaincy && vcKey && nameKey === vcKey) {
      multiplier *= 1.5;
    }
    total += base * multiplier;
  }
  return total;
}

const applySuperSub = applySuperSubByLowest;

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
    const playerRoleByName = buildRoleMap(await Player.find({}).select("name role").lean());

    const { matchId } = req.params;
    const safe = await cricapiGetScorecardSafe(matchId);
    if (safe.skipped) {
      console.warn(
        JSON.stringify({
          source: "routes/fantasy:GET /score/:matchId",
          matchId,
          reason: safe.reason || "unavailable"
        })
      );
      return res.json({
        matchId,
        ruleset: rules.name,
        points: [],
        warnings: [
          "Scorecard not available yet for this match."
        ],
        skipped: true,
        reason: safe.reason || "unavailable"
      });
    }
    const scoreRoot = safe.data?.data;
    const scorecard = scoreRoot?.scorecard || scoreRoot?.innings || scoreRoot;
    const playingXI = getPlayingXI(scoreRoot);
    const playingSubstitutes = getPlayingSubstitutes(scoreRoot, playingXI);
    const playingXIBonus = Number(rules?.additional?.playingXI ?? DEFAULT_RULESET.additional.playingXI);
    const playingSubstituteBonus = Number(
      rules?.additional?.playingSubstitute ?? DEFAULT_RULESET.additional.playingSubstitute
    );
    const points = applyPlayingXIPoints(
      calculateMatchPoints(scorecard, rules, { playerRoleByName }),
      playingXI,
      playingXIBonus,
      playingSubstitutes,
      playingSubstituteBonus
    );

    const warnings = [
      "Dot ball and direct/indirect run-out points depend on scorecard detail; missing API fields may reduce accuracy.",
      "Playing substitute (+4) is applied only when scorecard provides substitute/replacement data.",
      "Captain/Vice-captain multipliers are not applied in this endpoint.",
      "Live match points are provisional and will update as the scorecard changes."
    ];

    const payload = {
      matchId,
      ruleset: rules.name,
      points,
      playingSubstitutes,
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
    const playerRoleByName = buildRoleMap(await Player.find({}).select("name role").lean());
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
      const safe = await cricapiGetScorecardSafe(
        matchId,
        process.env.CRICAPI_SCORECARD_KEY || process.env.CRICAPI_KEY
      );
      if (safe.skipped) {
        console.warn(
          JSON.stringify({
            source: "routes/fantasy:POST /sync",
            matchId,
            reason: safe.reason || "unavailable"
          })
        );
        continue;
      }
      const scoreRoot = safe.data?.data;
      if (!isCompletedMatch(match) && !isCompletedScorecard(scoreRoot)) {
        continue;
      }
      const scorecard = scoreRoot?.scorecard || scoreRoot?.innings || scoreRoot;
      const playingXI = getPlayingXI(scoreRoot);
      const playingSubstitutes = getPlayingSubstitutes(scoreRoot, playingXI);
      const playingXIBonus = Number(rules?.additional?.playingXI ?? DEFAULT_RULESET.additional.playingXI);
      const playingSubstituteBonus = Number(
        rules?.additional?.playingSubstitute ?? DEFAULT_RULESET.additional.playingSubstitute
      );
      const points = applyPlayingXIPoints(
        calculateMatchPoints(scorecard, rules, { playerRoleByName }),
        playingXI,
        playingXIBonus,
        playingSubstitutes,
        playingSubstituteBonus
      );
      if (!points.length) {
        continue;
      }
      processed += 1;

      const matchDate = matchDateFromMatch(match);
      const matchStartMs = matchStartMsFromMatch(match);
      await FantasyMatchPoints.findOneAndUpdate(
        { matchId: matchId, ruleset: rules.name },
        { matchId: matchId, matchDate, matchStartMs, ruleset: rules.name, points, playingXI, playingSubstitutes },
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
    const submissions = await TeamSubmission.find({ user: req.user.id, matchDate: date })
      .populate("players")
      .populate("captain")
      .populate("viceCaptain")
      .populate("superSub")
      .lean();
    if (!submissions.length) return res.json({ date, totalPoints: 0, matches: 0 });

    const matchIds = submissions.map((s) => s.matchId);
    const docs = await FantasyMatchPoints.find({ matchId: { $in: matchIds } }).lean();
    const pointsMap = new Map(docs.map((d) => [String(d.matchId), d]));

    let total = 0;
    let matches = 0;
    for (const s of submissions) {
      const pointsDoc = pointsMap.get(String(s.matchId)) || {};
      const points = Array.isArray(pointsDoc.points) ? pointsDoc.points : [];
      const applied = applySuperSub(s, pointsDoc);
      const filtered = points.filter((p) => applied.nameSet.has(normalizeName(p.name)));
      total += totalWithCaptaincy(filtered, applied.capName, applied.vcName, s.booster, applied.roleByName);
      matches += 1;
    }

    res.json({ date, totalPoints: total, matches });
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
      total += totalWithCaptaincy(filtered, captainName, viceName, null, new Map(), null);
    }

    res.json({ since: startMs, totalPoints: total, matches: docs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/submissions", authRequired, async (req, res) => {
  try {
  const ruleset = DEFAULT_RULESET.name;
  const submissions = await TeamSubmission.find({ user: req.user.id })
    .populate("players")
    .populate("captain")
    .populate("viceCaptain")
    .populate("superSub")
    .sort({ matchStartMs: -1, createdAt: -1 })
    .lean();

    const matchIds = submissions.map((s) => s.matchId);
  const pointsDocs = await FantasyMatchPoints.find({ matchId: { $in: matchIds }, ruleset }).lean();
  const pointsMap = new Map(pointsDocs.map((d) => [String(d.matchId), d]));

    const rows = submissions.map((s) => {
    const pointsDoc = pointsMap.get(String(s.matchId)) || {};
    const points = Array.isArray(pointsDoc.points) ? pointsDoc.points : [];
    const applied = applySuperSub(s, pointsDoc);
    const boosterPlayerName = getPlayerNameById(s.players, s.boosterPlayer);
    const boosterPlayerKey = normalizeName(boosterPlayerName);
    const filtered = points.filter((p) => applied.nameSet.has(normalizeName(p.name)));
    const capName = applied.capName;
    const vcName = applied.vcName;
    const capKey = normalizeName(capName);
    const vcKey = normalizeName(vcName);
    const breakdown = filtered
      .map((p) => {
        const key = normalizeName(p.name);
        const base = Number(p.total || 0);
        let multiplier = 1;
        let skipCaptaincy = false;
        if (s.booster === "batsman" || s.booster === "bowler" || s.booster === "wk" || s.booster === "allrounder" || s.booster === "teamx2" || s.booster === "captainx3") {
          const role = applied.roleByName.get(key) || "";
          const lower = String(role).toLowerCase();
          const isBatsman = lower.includes("bat") && !lower.includes("all");
          const isBowler = lower.includes("bowl");
          const isWicketkeeper = lower.includes("wk") || lower.includes("keeper");
          const isAllRounder = lower.includes("all");
          if (s.booster === "batsman" && isBatsman) multiplier *= 2;
          if (s.booster === "bowler" && isBowler) multiplier *= 2;
          if (s.booster === "wk" && isWicketkeeper) multiplier *= 2;
          if (s.booster === "allrounder" && isAllRounder) multiplier *= 2;
          if (s.booster === "teamx2") multiplier *= 2;
          if (s.booster === "captainx3" && boosterPlayerKey && key === boosterPlayerKey) {
            multiplier *= 3;
            skipCaptaincy = true;
          }
        }
        if (!skipCaptaincy && capKey && key === capKey) multiplier *= 2;
        else if (!skipCaptaincy && vcKey && key === vcKey) multiplier *= 1.5;
        return {
          name: p.name,
          basePoints: base,
          multiplier,
            totalPoints: base * multiplier
          };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints);
    const total = totalWithCaptaincy(filtered, capName, vcName, s.booster, applied.roleByName, boosterPlayerKey || null);
      return {
        id: s._id,
        matchId: s.matchId,
        matchDate: s.matchDate || null,
        matchStartMs: s.matchStartMs || null,
        matchName: s.matchName || null,
        team1: s.team1 || null,
        team2: s.team2 || null,
      venue: s.venue || null,
        booster: s.booster || null,
        boosterPlayer: s.boosterPlayer || null,
        captainName: capName || null,
        viceCaptainName: vcName || null,
        superSub: s.superSub || null,
        superSubUsed: Boolean(applied.superSubUsed),
        totalPoints: total,
        breakdown
      };
    });

    res.json({ total: rows.length, submissions: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/submissions/:id", async (req, res) => {
  try {
    const ruleset = DEFAULT_RULESET.name;
    const submission =
      (await TeamSubmission.findOne({ _id: req.params.id })
        .populate("players")
        .populate("captain")
        .populate("viceCaptain")
        .populate("superSub")
        .lean()) ||
      (await TeamSubmission.findOne({ matchId: req.params.id })
        .populate("players")
        .populate("captain")
        .populate("viceCaptain")
        .populate("superSub")
        .lean());

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const pointsDoc = await FantasyMatchPoints.findOne({ matchId: submission.matchId, ruleset }).lean();
    const points = Array.isArray(pointsDoc?.points) ? pointsDoc.points : [];
    const applied = applySuperSub(submission, pointsDoc);
    const boosterPlayerName = getPlayerNameById(submission.players, submission.boosterPlayer);
    const boosterPlayerKey = normalizeName(boosterPlayerName);
    const filtered = points.filter((p) => applied.nameSet.has(normalizeName(p.name)));
    const capName = applied.capName;
    const vcName = applied.vcName;
    const capKey = normalizeName(capName);
    const vcKey = normalizeName(vcName);
    const breakdown = filtered
      .map((p) => {
        const key = normalizeName(p.name);
        const base = Number(p.total || 0);
        let multiplier = 1;
        let skipCaptaincy = false;
        if (submission.booster === "batsman" || submission.booster === "bowler" || submission.booster === "wk" || submission.booster === "allrounder" || submission.booster === "teamx2" || submission.booster === "captainx3") {
          const role = applied.roleByName.get(key) || "";
          const lower = String(role).toLowerCase();
          const isBatsman = lower.includes("bat") && !lower.includes("all");
          const isBowler = lower.includes("bowl");
          const isWicketkeeper = lower.includes("wk") || lower.includes("keeper");
          const isAllRounder = lower.includes("all");
          if (submission.booster === "batsman" && isBatsman) multiplier *= 2;
          if (submission.booster === "bowler" && isBowler) multiplier *= 2;
          if (submission.booster === "wk" && isWicketkeeper) multiplier *= 2;
          if (submission.booster === "allrounder" && isAllRounder) multiplier *= 2;
          if (submission.booster === "teamx2") multiplier *= 2;
          if (submission.booster === "captainx3" && boosterPlayerKey && key === boosterPlayerKey) {
            multiplier *= 3;
            skipCaptaincy = true;
          }
        }
        if (!skipCaptaincy && capKey && key === capKey) multiplier *= 2;
        else if (!skipCaptaincy && vcKey && key === vcKey) multiplier *= 1.5;
        return {
          name: p.name,
          basePoints: base,
          multiplier,
          totalPoints: base * multiplier
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints);

    const payload = {
      submission: {
        id: submission._id,
        matchId: submission.matchId,
        matchDate: submission.matchDate || null,
        matchStartMs: submission.matchStartMs || null,
        matchName: submission.matchName || null,
        team1: submission.team1 || null,
        team2: submission.team2 || null,
        venue: submission.venue || null,
        booster: submission.booster || null,
        boosterPlayer: submission.boosterPlayer || null,
        superSub: submission.superSub || null,
        superSubUsed: Boolean(applied.superSubUsed),
        totalPoints: totalWithCaptaincy(filtered, capName, vcName, submission.booster, applied.roleByName, boosterPlayerKey || null),
        players: submission.players || [],
        captainId: submission.captain?._id || submission.captain || null,
        viceCaptainId: submission.viceCaptain?._id || submission.viceCaptain || null,
        effectiveCaptainName: capName || null,
        effectiveViceCaptainName: vcName || null,
        breakdown
      }
    };
    if (req.query?.debug) {
      payload.debug = {
        capName,
        vcName,
        capKey,
        vcKey,
        sampleNames: filtered.slice(0, 5).map((p) => p.name)
      };
    }
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
