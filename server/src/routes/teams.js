import express from "express";
import Team from "../models/Team.js";
import Player from "../models/Player.js";
import League from "../models/League.js";
import FantasyMatchPoints from "../models/FantasyMatchPoints.js";
import TeamSubmission from "../models/TeamSubmission.js";
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

async function teamPointsSince(team) {
  const players = team?.players || [];
  if (!players.length) return 0;
  const startMs = team?.submittedForMatchStart
    ? new Date(team.submittedForMatchStart).getTime()
    : null;
  if (!Number.isFinite(startMs)) {
    return teamPoints(players);
  }
  const nameSet = new Set(players.map((p) => normalizeName(p.name)));
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
    total += totalWithCaptaincy(filtered, team?.captain?.name, team?.viceCaptain?.name);
  }
  return total;
}

async function teamPointsFromSubmissions(userId) {
  const submissions = await TeamSubmission.find({ user: userId })
    .populate("players")
    .populate("captain")
    .populate("viceCaptain")
    .lean();
  if (!submissions.length) return 0;
  const matchIds = submissions.map((s) => s.matchId);
  const pointsDocs = await FantasyMatchPoints.find({ matchId: { $in: matchIds } }).lean();
  const pointsMap = new Map(pointsDocs.map((d) => [String(d.matchId), d.points || []]));
  let total = 0;
  for (const s of submissions) {
    const points = pointsMap.get(String(s.matchId)) || [];
    const nameSet = new Set((s.players || []).map((p) => normalizeName(p.name)));
    const filtered = points.filter((p) => nameSet.has(normalizeName(p.name)));
    total += totalWithCaptaincy(filtered, s.captain?.name, s.viceCaptain?.name);
  }
  return total;
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
const LOCK_BEFORE_SECONDS = 5;
const LOCK_AFTER_MINUTES = 5;
const SERIES_ID = process.env.CRICAPI_SERIES_ID || "0cdf6736-ad9b-4e95-a647-5ee3a99c5510";
const ROLE_LIMITS = {
  bat: 5,
  bowl: 5,
  wk: 4,
  ar: 4
};
const ROLE_MIN = {
  bat: 3,
  bowl: 3,
  wk: 1,
  ar: 1
};

const normalize = (value) => String(value || "").toLowerCase();

function parseUtc(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  return Date.UTC(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(5, 7)) - 1,
    Number(dateStr.slice(8, 10)),
    h,
    m
  );
}

function isTargetMatch(match) {
  const seriesId = String(match?.series_id || match?.seriesId || "");
  if (seriesId && seriesId === SERIES_ID) return true;
  const hay = [
    match?.name,
    match?.series,
    match?.seriesName,
    match?.matchType,
    match?.matchTypeLower,
    match?.status
  ]
    .filter(Boolean)
    .join(" ");
  const norm = normalize(hay);
  const hasT20 = /t20/.test(norm);
  const hasWC = /world cup/.test(norm);
  const dateText = `${match?.dateTime || ""} ${match?.dateTimeGMT || ""} ${match?.date || ""}`;
  const has2026 = /2026/.test(norm) || /2026/.test(dateText);
  return hasT20 && hasWC && has2026;
}

function parseMatchStart(match) {
  const dt = match?.dateTimeGMT || match?.dateTime;
  if (!dt) return null;
  const date = new Date(dt);
  if (Number.isNaN(date.getTime())) return null;
  const iso = date.toISOString();
  return {
    id:
      match?.id ||
      match?.match_id ||
      match?.matchId ||
      match?.unique_id ||
      `${match?.series || match?.seriesName || "series"}-${dt}-${match?.name || "match"}`,
    name: match?.name || null,
    date: iso.slice(0, 10),
    timeGMT: iso.slice(11, 16),
    startMs: date.getTime()
  };
}

function nextFixtureDateUtc() {
  const today = new Date().toISOString().slice(0, 10);
  const dates = fixtures.map((f) => f.date);
  const unique = Array.from(new Set(dates)).filter((d) => d > today).sort();
  return unique[0] || today;
}

async function getSeriesMatches() {
  const key = process.env.CRICAPI_SERIES_KEY || process.env.CRICAPI_KEY;
  const data = await cricapiGet("/cricScore", {}, key);
  const list = Array.isArray(data?.data) ? data.data : [];
  return list
    .filter(isTargetMatch)
    .filter((m) => {
      const ms = normalize(m?.ms || m?.matchStatus || m?.status || "");
      return ms === "fixture" || ms === "scheduled" || ms === "upcoming";
    })
    .map(parseMatchStart)
    .filter((m) => m && m.id && Number.isFinite(m.startMs))
    .sort((a, b) => a.startMs - b.startMs);
}

router.get("/upcoming", async (req, res) => {
  try {
    if (req.query?.debug) {
      const key = process.env.CRICAPI_SERIES_KEY || process.env.CRICAPI_KEY;
      const data = await cricapiGet("/cricScore", {}, key);
      const list = Array.isArray(data?.data) ? data.data : [];
      return res.json({
        totalRaw: list.length,
        sampleRaw: list.slice(0, 5)
      });
    }
    const matches = await getSeriesMatches();
    res.json({
      total: matches.length,
      sample: matches.slice(0, 3)
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

function getSubmissionWindow(matches, now = Date.now()) {
  const lockBeforeMs = LOCK_BEFORE_SECONDS * 1000;
  const lockAfterMs = LOCK_AFTER_MINUTES * 60 * 1000;
  const lockMatch = matches.find(
    (m) => now >= m.startMs - lockBeforeMs && now <= m.startMs + lockAfterMs
  );
  const nextMatch = matches.find((m) => m.startMs > now);
  return { locked: Boolean(lockMatch), lockMatch, nextMatch };
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
  const teams = await Team.find()
    .populate("user", "name email")
    .populate("players")
    .populate("captain")
    .populate("viceCaptain")
    .lean();
  const visible = teams.filter((t) => t.user);
  const rankedRaw = await Promise.all(
    visible.map(async (t) => ({
      id: t._id,
      name: t.name,
      owner: t.user?.name || "Unknown",
      points: await teamPointsFromSubmissions(t.user?._id)
    }))
  );
  const ranked = rankedRaw.sort((a, b) => b.points - a.points);
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
    submittedForDate: team.submittedForDate || null,
    submittedForMatchId: team.submittedForMatchId || null,
    submittedForMatchStart: team.submittedForMatchStart || null,
    firstSubmittedMatchStart: team.firstSubmittedMatchStart || null,
    submittedAt: team.submittedAt || team.createdAt,
    captain: team.captain || null,
    viceCaptain: team.viceCaptain || null
  });
});

router.post("/", authRequired, async (req, res) => {
  const { name, playerIds, captainId, viceCaptainId, nextMatch: clientNextMatch } = req.body;
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

  if (!captainId || !viceCaptainId) {
    return res.status(400).json({ error: "Captain and vice-captain are required" });
  }
  if (String(captainId) === String(viceCaptainId)) {
    return res.status(400).json({ error: "Captain and vice-captain must be different" });
  }
  const idSet = new Set(uniqueIds.map(String));
  if (!idSet.has(String(captainId)) || !idSet.has(String(viceCaptainId))) {
    return res.status(400).json({ error: "Captain and vice-captain must be in your XI" });
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
  if (totalPrice > 90) {
    return res.status(400).json({ error: "Budget exceeded (max 90)" });
  }

  const roleCounts = players.reduce(
    (acc, p) => {
      const role = String(p.role || "").toLowerCase();
      if (role.includes("wk") || role.includes("keeper")) acc.wk += 1;
      else if (role.includes("all")) acc.ar += 1;
      else if (role.includes("bowl")) acc.bowl += 1;
      else acc.bat += 1;
      return acc;
    },
    { bat: 0, bowl: 0, wk: 0, ar: 0 }
  );
  if (roleCounts.bat > ROLE_LIMITS.bat ||
      roleCounts.bowl > ROLE_LIMITS.bowl ||
      roleCounts.wk > ROLE_LIMITS.wk ||
      roleCounts.ar > ROLE_LIMITS.ar) {
    return res.status(400).json({
      error: "Formation limits exceeded (max 5 batters, 5 bowlers, 4 wicket-keepers, 4 all-rounders)."
    });
  }
  if (roleCounts.bat < ROLE_MIN.bat ||
      roleCounts.bowl < ROLE_MIN.bowl ||
      roleCounts.wk < ROLE_MIN.wk ||
      roleCounts.ar < ROLE_MIN.ar) {
    return res.status(400).json({
      error: "Formation limits not met (min 3 batters, 3 bowlers, 1 wicket-keeper, 1 all-rounder)."
    });
  }

  const existing = await Team.findOne({ user: req.user.id });
  const phase = getTransferPhase();
  const today = new Date().toISOString().slice(0, 10);
  const matches = await getSeriesMatches();
  const window = getSubmissionWindow(matches);
  const clientStartMs = clientNextMatch?.startMs ? Number(clientNextMatch.startMs) : null;
  const clientFallback =
    clientNextMatch && Number.isFinite(clientStartMs)
      ? {
          id: String(clientNextMatch.id || `client-${clientStartMs}`),
          startMs: clientStartMs,
          date: clientNextMatch.date || new Date(clientStartMs).toISOString().slice(0, 10)
        }
      : null;
  if (!window.nextMatch && clientFallback) {
    window.nextMatch = clientFallback;
  }
  if (!window.lockMatch && clientFallback) {
    const nowMs = Date.now();
    if (nowMs >= clientFallback.startMs - LOCK_BEFORE_SECONDS * 1000 &&
        nowMs <= clientFallback.startMs + LOCK_AFTER_MINUTES * 60 * 1000) {
      window.lockMatch = clientFallback;
      window.locked = true;
    }
  }
  const now = Date.now();
  const earliestStartMs = window.nextMatch?.startMs
    ? Number(window.nextMatch.startMs)
    : null;
  const firstMatchStartMs = existing?.firstSubmittedMatchStart
    ? new Date(existing.firstSubmittedMatchStart).getTime()
    : (existing?.submittedForMatchStart ? new Date(existing.submittedForMatchStart).getTime() : null);
  const inFirstSubmissionWindow =
    Number.isFinite(firstMatchStartMs)
      ? now < firstMatchStartMs && (existing?.transfersUsedTotal ?? 0) === 0
      : Number.isFinite(earliestStartMs) &&
        now < earliestStartMs &&
        (existing?.transfersUsedTotal ?? 0) === 0;
  if (window.locked) {
    return res.status(403).json({
      error: "Submissions are locked from 5 seconds before match start until 5 minutes after it starts."
    });
  }
  if (!window.nextMatch) {
    return res.status(403).json({ error: "No upcoming matches available for submission." });
  }
  if (
    existing?.submittedForMatchId &&
    existing.submittedForMatchId === window.nextMatch.id &&
    !inFirstSubmissionWindow
  ) {
    return res.status(400).json({ error: "You have already submitted your team for the upcoming match." });
  }

  const member = await League.exists({ members: req.user.id });

  if (existing) {
    if (!existing.lockedInLeague && member) {
      existing.lockedInLeague = true;
    }
    if (existing.lockedInLeague) {
      if (inFirstSubmissionWindow) {
        // Free changes before the first submitted match starts; no transfers counted.
      } else if (phase === "FINAL" && !existing.postGroupResetDone) {
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

    const priorSubmittedStart = existing.submittedForMatchStart
      ? new Date(existing.submittedForMatchStart)
      : null;
    existing.name = name;
    existing.players = uniqueIds;
    existing.captain = captainId;
    existing.viceCaptain = viceCaptainId;
    existing.lastSubmissionDate = today;
    existing.submittedForDate = window.nextMatch.date || today;
    existing.submittedForMatchId = window.nextMatch.id;
    existing.submittedForMatchStart = new Date(window.nextMatch.startMs);
    if (!existing.firstSubmittedMatchStart) {
      if (priorSubmittedStart) {
        existing.firstSubmittedMatchStart = priorSubmittedStart;
      } else if (Number.isFinite(earliestStartMs)) {
        existing.firstSubmittedMatchStart = new Date(earliestStartMs);
      }
    }
    await existing.save();

    // Upsert submission for this match (keeps latest XI if resubmitted before start).
    await TeamSubmission.findOneAndUpdate(
      { user: req.user.id, matchId: window.nextMatch.id },
      {
        user: req.user.id,
        team: existing._id,
        matchId: window.nextMatch.id,
        matchStartMs: window.nextMatch.startMs,
        matchDate: window.nextMatch.date || today,
        matchName: clientNextMatch?.name || null,
        team1: clientNextMatch?.team1 || null,
        team2: clientNextMatch?.team2 || null,
        venue: clientNextMatch?.venue || null,
        players: uniqueIds,
        captain: captainId,
        viceCaptain: viceCaptainId
      },
      { upsert: true, new: true }
    );

    return res.json({
      id: existing._id,
      name: existing.name,
      transfersLimit: existing.transfersLimit ?? (phase === "GROUP" ? GROUP_LIMIT : FINAL_LIMIT),
      transfersUsedTotal: existing.transfersUsedTotal ?? 0,
      lockedInLeague: existing.lockedInLeague || false,
      transfersByRound: existing.transfersByRound || {},
      transferPhase: existing.transferPhase || phase,
      postGroupResetDone: existing.postGroupResetDone || false,
      lastSubmissionDate: existing.lastSubmissionDate || null,
      submittedForDate: existing.submittedForDate || null,
      submittedForMatchId: existing.submittedForMatchId || null,
      submittedForMatchStart: existing.submittedForMatchStart || null,
      firstSubmittedMatchStart: existing.firstSubmittedMatchStart || null,
      captain: existing.captain || null,
      viceCaptain: existing.viceCaptain || null
    });
  }

  const transferPhase = phase;
  const team = await Team.create({
    name,
    user: req.user.id,
    players: uniqueIds,
    captain: captainId,
    viceCaptain: viceCaptainId,
    lockedInLeague: Boolean(member),
    transfersLimit: transferPhase === "GROUP" ? GROUP_LIMIT : FINAL_LIMIT,
    transfersUsedTotal: 0,
    transfersByRound: {},
    transferPhase,
    postGroupResetDone: transferPhase === "FINAL",
    lastSubmissionDate: today,
    submittedForDate: window.nextMatch.date || today,
    submittedForMatchId: window.nextMatch.id,
    submittedForMatchStart: new Date(window.nextMatch.startMs),
    submittedAt: new Date(),
    firstSubmittedMatchStart: Number.isFinite(earliestStartMs) ? new Date(earliestStartMs) : null
  });

  await TeamSubmission.findOneAndUpdate(
    { user: req.user.id, matchId: window.nextMatch.id },
    {
      user: req.user.id,
      team: team._id,
      matchId: window.nextMatch.id,
      matchStartMs: window.nextMatch.startMs,
      matchDate: window.nextMatch.date || today,
      matchName: clientNextMatch?.name || null,
      team1: clientNextMatch?.team1 || null,
      team2: clientNextMatch?.team2 || null,
      venue: clientNextMatch?.venue || null,
      players: uniqueIds,
      captain: captainId,
      viceCaptain: viceCaptainId
    },
    { upsert: true, new: true }
  );
  res.json({
    id: team._id,
    name: team.name,
    transfersLimit: team.transfersLimit ?? (transferPhase === "GROUP" ? GROUP_LIMIT : FINAL_LIMIT),
    transfersUsedTotal: team.transfersUsedTotal ?? 0,
    lockedInLeague: team.lockedInLeague || false,
    transfersByRound: team.transfersByRound || {},
    transferPhase: team.transferPhase || transferPhase,
    postGroupResetDone: team.postGroupResetDone || false,
    lastSubmissionDate: team.lastSubmissionDate || null,
    submittedForDate: team.submittedForDate || null,
    submittedForMatchId: team.submittedForMatchId || null,
    submittedForMatchStart: team.submittedForMatchStart || null,
    firstSubmittedMatchStart: team.firstSubmittedMatchStart || null,
    captain: team.captain || null,
    viceCaptain: team.viceCaptain || null
  });
});

export default router;
