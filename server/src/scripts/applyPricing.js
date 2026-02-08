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

const toRole = (raw) => {
  const value = String(raw || "").toLowerCase();
  if (value.includes("wicket") || value === "wk") return "Wicketkeeper";
  if (value.includes("all") || value === "alr") return "All-Rounder";
  if (value.includes("bowl")) return "Bowler";
  if (value.includes("bat")) return "Batter";
  return null;
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
  const roleMap = new Map();
  for (const p of pricingPlayers) {
    const key = normalize(p.fullname || p.shortname || p.name);
    if (!key) continue;
    const price = toMillionPounds(p.price);
    if (price === null) continue;
    priceMap.set(key, price);
    const role = toRole(p.full_position || p.position);
    if (role) {
      roleMap.set(key, role);
    }
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set in server/.env");

  await mongoose.connect(mongoUri);

  const players = await Player.find({}).lean();
  let matched = 0;
  let updated = 0;
  let roleUpdated = 0;
  const missing = [];

  const bulk = [];
  for (const player of players) {
    const key = normalize(player.name);
    const price = priceMap.get(key);
    const role = roleMap.get(key);
    if (price == null && !role) {
      missing.push(player.name);
      continue;
    }
    matched += 1;
    const update = {};
    if (price != null && player.price !== price) {
      update.price = price;
    }
    if (role && player.role !== role) {
      update.role = role;
    }
    if (Object.keys(update).length) {
      updated += 1;
      if (update.role) roleUpdated += 1;
      bulk.push({
        updateOne: {
          filter: { _id: player._id },
          update: { $set: update }
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
  console.log(`Roles updated: ${roleUpdated}`);
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
