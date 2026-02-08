import express from "express";
import Team from "../models/Team.js";
import Player from "../models/Player.js";
import League from "../models/League.js";
import fixtures from "../data/fixtures-2026.js";
import { cricapiGet } from "../services/cricapi.js";
import { authRequired } from "../middleware/auth.js";

const router = express.Router();

function calcPoints(player) {
  const runs = player.stats?.runs || 0;
  const wickets = player.stats?.wickets || 0;
  const catches = player.stats?.catches || 0;
  return runs + wickets * 20 + catches * 10;
}

function teamPoints(players) {
  return players.reduce((sum, p) => sum + calcPoints(p), 0);
}

function roundKey() {
  return new Date().toISOString().slice(0, 10);
}

function diffTransfers(oldIds, newIds) {
  const oldSet = new Set(oldIds.map(String));
  return newIds.filter((id) => !oldSet.has(String(id))).length;
}

const GROUP_LIMIT = 120;
const FINAL_LIMIT = 45;
const LOCK_GRACE_MINUTES = 4;

function parseUtc(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  return Date.UTC(Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)) - 1, Number(dateStr.slice(8, 10)), h, m);
}

async function getTodayFirstStartUtc() {
  try {
    const data = await cricapiGet("/matches", {});
    const list = Array.isArray(data?.data) ? data.data : [];
    const today = new Date().toISOString().slice(0, 10);
    const matches = list.filter((m) => {
      const name = `${m?.name || ""} ${m?.series || ""} ${m?.seriesName || ""}`.toLowerCase();
      return name.includes("t20") && name.includes("world cup") && name.includes("2026");
    });
    const todayMatches = matches.map((m) => {
      const dt = m?.dateTimeGMT || m?.dateTime;
      if (!dt) return null;
      const iso = new Date(dt).toISOString();
      const date = iso.slice(0, 10);
      const time = iso.slice(11, 16);
      return { date, time };
    }).filter(Boolean).filter((m) => m.date == today);
    const times = todayMatches.map((m) => parseUtc(m.date, m.time)).filter(Boolean);
    if (times.length) return Math.min(...times);
  } catch (e) {
    // fall back to static fixtures data (no times)
  }
  return null;
}

async function isSubmissionLockedNow() {
  const firstStart = await getTodayFirstStartUtc();
  if (!firstStart) return { locked: false, firstStart: null };
  const now = Date.now();
  const lockUntil = firstStart + LOCK_GRACE_MINUTES * 60 * 1000;
  return { locked: now >= firstStart && now <= lockUntil, firstStart, lockUntil };
}


function getLastGroupDate() {
  const groupDates = fixtures.filter((f) => f.stage === "Group").map((f) => f.date);
  return groupDates.sort().slice(-1)[0];
}

function getTransferPhase() {
  const today = new Date().toISOString().slice(0, 10);
  const lastGroup = getLastGroupDate();
  return today > lastGroup ? "FINAL" : "GROUP";
}

router.get("/leaderboard", async (req, res) => {
  const teams = await Team.find().populate("user", "name email").populate("players").lean();
  const ranked = teams
    .map((t) => ({
      id: t._id,
      name: t.name,
      owner: t.user?.name || "Unknown",
      points: teamPoints(t.players || [])
    }))
    .sort((a, b) => b.points - a.points);
  res.json(ranked);
});

router.get("/me", authRequired, async (req, res) => {
  const team = await Team.findOne({ user: req.user.id }).populate("players").lean();
  if (!team) return res.json(null);

  const phase = team.transferPhase || getTransferPhase();

  res.json({
    id: team._id,
    name: team.name,
    players: team.players,
    points: teamPoints(team.players || []),
    lockedInLeague: team.lockedInLeague || false,
    transfersLimit: team.transfersLimit ?? (phase === "FINAL" ? FINAL_LIMIT : GROUP_LIMIT),
    transfersUsedTotal: team.transfersUsedTotal ?? 0,
    transfersByRound: team.transfersByRound || {},
    transferPhase: phase,
    postGroupResetDone: team.postGroupResetDone || false,
    lastSubmissionDate: team.lastSubmissionDate || null,
    submittedAt: team.submittedAt || team.createdAt
  });
});

router.post("/", authRequired, async (req, res) => {
  const { name, playerIds } = req.body;
  if (!name || !Array.isArray(playerIds)) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const uniqueIds = [...new Set(playerIds)];
  if (uniqueIds.length !== 11) {
    return res.status(400).json({ error: "Pick exactly 11 unique players" });
  }

  const players = await Player.find({ _id: { $in: uniqueIds } }).lean();
  if (players.length !== 11) {
    return res.status(400).json({ error: "Invalid players selected" });
  }

  const byCountry = players.reduce((acc, p) => {
    acc[p.country] = (acc[p.country] || 0) + 1;
    return acc;
  }, {});
  const overLimit = Object.entries(byCountry).find(([, count]) => count > 7);
  if (overLimit) {
    return res.status(400).json({ error: "Max 7 players from the same team" });
  }

  const totalPrice = players.reduce((sum, p) => sum + p.price, 0);
  if (totalPrice > 100) {
    return res.status(400).json({ error: "Budget exceeded (max 100)" });
  }

  const existing = await Team.findOne({ user: req.user.id });
  const phase = getTransferPhase();
  const today = new Date().toISOString().slice(0, 10);
  const lock = await isSubmissionLockedNow();
  if (lock.locked) {
    return res.status(403).json({ error: "Submissions are locked for the first 4 minutes after the first match starts." });
  }

  if (existing) {
    if (existing.lockedInLeague && existing.lastSubmissionDate === today) {
      return res.status(400).json({ error: "You can submit your team only once per day." });
    }
    if (existing.lockedInLeague) {
      if (phase === "FINAL" && !existing.postGroupResetDone) {
        // One-time post-group reset: unlimited transfers before final phase cap applies
        existing.transfersLimit = FINAL_LIMIT;
        existing.transfersUsedTotal = 0;
        existing.transfersByRound = {};
        existing.postGroupResetDone = true;
        existing.transferPhase = "FINAL";
      } else {
        const limit = phase === "GROUP" ? GROUP_LIMIT : FINAL_LIMIT;
        existing.transfersLimit = limit;
        existing.transferPhase = phase;

        const transfersThisAction = diffTransfers(existing.players || [], uniqueIds);
        const used = existing.transfersUsedTotal ?? 0;
        if (used + transfersThisAction > limit) {
          return res.status(400).json({
            error: `Transfer limit reached. Remaining: ${Math.max(0, limit - used)}`
          });
        }
        const key = roundKey();
        const byRound = existing.transfersByRound || {};
        const current = Number(byRound.get ? byRound.get(key) : byRound[key] || 0) || 0;
        if (byRound.set) {
          byRound.set(key, current + transfersThisAction);
        } else {
          byRound[key] = current + transfersThisAction;
        }
        existing.transfersByRound = byRound;
        existing.transfersUsedTotal = used + transfersThisAction;
      }
    }

    existing.name = name;
    existing.players = uniqueIds;
    existing.lastSubmissionDate = today;
    await existing.save();
    return res.json({
      id: existing._id,
      name: existing.name,
      transfersLimit: existing.transfersLimit ?? (phase === "GROUP" ? GROUP_LIMIT : FINAL_LIMIT),
      transfersUsedTotal: existing.transfersUsedTotal ?? 0,
      lockedInLeague: existing.lockedInLeague || false,
      transfersByRound: existing.transfersByRound || {},
      transferPhase: existing.transferPhase || phase,
      postGroupResetDone: existing.postGroupResetDone || false,
      lastSubmissionDate: existing.lastSubmissionDate || null
    });
  }

  const member = await League.exists({ members: req.user.id });
  const transferPhase = phase;
  const team = await Team.create({
    name,
    user: req.user.id,
    players: uniqueIds,
    lockedInLeague: Boolean(member),
    transfersLimit: transferPhase === "GROUP" ? GROUP_LIMIT : FINAL_LIMIT,
    transfersUsedTotal: 0,
    transfersByRound: {},
    transferPhase,
    postGroupResetDone: transferPhase === "FINAL",
    lastSubmissionDate: today,
    submittedAt: new Date()
  });
  res.json({
    id: team._id,
    name: team.name,
    transfersLimit: team.transfersLimit ?? (transferPhase === "GROUP" ? GROUP_LIMIT : FINAL_LIMIT),
    transfersUsedTotal: team.transfersUsedTotal ?? 0,
    lockedInLeague: team.lockedInLeague || false,
    transfersByRound: team.transfersByRound || {},
    transferPhase: team.transferPhase || transferPhase,
    postGroupResetDone: team.postGroupResetDone || false,
    lastSubmissionDate: team.lastSubmissionDate || null
  });
});

export default router;
