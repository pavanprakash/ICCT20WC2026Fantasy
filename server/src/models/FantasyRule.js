import mongoose from "mongoose";

const FantasyRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    batting: { type: Object, required: true },
    bowling: { type: Object, required: true },
    fielding: { type: Object, required: true },
    additional: { type: Object, required: true }
  },
  { timestamps: true }
);

export default mongoose.model("FantasyRule", FantasyRuleSchema);
