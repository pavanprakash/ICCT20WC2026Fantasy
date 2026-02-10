import "dotenv/config";
import mongoose from "mongoose";
import Team from "../models/Team.js";
import TeamSubmission from "../models/TeamSubmission.js";
import { cricapiGet } from "../services/cricapi.js";
import "../models/Player.js";

const SERIES_ID = process.env.CRICAPI_SERIES_ID || "0cdf6736-ad9b-4e95-a647-5ee3a99c5510";
const KEY = process.env.CRICAPI_SERIES_KEY || process.env.CRICAPI_KEY;

const normalize = (value) => String(value || "").toLowerCase();

const getArg = (name) => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((val) => val.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
};

const isCompleted = (match) => {
  const status = normalize(match?.matchStatus || match?.status || "");
  return /match ended|result|won|abandoned|no result|draw|tied|complete|completed|match over|finished/.test(status);
};

const parseMatch = (match) => {
  const dt = match?.dateTimeGMT || match?.dateTime;
  if (!dt) return null;
  const date = new Date(dt);
  if (Number.isNaN(date.getTime())) return null;
  const iso = date.toISOString();
  return {
    id: match?.id || match?.match_id || match?.matchId || match?.unique_id,
    name: match?.name || null,
    date: iso.slice(0, 10),
    timeGMT: iso.slice(11, 16),
    startMs: date.getTime(),
    venue: match?.venue || match?.venueName || null,
    team1: Array.isArray(match?.teams) ? match.teams[0] : match?.team1 || null,
    team2: Array.isArray(match?.teams) ? match.teams[1] : match?.team2 || null
  };
};

async function getEarliestMatchTodayUtc() {
  const data = await cricapiGet("/series_info", { id: SERIES_ID }, KEY);
  const raw =
    data?.data?.matchList ||
    data?.data?.matches ||
    data?.data?.match ||
    [];
  const list = Array.isArray(raw) ? raw : [];
  const today = new Date().toISOString().slice(0, 10);
  const todays = list
    .filter((m) => !isCompleted(m))
    .map(parseMatch)
    .filter(Boolean)
    .filter((m) => m.date === today)
    .sort((a, b) => a.startMs - b.startMs);
  return todays[0] || null;
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }
  await mongoose.connect(process.env.MONGODB_URI);

  const matchIdOverride = getArg("matchId");
  const force = String(getArg("force") || "").toLowerCase() === "true";
  let match = await getEarliestMatchTodayUtc();
  if (matchIdOverride) {
    const data = await cricapiGet("/series_info", { id: SERIES_ID }, KEY);
    const raw =
      data?.data?.matchList ||
      data?.data?.matches ||
      data?.data?.match ||
      [];
    const list = Array.isArray(raw) ? raw : [];
    const found = list.map(parseMatch).filter(Boolean).find((m) => m.id === matchIdOverride);
    if (found) {
      match = found;
    }
  }
  if (!match) {
    console.log("No eligible match found for today.");
    await mongoose.disconnect();
    return;
  }

  const teams = await Team.find({})
    .populate("players")
    .populate("captain")
    .populate("viceCaptain")
    .lean();

  let created = 0;
  let skipped = 0;

  for (const team of teams) {
    if (!team.captain || !team.viceCaptain) {
      skipped += 1;
      continue;
    }
    const existing = await TeamSubmission.findOne({ user: team.user, matchId: match.id });
    if (existing && !force) {
      skipped += 1;
      continue;
    }
    await TeamSubmission.findOneAndUpdate(
      { user: team.user, matchId: match.id },
      {
      user: team.user,
      team: team._id,
      matchId: match.id,
      matchStartMs: match.startMs,
      matchDate: match.date,
      matchName: match.name,
      team1: match.team1,
      team2: match.team2,
      venue: match.venue,
      players: team.players.map((p) => p._id),
      captain: team.captain._id,
      viceCaptain: team.viceCaptain._id
      },
      { upsert: true, new: true }
    );
    created += 1;
  }

  console.log(JSON.stringify({ matchId: match.id, matchDate: match.date, created, skipped }));
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
