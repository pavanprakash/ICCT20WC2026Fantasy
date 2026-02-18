import dotenv from "dotenv";
import mongoose from "mongoose";
import { syncMatchPoints } from "../services/syncMatchPoints.js";

dotenv.config();

const MATCH_ID = process.argv[2];
const SCORECARD_KEY = process.env.CRICAPI_SERIES_KEY || process.env.CRICAPI_KEY;

async function run() {
  if (!MATCH_ID) throw new Error("Usage: node src/scripts/syncSingleMatch.js <matchId>");
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");
  if (!SCORECARD_KEY) throw new Error("CRICAPI_KEY is not set");

  await mongoose.connect(mongoUri);
  const result = await syncMatchPoints(MATCH_ID, { scorecardKey: SCORECARD_KEY });
  await mongoose.disconnect();
  console.log(JSON.stringify(result));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
