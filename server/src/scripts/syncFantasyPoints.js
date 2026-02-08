import dotenv from "dotenv";
import mongoose from "mongoose";
import FantasyRule from "../models/FantasyRule.js";
import FantasyMatchPoints from "../models/FantasyMatchPoints.js";
import Player from "../models/Player.js";
import { cricapiGet } from "../services/cricapi.js";
import { calculateMatchPoints, DEFAULT_RULESET } from "../services/fantasyScoring.js";

dotenv.config();

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

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(mongoUri);
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

  console.log(JSON.stringify({
    ok: true,
    matchesProcessed: matches.length,
    playersUpdated: players.length,
    updatedAt: new Date().toISOString()
  }));

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
