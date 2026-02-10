import "dotenv/config";
import mongoose from "mongoose";
import Team from "../models/Team.js";
import TeamSubmission from "../models/TeamSubmission.js";

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

  const teams = await Team.find({ firstSubmittedMatchStart: { $in: [null, undefined] } }).lean();
  let updated = 0;
  let skipped = 0;

  for (const team of teams) {
    let first = team.submittedForMatchStart ? new Date(team.submittedForMatchStart) : null;

    if (!first || Number.isNaN(first.getTime())) {
      const earliest = await TeamSubmission.findOne({ user: team.user })
        .sort({ matchStartMs: 1, createdAt: 1 })
        .lean();
      if (earliest) {
        if (Number.isFinite(earliest.matchStartMs)) {
          first = new Date(earliest.matchStartMs);
        } else if (earliest.createdAt) {
          first = new Date(earliest.createdAt);
        }
      }
    }

    if (!first || Number.isNaN(first.getTime())) {
      skipped += 1;
      continue;
    }

    if (!dryRun) {
      await Team.updateOne({ _id: team._id }, { $set: { firstSubmittedMatchStart: first } });
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
