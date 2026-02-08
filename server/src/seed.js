import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import Player from "./models/Player.js";
import squads from "./data/squads-2026.js";

dotenv.config();

const DEFAULT_PRICE = 8;
const DIVISOR = 10000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRICING_PATH = path.join(__dirname, "./data/cricketxi-pricing.json");

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

function loadPricingMap() {
  if (!fs.existsSync(PRICING_PATH)) return { priceMap: new Map(), roleMap: new Map() };
  const raw = fs.readFileSync(PRICING_PATH, "utf-8");
  const data = JSON.parse(raw);
  const pricingPlayers = Array.isArray(data?.players) ? data.players : [];
  const priceMap = new Map();
  const roleMap = new Map();
  for (const p of pricingPlayers) {
    const key = normalize(p.fullname || p.shortname || p.name);
    if (!key) continue;
    const price = toMillionPounds(p.price);
    if (price !== null) {
      priceMap.set(key, price);
    }
    const role = toRole(p.full_position || p.position);
    if (role) {
      roleMap.set(key, role);
    }
  }
  return { priceMap, roleMap };
}

function buildPlayers() {
  const { priceMap, roleMap } = loadPricingMap();
  return Object.entries(squads).flatMap(([country, players]) =>
    players.map((name) => ({
      name,
      country,
      role: roleMap.get(normalize(name)) || "Squad",
      price: priceMap.get(normalize(name)) ?? DEFAULT_PRICE,
      stats: { runs: 0, wickets: 0, catches: 0 }
    }))
  );
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const players = buildPlayers();
    await Player.deleteMany({});
    await Player.insertMany(players);
    console.log("Seeded players:", players.length);
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
