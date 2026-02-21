import express from "express";
import League from "../models/League.js";
import Team from "../models/Team.js";
import TeamSubmission from "../models/TeamSubmission.js";
import FantasyMatchPoints from "../models/FantasyMatchPoints.js";
import User from "../models/User.js";
import { cricapiGet } from "../services/cricapi.js";
import fixtures from "../data/fixtures-2026.js";
import { buildLeagueDashboard } from "../jobs/dailyLeagueUpdate.js";
import { authRequired } from "../middleware/auth.js";
import { applySuperSubByLowest } from "../services/superSub.js";

const router = express.Router();

const GROUP_LIMIT = 120;
const SUPER8_LIMIT = 46;
const SERIES_ID = process.env.CRICAPI_SERIES_ID || "0cdf6736-ad9b-4e95-a647-5ee3a99c5510";
const CRICAPI_KEY = process.env.CRICAPI_SERIES_KEY || process.env.CRICAPI_KEY;

function getLastGroupDate() {
  const groupDates = fixtures.filter((f) => f.stage === "Group").map((f) => f.date);
  return groupDates.sort().slice(-1)[0];
}

function getTransferPhase() {
  const today = new Date().toISOString().slice(0, 10);
  const lastGroup = getLastGroupDate();
  return today > lastGroup ? "SUPER8" : "GROUP";
}


async function lockTeamForUser(userId) {
  const team = await Team.findOne({ user: userId });
  if (!team) return;
  if (!team.lockedInLeague) {
    const phase = getTransferPhase();
    team.lockedInLeague = true;
    team.transferPhase = phase;
    team.transfersLimit = phase === "GROUP" ? GROUP_LIMIT : SUPER8_LIMIT;
    team.transfersUsedTotal = team.transfersUsedTotal ?? 0;
    team.transfersByRound = team.transfersByRound || {};
    team.postGroupResetDone = phase === "SUPER8";
    team.submittedAt = team.submittedAt || team.createdAt || new Date();
    await team.save();
  }
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

function fixtureFallback(matchDate, matchStartMs) {
  if (!matchDate && !matchStartMs) return null;
  let dateKey = matchDate;
  let timeKey = null;
  if (matchStartMs) {
    const dt = new Date(matchStartMs);
    if (!Number.isNaN(dt.getTime())) {
      const iso = dt.toISOString();
      dateKey = iso.slice(0, 10);
      timeKey = iso.slice(11, 16);
    }
  }
  const candidates = fixtures.filter((f) => f.date === dateKey);
  if (!candidates.length) return null;
  if (timeKey) {
    const exact = candidates.find((f) => String(f.timeGMT || f.time) === timeKey);
    if (exact) return exact;
  }
  return candidates[0] || null;
}

async function buildMatchMap() {
  if (!CRICAPI_KEY) return new Map();
  const data = await cricapiGet("/series_info", { id: SERIES_ID }, CRICAPI_KEY);
  const list = Array.isArray(data?.data?.matchList) ? data.data.matchList : [];
  const map = new Map();
  for (const match of list) {
    if (!match?.id) continue;
    const team1 = Array.isArray(match?.teams)
      ? match.teams[0]
      : match?.team1 || match?.t1 || null;
    const team2 = Array.isArray(match?.teams)
      ? match.teams[1]
      : match?.team2 || match?.t2 || null;
    const venue =
      match?.venue ||
      match?.venueName ||
      match?.venueInfo?.name ||
      null;
    map.set(String(match.id), {
      name: match?.name || null,
      team1,
      team2,
      venue
    });
  }
  return map;
}

function makeCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

router.post("/", authRequired, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "League name required" });

  let code = makeCode();
  while (await League.findOne({ code })) {
    code = makeCode();
  }

  const league = await League.create({
    name,
    code,
    owner: req.user.id,
    members: [req.user.id]
  });

  await lockTeamForUser(req.user.id);

  res.json({
    id: league._id,
    name: league.name,
    code: league.code
  });
});

router.post("/join", authRequired, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "League code required" });

  const league = await League.findOne({ code: code.toUpperCase() });
  if (!league) return res.status(404).json({ error: "League not found" });

  const alreadyMember = league.members.some((m) => m.toString() === req.user.id);
  if (!alreadyMember) {
    league.members.push(req.user.id);
    await league.save();
  }

  await lockTeamForUser(req.user.id);

  res.json({ id: league._id, name: league.name, code: league.code });
});

router.get("/mine", authRequired, async (req, res) => {
  const leagues = await League.find({ members: req.user.id })
    .select("name code owner")
    .lean();
  res.json(leagues);
});

router.get("/mine/standings", authRequired, async (req, res) => {
  const leagues = await League.find({ members: req.user.id }).lean();
  const dashboards = await Promise.all(
    leagues.map((league) => buildLeagueDashboard(league._id))
  );
  const payload = dashboards
    .filter(Boolean)
    .map((dash) => {
      const standings = dash.standings || [];
      const me = standings.find((row) => String(row.userId) === String(req.user.id));
      return {
        id: dash.id,
        name: dash.name,
        code: dash.code,
        standingsUpdatedAt: dash.standingsUpdatedAt || null,
        myRank: me?.rank ?? null,
        myPoints: me?.points ?? 0,
        myTeamName: me?.teamName ?? "No Team",
        standings
      };
    });
  res.json(payload);
});

router.get("/:id/dashboard", authRequired, async (req, res) => {
  const league = await League.findById(req.params.id).lean();
  if (!league) return res.status(404).json({ error: "League not found" });
  const isMember = league.members?.some((m) => String(m) === String(req.user.id));
  if (!isMember) return res.status(403).json({ error: "Not a league member" });

  const dashboard = await buildLeagueDashboard(req.params.id);
  res.json(dashboard);
});

router.get("/:id/points/:userId", authRequired, async (req, res) => {
  const league = await League.findById(req.params.id).lean();
  if (!league) return res.status(404).json({ error: "League not found" });
  const isMember = league.members?.some((m) => String(m) === String(req.user.id));
  if (!isMember) return res.status(403).json({ error: "Not a league member" });

  const targetId = String(req.params.userId || "");
  const isTargetMember = league.members?.some((m) => String(m) === targetId);
  if (!isTargetMember) return res.status(404).json({ error: "User not in this league" });

  const user = await User.findById(targetId).select("name").lean();

  const submissions = await TeamSubmission.find({ user: targetId })
    .populate("players")
    .populate("captain")
    .populate("viceCaptain")
    .populate("superSub")
    .sort({ matchStartMs: -1, createdAt: -1 })
    .lean();

  const needsMatchMeta = submissions.some((s) => !s.matchName || !s.team1 || !s.team2 || !s.venue);
  const matchMap = needsMatchMeta ? await buildMatchMap() : new Map();

  const matchIds = submissions.map((s) => s.matchId);
  const pointsDocs = await FantasyMatchPoints.find({ matchId: { $in: matchIds } }).lean();
  const pointsMap = new Map(pointsDocs.map((d) => [String(d.matchId), d]));

  const rows = submissions.map((s) => {
    const matchMeta = matchMap.get(String(s.matchId)) || {};
    const fallback = fixtureFallback(s.matchDate, s.matchStartMs);
    const team1 = s.team1 || matchMeta.team1 || fallback?.team1 || null;
    const team2 = s.team2 || matchMeta.team2 || fallback?.team2 || null;
    const venue = s.venue || matchMeta.venue || fallback?.venue || null;
    const matchName =
      s.matchName ||
      matchMeta.name ||
      (team1 && team2 ? `${team1} vs ${team2}` : null);
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
          if (s.booster === "captainx3" && boosterPlayerKey && key === boosterPlayerKey) multiplier *= 3;
        }
        if (capKey && key === capKey) multiplier *= 2;
        else if (vcKey && key === vcKey) multiplier *= 1.5;
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
      matchName,
      team1,
      team2,
      venue,
      booster: s.booster || null,
      boosterPlayer: s.boosterPlayer || null,
      superSub: s.superSub || null,
      superSubUsed: Boolean(applied.superSubUsed),
      totalPoints: total,
      breakdown
    };
  });

  res.json({
    userId: targetId,
    userName: user?.name || "Member",
    leagueName: league.name,
    submissions: rows,
    total: rows.length
  });
});

export default router;
