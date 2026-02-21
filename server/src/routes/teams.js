import express from "express";
import Team from "../models/Team.js";
import Player from "../models/Player.js";
import League from "../models/League.js";
import FantasyMatchPoints from "../models/FantasyMatchPoints.js";
import TeamSubmission from "../models/TeamSubmission.js";
import fixtures from "../data/fixtures-2026.js";
import { cricapiGet } from "../services/cricapi.js";
import { authRequired } from "../middleware/auth.js";
import { applySuperSubByLowest } from "../services/superSub.js";

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

function getPlayerNameById(players, idOrObj) {
  if (!idOrObj || !Array.isArray(players)) return null;
  const id = idOrObj?._id || idOrObj;
  const found = players.find((p) => String(p._id) === String(id));
  return found?.name || null;
}

const applySuperSub = applySuperSubByLowest;

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
    total += totalWithCaptaincy(
      filtered,
      team?.captain?.name,
      team?.viceCaptain?.name,
      null,
      new Map(),
      null
    );
  }
  return total;
}

async function teamPointsFromSubmissions(userId) {
  const submissions = await TeamSubmission.find({ user: userId })
    .populate("players")
    .populate("captain")
    .populate("viceCaptain")
    .populate("superSub")
    .lean();
  if (!submissions.length) return 0;
  const matchIds = submissions.map((s) => s.matchId);
  const pointsDocs = await FantasyMatchPoints.find({ matchId: { $in: matchIds } }).lean();
  const pointsMap = new Map(pointsDocs.map((d) => [String(d.matchId), d]));
  let total = 0;
  for (const s of submissions) {
    const pointsDoc = pointsMap.get(String(s.matchId)) || {};
    const points = Array.isArray(pointsDoc.points) ? pointsDoc.points : [];
    const applied = applySuperSub(s, pointsDoc);
    const boosterPlayerName = getPlayerNameById(s.players, s.boosterPlayer);
    const boosterPlayerKey = normalizeName(boosterPlayerName);
    const filtered = points.filter((p) => applied.nameSet.has(normalizeName(p.name)));
    total += totalWithCaptaincy(
      filtered,
      applied.capName,
      applied.vcName,
      s.booster,
      applied.roleByName,
      boosterPlayerKey || null
    );
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
const SUPER8_LIMIT = 46;
const LOCK_BEFORE_SECONDS = 5;
const LOCK_AFTER_MINUTES = 5;
const SERIES_ID = process.env.CRICAPI_SERIES_ID || "0cdf6736-ad9b-4e95-a647-5ee3a99c5510";
const FIRST_SUPER8_DATE = "2026-02-21";
const FIRST_SUPER8_START_MS = Date.UTC(2026, 1, 21, 13, 30, 0, 0);
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

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return null;
}

function parseTeams(match) {
  const teamInfo = Array.isArray(match?.teamInfo) ? match.teamInfo : [];
  const infoTeams = teamInfo
    .map((t) => firstText(t?.name, t?.shortname, t?.shortName, t?.teamName))
    .filter(Boolean);
  const teamsArray = Array.isArray(match?.teams) ? match.teams : [];
  const teamsFromArray = teamsArray
    .map((t) => (typeof t === "string" ? t : firstText(t?.name, t?.shortname, t?.shortName)))
    .filter(Boolean);

  const team1 = firstText(
    match?.t1,
    match?.team1,
    match?.team1Name,
    match?.teamA,
    infoTeams[0],
    teamsFromArray[0]
  );
  const team2 = firstText(
    match?.t2,
    match?.team2,
    match?.team2Name,
    match?.teamB,
    infoTeams[1],
    teamsFromArray[1]
  );

  return { team1, team2 };
}

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
  const { team1, team2 } = parseTeams(match);
  const fallbackName = team1 && team2 ? `${team1} v ${team2}` : null;
  return {
    id:
      match?.id ||
      match?.match_id ||
      match?.matchId ||
      match?.unique_id ||
      `${match?.series || match?.seriesName || "series"}-${dt}-${match?.name || "match"}`,
    name: firstText(match?.name, fallbackName),
    team1,
    team2,
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
  return today > lastGroup ? "SUPER8" : "GROUP";
}

function getCurrentTransferState(nextMatchDate = null) {
  const phase = getTransferPhase();
  const now = Date.now();
  const inferredSuper8 = (nextMatchDate && String(nextMatchDate) >= FIRST_SUPER8_DATE) || phase === "SUPER8";
  if (inferredSuper8 && now < FIRST_SUPER8_START_MS) {
    return "SUPER8_PRE";
  }
  if (inferredSuper8) return "SUPER8";
  return phase;
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

  const phase =
    team.transferPhase === "SUPER8_PRE" && Date.now() < FIRST_SUPER8_START_MS
      ? "SUPER8_PRE"
      : getCurrentTransferState(team.submittedForDate || null);
  const needsSuper8Reset =
    (phase === "SUPER8_PRE" || phase === "SUPER8") &&
    !team.postGroupResetDone;

  let transfersLimit = team.transfersLimit ?? (phase === "GROUP" ? GROUP_LIMIT : SUPER8_LIMIT);
  let transfersUsedTotal = team.transfersUsedTotal ?? 0;
  let transfersByRound = team.transfersByRound || {};
  let transferPhase = phase;
  let postGroupResetDone = team.postGroupResetDone || false;

  // Backfill existing users lazily when they load team data in Super 8 window.
  if (needsSuper8Reset) {
    transfersLimit = SUPER8_LIMIT;
    transfersUsedTotal = 0;
    transfersByRound = {};
    transferPhase = phase;
    postGroupResetDone = true;
    await Team.updateOne(
      { _id: team._id },
      {
        $set: {
          transfersLimit,
          transfersUsedTotal,
          transfersByRound,
          transferPhase,
          postGroupResetDone
        }
      }
    );
  }

  res.json({
    id: team._id,
    name: team.name,
    players: team.players,
    points: teamPoints(team.players || []),
    lockedInLeague: team.lockedInLeague || false,
    transfersLimit,
    transfersUsedTotal,
    transfersByRound,
    transferPhase,
    postGroupResetDone,
    boosterUsed: team.boosterUsed || false,
    boosterType: team.boosterType || null,
    usedBoosters: team.usedBoosters || [],
    boosterPlayer: team.boosterPlayer || null,
    superSub: team.superSub || null,
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
  const { name, playerIds, captainId, viceCaptainId, booster, boosterPlayerId, superSubId, nextMatch: clientNextMatch } = req.body;
  if (!name || !Array.isArray(playerIds)) {
    return res.status(400).json({ error: "Missing fields" });
  }
  const boosterType = booster ? String(booster).toLowerCase() : null;
  if (boosterType && boosterType !== "batsman" && boosterType !== "bowler" && boosterType !== "wk" && boosterType !== "allrounder" && boosterType !== "teamx2" && boosterType !== "captainx3") {
    return res.status(400).json({ error: "Invalid booster selection" });
  }
  const uniqueIds = [...new Set(playerIds)];

  if (boosterType === "captainx3") {
    if (!boosterPlayerId) {
      return res.status(400).json({ error: "Select a player for CAPTAIN X3 booster." });
    }
    const inXi = uniqueIds.map(String).includes(String(boosterPlayerId));
    if (!inXi) {
      return res.status(400).json({ error: "CAPTAIN X3 player must be in your XI." });
    }
    if (String(boosterPlayerId) === String(captainId) || String(boosterPlayerId) === String(viceCaptainId)) {
      return res.status(400).json({ error: "CAPTAIN X3 player cannot be captain or vice-captain." });
    }
  }

  if (uniqueIds.length !== 11) {
    return res.status(400).json({ error: "Pick exactly 11 unique players" });
  }

  const players = await Player.find({ _id: { $in: uniqueIds } }).lean();
  if (players.length !== 11) {
    return res.status(400).json({ error: "Invalid players selected" });
  }
  let superSub = null;
  if (superSubId) {
    const superSubIdStr = String(superSubId);
    if (uniqueIds.map(String).includes(superSubIdStr)) {
      return res.status(400).json({ error: "Super Sub must not be in your XI." });
    }
    if (String(captainId) === superSubIdStr || String(viceCaptainId) === superSubIdStr) {
      return res.status(400).json({ error: "Super Sub cannot be captain or vice-captain." });
    }
    superSub = await Player.findById(superSubIdStr).lean();
    if (!superSub) {
      return res.status(400).json({ error: "Invalid Super Sub selection." });
    }
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
  if (totalPrice > 100) {
    return res.status(400).json({ error: "Budget exceeded (max 100)" });
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
  const phase = getCurrentTransferState(window.nextMatch?.date || null);
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
  if (existing?.submittedForMatchId && existing.submittedForMatchId === window.nextMatch.id) {
    if (window.locked) {
      return res.status(400).json({ error: "You have already submitted your team for the upcoming match." });
    }
  }

  if (superSub && window.nextMatch?.date) {
    const alreadyUsed = await TeamSubmission.exists({
      user: req.user.id,
      matchDate: window.nextMatch.date,
      superSub: { $ne: null },
      matchId: { $ne: window.nextMatch.id }
    });
    if (alreadyUsed) {
      return res.status(400).json({ error: "Super Sub already used for this match day." });
    }
  }

  const member = await League.exists({ members: req.user.id });

  if (existing) {
    if (!existing.lockedInLeague && member) {
      existing.lockedInLeague = true;
    }
    const usedBoosters = Array.isArray(existing.usedBoosters) ? existing.usedBoosters : [];
    if (boosterType && usedBoosters.includes(boosterType)) {
      return res.status(400).json({ error: "Booster already used for this tournament." });
    }
    if (existing.lockedInLeague) {
      if (inFirstSubmissionWindow) {
        // Free changes before the first submitted match starts; no transfers counted.
      } else if (phase === "SUPER8_PRE") {
        // Unlimited transfers before first Super 8 fixture starts.
        if (!existing.postGroupResetDone) {
          existing.transfersUsedTotal = 0;
          existing.transfersByRound = {};
          existing.postGroupResetDone = true;
        }
        existing.transfersLimit = SUPER8_LIMIT;
        existing.transferPhase = "SUPER8_PRE";
      } else {
        if (phase === "SUPER8" && !existing.postGroupResetDone) {
          existing.transfersUsedTotal = 0;
          existing.transfersByRound = {};
          existing.postGroupResetDone = true;
        }
        const limit = phase === "GROUP" ? GROUP_LIMIT : SUPER8_LIMIT;
        existing.transfersLimit = limit;
        existing.transferPhase = phase;

        const transfersThisAction = diffTransfers(existing.players || [], uniqueIds);
        const used = existing.transfersUsedTotal ?? 0;
        if (used + transfersThisAction > limit) {
          return res.status(400).json({
            error: "You have maxed out the number of allowed transfers for this round!"
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
    existing.superSub = superSub ? superSub._id : null;
    if (boosterType) {
      existing.boosterUsed = true;
      existing.boosterType = boosterType;
      existing.usedBoosters = Array.from(new Set([...(usedBoosters || []), boosterType]));
      existing.boosterPlayer = boosterType === "captainx3" ? boosterPlayerId : null;
    }
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
        booster: boosterType,
        boosterPlayer: boosterType === "captainx3" ? boosterPlayerId : null,
        superSub: superSub ? superSub._id : null,
        captain: captainId,
        viceCaptain: viceCaptainId
      },
      { upsert: true, new: true }
    );

    return res.json({
      id: existing._id,
      name: existing.name,
      transfersLimit: existing.transfersLimit ?? (phase === "GROUP" ? GROUP_LIMIT : SUPER8_LIMIT),
      transfersUsedTotal: existing.transfersUsedTotal ?? 0,
      lockedInLeague: existing.lockedInLeague || false,
      transfersByRound: existing.transfersByRound || {},
      transferPhase: existing.transferPhase || phase,
      postGroupResetDone: existing.postGroupResetDone || false,
      boosterUsed: existing.boosterUsed || false,
      boosterType: existing.boosterType || null,
      usedBoosters: existing.usedBoosters || [],
      boosterPlayer: existing.boosterPlayer || null,
      superSub: existing.superSub || null,
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
    transfersLimit: transferPhase === "GROUP" ? GROUP_LIMIT : SUPER8_LIMIT,
    transfersUsedTotal: 0,
    transfersByRound: {},
    transferPhase,
    postGroupResetDone: transferPhase === "SUPER8" || transferPhase === "SUPER8_PRE",
    boosterUsed: Boolean(boosterType),
    boosterType: boosterType || null,
    usedBoosters: boosterType ? [boosterType] : [],
    boosterPlayer: boosterType === "captainx3" ? boosterPlayerId : null,
    superSub: superSub ? superSub._id : null,
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
      booster: boosterType,
      boosterPlayer: boosterType === "captainx3" ? boosterPlayerId : null,
      superSub: superSub ? superSub._id : null,
      captain: captainId,
      viceCaptain: viceCaptainId
    },
    { upsert: true, new: true }
  );
  res.json({
    id: team._id,
    name: team.name,
    transfersLimit: team.transfersLimit ?? (transferPhase === "GROUP" ? GROUP_LIMIT : SUPER8_LIMIT),
    transfersUsedTotal: team.transfersUsedTotal ?? 0,
    lockedInLeague: team.lockedInLeague || false,
    transfersByRound: team.transfersByRound || {},
    transferPhase: team.transferPhase || transferPhase,
    postGroupResetDone: team.postGroupResetDone || false,
    boosterUsed: team.boosterUsed || false,
    boosterType: team.boosterType || null,
    usedBoosters: team.usedBoosters || [],
    boosterPlayer: team.boosterPlayer || null,
    superSub: team.superSub || null,
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
