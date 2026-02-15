import dotenv from "dotenv";
import mongoose from "mongoose";
import FantasyRule from "../models/FantasyRule.js";
import FantasyMatchPoints from "../models/FantasyMatchPoints.js";
import Player from "../models/Player.js";
import { cricapiGet, cricapiGetScorecardSafe } from "../services/cricapi.js";
import { applyPlayingXIPoints, calculateMatchPoints, DEFAULT_RULESET } from "../services/fantasyScoring.js";
import { getPlayingXI } from "../services/playingXI.js";

dotenv.config();

const MATCH_ID = process.argv[2];
const SCORECARD_KEY = process.env.CRICAPI_SERIES_KEY || process.env.CRICAPI_KEY;

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

async function ensureRules() {
  const existing = await FantasyRule.findOne({ name: DEFAULT_RULESET.name });
  if (!existing) {
    await FantasyRule.create(DEFAULT_RULESET);
  }
}

async function run() {
  if (!MATCH_ID) throw new Error("Usage: node src/scripts/syncSingleMatch.js <matchId>");
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");
  if (!SCORECARD_KEY) throw new Error("CRICAPI_KEY is not set");

  await mongoose.connect(mongoUri);
  await ensureRules();
  const rules = await FantasyRule.findOne({ name: DEFAULT_RULESET.name }).lean();

  const matchInfo = await cricapiGet("/match_info", { id: MATCH_ID }, SCORECARD_KEY);
  const matchData = matchInfo?.data || {};

  const safe = await cricapiGetScorecardSafe(MATCH_ID, SCORECARD_KEY);
  if (safe.skipped) {
    throw new Error(`Scorecard not available: ${safe.reason || "unknown"}`);
  }
  const scoreRoot =
    safe.data?.data ||
    safe.data?.scorecard ||
    safe.data?.innings ||
    safe.data;
  const scorecard = scoreRoot?.scorecard || scoreRoot?.innings || scoreRoot;
  const playingXI = getPlayingXI(scoreRoot);
  const playingXIBonus = Number(rules?.additional?.playingXI ?? 2);
  const points = applyPlayingXIPoints(
    calculateMatchPoints(scorecard, rules),
    playingXI,
    playingXIBonus
  );
  if (!points.length) {
    throw new Error("No points computed from scorecard.");
  }

  const matchDate = matchDateFromMatch(matchData);
  const matchStartMs = matchStartMsFromMatch(matchData);
  await FantasyMatchPoints.findOneAndUpdate(
    { matchId: MATCH_ID, ruleset: rules.name },
    { matchId: MATCH_ID, matchDate, matchStartMs, ruleset: rules.name, points, playingXI },
    { upsert: true, new: true }
  );

  const aggregate = new Map();
  const allMatchPoints = await FantasyMatchPoints.find({ ruleset: rules.name }).lean();
  for (const doc of allMatchPoints) {
    for (const p of doc.points || []) {
      const key = normalizeName(p.name);
      const current = aggregate.get(key) || 0;
      aggregate.set(key, current + Number(p.total || 0));
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

  await mongoose.disconnect();
  console.log(JSON.stringify({ ok: true, matchId: MATCH_ID, points: points.length }));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
