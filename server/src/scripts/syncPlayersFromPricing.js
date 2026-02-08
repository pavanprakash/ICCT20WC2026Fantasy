import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import Player from "../models/Player.js";
import squads from "../data/squads-2026.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRICING_PATH = path.join(__dirname, "../data/cricketxi-pricing.json");
const DIVISOR = 10000;

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const toMillionPounds = (raw) => {
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return Number((num / DIVISOR).toFixed(2));
};

const toRole = (raw) => {
  const value = String(raw || "").toLowerCase();
  if (value.includes("wicket") || value === "wk") return "Wicketkeeper";
  if (value.includes("all") || value === "alr") return "All-Rounder";
  if (value.includes("bowl")) return "Bowler";
  if (value.includes("bat")) return "Batter";
  return "Squad";
};

const availabilityTag = (notes = []) => {
  if (!Array.isArray(notes)) return null;
  const text = notes
    .map((note) => String(note?.text || "").toLowerCase())
    .join(" ");
  if (text.includes("withdrawn")) return "Withdrawn";
  return null;
};

const countryAlias = (name, abv, squadsSet) => {
  if (name && squadsSet.has(name)) return name;
  if (abv && squadsSet.has(abv)) return abv;
  const alias = {
    "United States of America": "USA",
    "United Arab Emirates": "UAE"
  };
  if (name && alias[name] && squadsSet.has(alias[name])) return alias[name];
  return name || abv || "Unknown";
};

function loadPricing() {
  if (!fs.existsSync(PRICING_PATH)) {
    throw new Error(`Pricing file not found at ${PRICING_PATH}`);
  }
  const raw = fs.readFileSync(PRICING_PATH, "utf-8");
  const data = JSON.parse(raw);
  const pricingPlayers = Array.isArray(data?.players) ? data.players : [];
  const teams = data?.teams || {};
  const squadsSet = new Set(Object.keys(squads));

  const teamMap = new Map();
  for (const team of Object.values(teams)) {
    const country = countryAlias(team?.name, team?.abv, squadsSet);
    if (team?.id != null) {
      teamMap.set(Number(team.id), country);
    }
  }

  return { pricingPlayers, teamMap };
}

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set in server/.env");

  const { pricingPlayers, teamMap } = loadPricing();
  if (!pricingPlayers.length) throw new Error("Pricing file has no players array.");

  await mongoose.connect(mongoUri);

  const dbPlayers = await Player.find({}).lean();
  const byNormalizedName = new Map();
  for (const player of dbPlayers) {
    const key = normalize(player.name);
    if (!key) continue;
    if (!byNormalizedName.has(key)) {
      byNormalizedName.set(key, []);
    }
    byNormalizedName.get(key).push(player);
  }

  let matched = 0;
  let updated = 0;
  let inserted = 0;
  const bulk = [];

  for (const p of pricingPlayers) {
    const fullname = p.fullname || p.shortname || p.name;
    const key = normalize(fullname);
    if (!key) continue;
    const country = teamMap.get(Number(p.team_id)) || "Unknown";
    const role = toRole(p.full_position || p.position);
    const price = toMillionPounds(p.price);
    const tag = availabilityTag(p.notes);

    const candidates = byNormalizedName.get(key) || [];
    if (candidates.length) {
      matched += 1;
      const target = candidates[0];
      const update = {};
      if (target.name !== fullname) update.name = fullname;
      if (target.country !== country) update.country = country;
      if (role && target.role !== role) update.role = role;
      if (price != null && target.price !== price) update.price = price;
      if (target.availabilityTag !== tag) update.availabilityTag = tag;
      if (Object.keys(update).length) {
        updated += 1;
        bulk.push({
          updateOne: {
            filter: { _id: target._id },
            update: { $set: update }
          }
        });
      }
      continue;
    }

    inserted += 1;
    bulk.push({
      insertOne: {
        document: {
          name: fullname,
          country,
          role,
          price: price ?? 8,
          availabilityTag: tag,
          stats: { runs: 0, wickets: 0, catches: 0 }
        }
      }
    });
  }

  if (bulk.length) {
    await Player.bulkWrite(bulk);
  }

  console.log(`Pricing players: ${pricingPlayers.length}`);
  console.log(`Matched: ${matched}`);
  console.log(`Updated: ${updated}`);
  console.log(`Inserted: ${inserted}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
