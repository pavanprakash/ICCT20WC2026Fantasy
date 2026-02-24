import dotenv from "dotenv";
import mongoose from "mongoose";
import Player from "../models/Player.js";
import FantasyMatchPoints from "../models/FantasyMatchPoints.js";
import { normalizeNameKey } from "../utils/nameCanonical.js";

dotenv.config();

function toCanonical(value) {
  return normalizeNameKey(value);
}

function surnameOf(key) {
  const parts = String(key || "").split(" ").filter(Boolean);
  return parts[parts.length - 1] || "";
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }
  await mongoose.connect(process.env.MONGODB_URI);

  const ruleset = process.env.FANTASY_RULESET || "ICC_T20_2026";
  const players = await Player.find({}).select("name").lean();
  const docs = await FantasyMatchPoints.find({ ruleset }).select("matchId points").lean();

  const playerKeys = new Set(players.map((p) => toCanonical(p.name)).filter(Boolean));
  const playerByKey = new Map();
  for (const p of players) {
    const key = toCanonical(p.name);
    if (!key) continue;
    if (!playerByKey.has(key)) playerByKey.set(key, p.name);
  }

  const unmatched = new Map();
  for (const d of docs) {
    const list = Array.isArray(d.points) ? d.points : [];
    for (const p of list) {
      const key = toCanonical(p?.name);
      if (!key || playerKeys.has(key)) continue;
      if (!unmatched.has(key)) {
        unmatched.set(key, { key, rawNames: new Set(), matchIds: new Set(), count: 0 });
      }
      const row = unmatched.get(key);
      row.count += 1;
      row.rawNames.add(String(p?.name || "").trim());
      row.matchIds.add(String(d.matchId || ""));
    }
  }

  const rows = Array.from(unmatched.values())
    .map((row) => {
      const surname = surnameOf(row.key);
      const candidates = [];
      if (surname) {
        for (const [key, name] of playerByKey.entries()) {
          if (surnameOf(key) === surname) {
            candidates.push(name);
            if (candidates.length >= 5) break;
          }
        }
      }
      return {
        key: row.key,
        rawNames: Array.from(row.rawNames).slice(0, 5),
        matches: row.matchIds.size,
        occurrences: row.count,
        candidatePlayers: candidates
      };
    })
    .sort((a, b) => b.occurrences - a.occurrences);

  console.log(JSON.stringify({
    ruleset,
    totalMatchesChecked: docs.length,
    unmatchedCanonicalNames: rows.length,
    top: rows.slice(0, 50)
  }, null, 2));

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err.message || err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
