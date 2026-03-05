import mongoose from "mongoose";

const FantasyPointOverrideSchema = new mongoose.Schema(
  {
    matchId: { type: String, required: true, index: true },
    ruleset: { type: String, required: true, default: "ICC_T20_2026", index: true },
    playerKey: { type: String, required: true, index: true },
    playerName: { type: String, default: null },
    batting: { type: Number, default: null },
    bowling: { type: Number, default: null },
    fielding: { type: Number, default: null },
    appearance: { type: Number, default: null },
    substituteAppearance: { type: Number, default: null },
    total: { type: Number, default: null },
    note: { type: String, default: null },
    active: { type: Boolean, default: true, index: true }
  },
  { timestamps: true, collection: "fantasy_point_overrides" }
);

FantasyPointOverrideSchema.index(
  { matchId: 1, ruleset: 1, playerKey: 1 },
  { unique: true, name: "match_ruleset_player_unique" }
);

export default mongoose.model("FantasyPointOverride", FantasyPointOverrideSchema);
