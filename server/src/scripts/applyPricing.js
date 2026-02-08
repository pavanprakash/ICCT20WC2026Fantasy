import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import Player from "../models/Player.js";

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

const run = async () => {
  if (!fs.existsSync(PRICING_PATH)) {
    throw new Error(`Pricing file not found at ${PRICING_PATH}`);
  }

  const raw = fs.readFileSync(PRICING_PATH, "utf-8");
  const data = JSON.parse(raw);
  const pricingPlayers = Array.isArray(data?.players) ? data.players : [];

  if (!pricingPlayers.length) {
    throw new Error("Pricing file has no players array.");
  }

  const priceMap = new Map();
  for (const p of pricingPlayers) {
    const key = normalize(p.fullname || p.shortname || p.name);
    if (!key) continue;
    const price = toMillionPounds(p.price);
    if (price === null) continue;
    priceMap.set(key, price);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set in server/.env");

  await mongoose.connect(mongoUri);

  const players = await Player.find({}).lean();
  let matched = 0;
  let updated = 0;
  const missing = [];

  const bulk = [];
  for (const player of players) {
    const key = normalize(player.name);
    const price = priceMap.get(key);
    if (price == null) {
      missing.push(player.name);
      continue;
    }
    matched += 1;
    if (player.price !== price) {
      updated += 1;
      bulk.push({
        updateOne: {
          filter: { _id: player._id },
          update: { $set: { price } }
        }
      });
    }
  }

  if (bulk.length) {
    await Player.bulkWrite(bulk);
  }

  const sampleMissing = missing.slice(0, 25);
  console.log(`Pricing map entries: ${priceMap.size}`);
  console.log(`Players in DB: ${players.length}`);
  console.log(`Matched: ${matched}`);
  console.log(`Updated: ${updated}`);
  console.log(`Missing: ${missing.length}`);
  if (sampleMissing.length) {
    console.log("Sample missing:", sampleMissing.join(", "));
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
