import mongoose from "mongoose";

const FantasyMatchPointsSchema = new mongoose.Schema(
  {
    matchId: { type: String, required: true, unique: true },
    matchDate: { type: String },
    matchStartMs: { type: Number },
    ruleset: { type: String, required: true },
    points: { type: Array, required: true },
    warnings: { type: Array, default: [] }
  },
  { timestamps: true }
);

export default mongoose.model("FantasyMatchPoints", FantasyMatchPointsSchema);
