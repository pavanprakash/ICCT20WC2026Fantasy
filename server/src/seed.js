import dotenv from "dotenv";
import mongoose from "mongoose";
import Player from "./models/Player.js";
import squads from "./data/squads-2026.js";

dotenv.config();

const DEFAULT_PRICE = 8;

function buildPlayers() {
  return Object.entries(squads).flatMap(([country, players]) =>
    players.map((name) => ({
      name,
      country,
      role: "Squad",
      price: DEFAULT_PRICE,
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
