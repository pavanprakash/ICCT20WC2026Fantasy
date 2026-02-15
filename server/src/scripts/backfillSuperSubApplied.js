import dotenv from "dotenv";
import mongoose from "mongoose";
import TeamSubmission from "../models/TeamSubmission.js";
import FantasyMatchPoints from "../models/FantasyMatchPoints.js";
import Player from "../models/Player.js";
import { normalizePlayingXI } from "../services/playingXI.js";

dotenv.config();

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getPlayerNameById(players, idOrObj) {
  if (!idOrObj || !Array.isArray(players)) return null;
  const id = idOrObj?._id || idOrObj;
  const found = players.find((p) => String(p._id) === String(id));
  return found?.name || null;
}

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(mongoUri);

  const submissions = await TeamSubmission.find({ superSub: { $ne: null } })
    .populate("players")
    .populate("superSub")
    .populate("captain")
    .populate("viceCaptain")
    .lean();

  const matchIds = submissions.map((s) => s.matchId);
  const pointsDocs = await FantasyMatchPoints.find({ matchId: { $in: matchIds } }).lean();
  const pointsMap = new Map(pointsDocs.map((d) => [String(d.matchId), d]));

  let updated = 0;
  let skipped = 0;

  for (const s of submissions) {
    const doc = pointsMap.get(String(s.matchId));
    if (!doc || !Array.isArray(doc.playingXI) || doc.playingXI.length === 0) {
      skipped += 1;
      continue;
    }

    const playingXI = normalizePlayingXI(doc.playingXI || []);
    const players = s.players || [];
    const superSub = s.superSub;
    if (!superSub || !playingXI.length) {
      skipped += 1;
      continue;
    }
    const superKey = normalizeName(superSub.name);
    if (!superKey || !playingXI.includes(superKey)) {
      skipped += 1;
      continue;
    }

    const missing = players.filter((p) => !playingXI.includes(normalizeName(p.name)));
    if (!missing.length) {
      skipped += 1;
      continue;
    }

    const capName = s.captain?.name || getPlayerNameById(players, s.captain);
    const vcName = s.viceCaptain?.name || getPlayerNameById(players, s.viceCaptain);
    const capKey = normalizeName(capName);
    const vcKey = normalizeName(vcName);

    let target = missing.find((p) => normalizeName(p.name) === capKey);
    if (!target && vcKey) {
      target = missing.find((p) => normalizeName(p.name) === vcKey);
    }
    if (!target) {
      target = missing[0];
    }
    if (!target) {
      skipped += 1;
      continue;
    }

    const effectivePlayers = players
      .filter((p) => String(p._id) !== String(target._id))
      .concat(superSub);

    let effectiveCaptain = s.captain?._id || s.captain || null;
    let effectiveViceCaptain = s.viceCaptain?._id || s.viceCaptain || null;

    if (capKey && normalizeName(target.name) === capKey) {
      effectiveCaptain = superSub._id;
    } else if (vcKey && normalizeName(target.name) === vcKey) {
      effectiveViceCaptain = superSub._id;
    }

    await TeamSubmission.updateOne(
      { _id: s._id },
      {
        $set: {
          superSubApplied: true,
          superSubReplaced: target._id,
          superSubEffectivePlayers: effectivePlayers.map((p) => p._id),
          superSubEffectiveCaptain: effectiveCaptain,
          superSubEffectiveViceCaptain: effectiveViceCaptain
        }
      }
    );
    updated += 1;
  }

  await mongoose.disconnect();
  console.log(JSON.stringify({ ok: true, updated, skipped }));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
