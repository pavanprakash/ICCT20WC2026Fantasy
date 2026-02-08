import express from "express";
import League from "../models/League.js";
import Team from "../models/Team.js";
import fixtures from "../data/fixtures-2026.js";
import { buildLeagueDashboard } from "../jobs/dailyLeagueUpdate.js";
import { authRequired } from "../middleware/auth.js";

const router = express.Router();

const GROUP_LIMIT = 120;
const FINAL_LIMIT = 45;

function getLastGroupDate() {
  const groupDates = fixtures.filter((f) => f.stage === "Group").map((f) => f.date);
  return groupDates.sort().slice(-1)[0];
}

function getTransferPhase() {
  const today = new Date().toISOString().slice(0, 10);
  const lastGroup = getLastGroupDate();
  return today > lastGroup ? "FINAL" : "GROUP";
}


async function lockTeamForUser(userId) {
  const team = await Team.findOne({ user: userId });
  if (!team) return;
  if (!team.lockedInLeague) {
    const phase = getTransferPhase();
    team.lockedInLeague = true;
    team.transferPhase = phase;
    team.transfersLimit = phase === "GROUP" ? GROUP_LIMIT : FINAL_LIMIT;
    team.transfersUsedTotal = team.transfersUsedTotal ?? 0;
    team.transfersByRound = team.transfersByRound || {};
    team.postGroupResetDone = phase === "FINAL";
    team.submittedAt = team.submittedAt || team.createdAt || new Date();
    await team.save();
  }
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

export default router;
