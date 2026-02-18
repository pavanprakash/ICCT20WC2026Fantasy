import mongoose from "mongoose";

const MatchSyncAttemptSchema = new mongoose.Schema(
  {
    matchId: { type: String, required: true, unique: true },
    attempt15At: { type: Date },
    attempt45At: { type: Date },
    lastError: { type: String }
  },
  { timestamps: true }
);

export default mongoose.model("MatchSyncAttempt", MatchSyncAttemptSchema);
