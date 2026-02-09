import mongoose from "mongoose";

const TeamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    players: [{ type: mongoose.Schema.Types.ObjectId, ref: "Player", required: true }],
    captain: { type: mongoose.Schema.Types.ObjectId, ref: "Player", default: null },
    viceCaptain: { type: mongoose.Schema.Types.ObjectId, ref: "Player", default: null },
    lockedInLeague: { type: Boolean, default: false },
    transfersLimit: { type: Number, default: 165 },
    transfersUsedTotal: { type: Number, default: 0 },
    transfersByRound: { type: Map, of: Number, default: {} },
    transferPhase: { type: String, default: "GROUP" },
    postGroupResetDone: { type: Boolean, default: false },
    lastSubmissionDate: { type: String },
    submittedForDate: { type: String },
    submittedForMatchId: { type: String },
    submittedForMatchStart: { type: Date },
    submittedAt: { type: Date }
  },
  { timestamps: true }
);

export default mongoose.model("Team", TeamSchema);
