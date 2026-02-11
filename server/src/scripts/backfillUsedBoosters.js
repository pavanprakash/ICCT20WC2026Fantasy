import "dotenv/config";
import mongoose from "mongoose";
import Team from "../models/Team.js";

const getArg = (name) => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((val) => val.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
};

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }
  await mongoose.connect(process.env.MONGODB_URI);

  const dryRun = String(getArg("dry") || "").toLowerCase() === "true";
  const teams = await Team.find({}).select("boosterType usedBoosters").lean();

  let updated = 0;
  let skipped = 0;

  for (const team of teams) {
    const used = Array.isArray(team.usedBoosters) ? team.usedBoosters : [];
    const boosterType = team.boosterType ? String(team.boosterType) : null;

    if (!boosterType) {
      skipped += 1;
      continue;
    }

    if (used.includes(boosterType)) {
      skipped += 1;
      continue;
    }

    const next = Array.from(new Set([...used, boosterType]));
    if (!dryRun) {
      await Team.updateOne({ _id: team._id }, { $set: { usedBoosters: next } });
    }
    updated += 1;
  }

  console.log(JSON.stringify({ dryRun, updated, skipped, total: teams.length }));
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
