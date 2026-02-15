import mongoose from "mongoose";

const PlayerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    country: { type: String, required: true },
    role: { type: String, required: true },
    price: { type: Number, required: true },
    playerImg: { type: String, default: null },
    availabilityTag: { type: String, default: null },
    stats: {
      runs: { type: Number, default: 0 },
      wickets: { type: Number, default: 0 },
      catches: { type: Number, default: 0 }
    },
    fantasyPoints: { type: Number, default: 0 },
    lastPointsUpdatedAt: { type: Date }
  },
  { timestamps: true }
);

export default mongoose.model("Player", PlayerSchema);
