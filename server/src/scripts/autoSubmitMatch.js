import dotenv from "dotenv";
import mongoose from "mongoose";
import Team from "../models/Team.js";
import TeamSubmission from "../models/TeamSubmission.js";
import { cricapiGet } from "../services/cricapi.js";

dotenv.config();

const MATCH_ID = process.argv[2];
const SERIES_KEY = process.env.CRICAPI_SERIES_KEY || process.env.CRICAPI_KEY;

const parseTeams = (match) => {
  if (match?.t1 || match?.t2) {
    return { team1: match?.t1 || "TBD", team2: match?.t2 || "TBD" };
  }
  if (Array.isArray(match?.teams) && match.teams.length >= 2) {
    return { team1: match.teams[0], team2: match.teams[1] };
  }
  if (Array.isArray(match?.teamInfo) && match.teamInfo.length >= 2) {
    return {
      team1: match.teamInfo[0]?.shortname || match.teamInfo[0]?.name,
      team2: match.teamInfo[1]?.shortname || match.teamInfo[1]?.name
    };
  }
  const name = String(match?.name || "");
  const parts = name.split(" vs ");
  if (parts.length >= 2) {
    return { team1: parts[0].trim(), team2: parts[1].trim() };
  }
  return { team1: "TBD", team2: "TBD" };
};

const matchStartMsFromMatch = (match) => {
  const dt = match?.dateTimeGMT || match?.dateTime;
  if (!dt) return null;
  const ms = new Date(dt).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const matchDateFromMatch = (match) => {
  const dt = match?.dateTimeGMT || match?.dateTime;
  if (!dt) return null;
  const iso = new Date(dt).toISOString();
  return iso.slice(0, 10);
};

async function run() {
  if (!MATCH_ID) {
    throw new Error("Usage: node src/scripts/autoSubmitMatch.js <matchId>");
  }
  if (!SERIES_KEY) {
    throw new Error("CRICAPI_SERIES_KEY or CRICAPI_KEY is not set");
  }
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(mongoUri);

  const matchInfo = await cricapiGet("/match_info", { id: MATCH_ID }, SERIES_KEY);
  const match = matchInfo?.data || {};
  const matchStartMs = matchStartMsFromMatch(match);
  const matchDate = matchDateFromMatch(match);
  if (!matchStartMs) {
    throw new Error("Match start time not found for this match.");
  }
  if (matchStartMs > Date.now()) {
    throw new Error("Match has not started yet.");
  }

  const teams = parseTeams(match);
  const venue =
    match?.venue ||
    match?.venueName ||
    match?.venue?.name ||
    match?.ground ||
    match?.groundName ||
    match?.city ||
    null;

  const existingSubs = await TeamSubmission.find({ matchId: MATCH_ID })
    .select("user matchDate superSub")
    .lean();
  const existingSet = new Set(existingSubs.map((s) => String(s.user)));
  const usedSuperSubByDay = new Set(
    existingSubs
      .filter((s) => s.superSub && s.matchDate)
      .map((s) => `${s.user}-${s.matchDate}`)
  );

  const teamsDocs = await Team.find({})
    .select("user players captain viceCaptain superSub createdAt")
    .lean();

  const priorSubs = await TeamSubmission.find({
    matchStartMs: { $lt: matchStartMs }
  })
    .select("user matchStartMs createdAt players captain viceCaptain booster boosterPlayer superSub")
    .lean();

  const submissionsByUser = new Map();
  for (const sub of priorSubs) {
    const key = String(sub.user);
    const list = submissionsByUser.get(key) || [];
    list.push(sub);
    submissionsByUser.set(key, list);
  }
  for (const list of submissionsByUser.values()) {
    list.sort((a, b) => {
      const aMs = Number(a.matchStartMs || new Date(a.createdAt || 0).getTime());
      const bMs = Number(b.matchStartMs || new Date(b.createdAt || 0).getTime());
      return aMs - bMs;
    });
  }

  const inserts = [];
  for (const team of teamsDocs) {
    if (!Array.isArray(team.players) || team.players.length === 0) continue;
    const teamCreatedAt = team.createdAt ? new Date(team.createdAt).getTime() : null;
    if (teamCreatedAt && matchStartMs < teamCreatedAt) continue;
    if (existingSet.has(String(team.user))) continue;

    const userSubs = submissionsByUser.get(String(team.user)) || [];
    const prevSub = (() => {
      let candidate = null;
      for (const sub of userSubs) {
        const subMs = Number(sub.matchStartMs || new Date(sub.createdAt || 0).getTime());
        if (!Number.isFinite(subMs)) continue;
        if (subMs < matchStartMs) {
          candidate = sub;
        } else {
          break;
        }
      }
      return candidate;
    })();

    const basePlayers = prevSub?.players?.length ? prevSub.players : team.players;
    const baseCaptain = prevSub?.captain || team.captain || null;
    const baseVice = prevSub?.viceCaptain || team.viceCaptain || null;
    const baseSuperSub = prevSub?.superSub || team.superSub || null;

    const superSubAllowed = matchDate
      ? !usedSuperSubByDay.has(`${team.user}-${matchDate}`)
      : true;
    const superSub = superSubAllowed ? baseSuperSub || null : null;

    inserts.push({
      user: team.user,
      team: team._id,
      matchId: MATCH_ID,
      matchStartMs,
      matchDate,
      matchName: match?.name || null,
      team1: teams.team1,
      team2: teams.team2,
      venue,
      players: basePlayers,
      captain: baseCaptain,
      viceCaptain: baseVice,
      booster: null,
      boosterPlayer: null,
      superSub
    });
  }

  if (inserts.length) {
    await TeamSubmission.insertMany(inserts, { ordered: false });
  }

  await mongoose.disconnect();
  console.log(JSON.stringify({ ok: true, matchId: MATCH_ID, autoSubmissions: inserts.length }));
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
