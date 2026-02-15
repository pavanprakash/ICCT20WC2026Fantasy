import dotenv from "dotenv";
import mongoose from "mongoose";
import Player from "../models/Player.js";
import { cricapiGet } from "../services/cricapi.js";

dotenv.config();

const CRICAPI_KEY = process.env.CRICAPI_KEY || process.env.CRICAPI_SERIES_KEY;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function findPlayerIdByName(name) {
  const search = encodeURIComponent(name);
  const res = await cricapiGet("/players", { search, offset: 0 }, CRICAPI_KEY);
  const list = Array.isArray(res?.data) ? res.data : [];
  if (!list.length) return null;
  const targetKey = normalize(name);
  const exact = list.find((p) => normalize(p.name) === targetKey);
  return (exact || list[0])?.id || null;
}

async function fetchPlayerImg(playerId) {
  if (!playerId) return null;
  const res = await cricapiGet("/players_info", { id: playerId }, CRICAPI_KEY);
  return res?.data?.playerImg || null;
}

async function run() {
  if (!CRICAPI_KEY) throw new Error("CRICAPI_KEY is not set");
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(mongoUri);

  const players = await Player.find({}).lean();
  let updated = 0;
  let skipped = 0;

  for (const player of players) {
    if (player.playerImg) {
      skipped += 1;
      continue;
    }
    const id = await findPlayerIdByName(player.name);
    if (!id) {
      skipped += 1;
      await sleep(250);
      continue;
    }
    const img = await fetchPlayerImg(id);
    if (img) {
      await Player.updateOne({ _id: player._id }, { $set: { playerImg: img } });
      updated += 1;
    } else {
      skipped += 1;
    }
    await sleep(250);
  }

  await mongoose.disconnect();
  console.log(JSON.stringify({ ok: true, updated, skipped }));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
