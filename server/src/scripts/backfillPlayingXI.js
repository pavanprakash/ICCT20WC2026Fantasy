import dotenv from "dotenv";
import mongoose from "mongoose";
import FantasyMatchPoints from "../models/FantasyMatchPoints.js";
import FantasyRule from "../models/FantasyRule.js";
import Player from "../models/Player.js";
import { applyPlayingXIPoints, DEFAULT_RULESET } from "../services/fantasyScoring.js";

dotenv.config();

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
  const bonus = Number(rules?.additional?.playingXI ?? 2);

  const docs = await FantasyMatchPoints.find({ ruleset: rules.name }).lean();
  let updated = 0;

  for (const doc of docs) {
    if (!Array.isArray(doc.playingXI) || doc.playingXI.length === 0) continue;
    const points = Array.isArray(doc.points) ? doc.points : [];
    const alreadyApplied = points.some((p) => Number(p.appearance || 0) > 0);
    if (alreadyApplied) continue;

    const nextPoints = applyPlayingXIPoints(points, doc.playingXI, bonus);
    await FantasyMatchPoints.updateOne(
      { _id: doc._id },
      { $set: { points: nextPoints } }
    );
    updated += 1;
  }

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
  console.log(JSON.stringify({ ok: true, updatedMatches: updated, playersUpdated: players.length }));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
