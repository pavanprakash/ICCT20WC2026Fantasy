import mongoose from "mongoose";

const TeamSubmissionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    matchId: { type: String, required: true },
    matchStartMs: { type: Number },
    matchDate: { type: String },
    matchName: { type: String },
    team1: { type: String },
    team2: { type: String },
    venue: { type: String },
    booster: { type: String, default: null },
    boosterPlayer: { type: mongoose.Schema.Types.ObjectId, ref: "Player", default: null },
    superSub: { type: mongoose.Schema.Types.ObjectId, ref: "Player", default: null },
    players: [{ type: mongoose.Schema.Types.ObjectId, ref: "Player", required: true }],
    captain: { type: mongoose.Schema.Types.ObjectId, ref: "Player", default: null },
    viceCaptain: { type: mongoose.Schema.Types.ObjectId, ref: "Player", default: null },
    superSubApplied: { type: Boolean, default: false },
    superSubReplaced: { type: mongoose.Schema.Types.ObjectId, ref: "Player", default: null },
    superSubEffectivePlayers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Player" }],
    superSubEffectiveCaptain: { type: mongoose.Schema.Types.ObjectId, ref: "Player", default: null },
    superSubEffectiveViceCaptain: { type: mongoose.Schema.Types.ObjectId, ref: "Player", default: null }
  },
  { timestamps: true }
);

TeamSubmissionSchema.index({ user: 1, matchId: 1 }, { unique: true });

export default mongoose.model("TeamSubmission", TeamSubmissionSchema);
