import dotenv from "dotenv";
import mongoose from "mongoose";
import Team from "../models/Team.js";
import TeamSubmission from "../models/TeamSubmission.js";
import { cricapiGet } from "../services/cricapi.js";

dotenv.config();

const MATCH_ID = process.argv[2];
const SERIES_KEY = process.env.CRICAPI_SERIES_KEY || process.env.CRICAPI_KEY;

const matchStartMsFromMatch = (match) => {
  const dt = match?.dateTimeGMT || match?.dateTime;
  if (!dt) return null;
  const ms = new Date(dt).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const matchDateFromMatch = (match) => {
  const dt = match?.dateTimeGMT || match?.dateTime;
  if (!dt) return null;
  const iso = new Date(dt).toISOString();
  return iso.slice(0, 10);
};

async function run() {
  if (!MATCH_ID) {
    throw new Error("Usage: node src/scripts/fixAutoSubmissionsForMatch.js <matchId>");
  }
  if (!SERIES_KEY) {
    throw new Error("CRICAPI_SERIES_KEY or CRICAPI_KEY is not set");
  }
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(mongoUri);

  const matchInfo = await cricapiGet("/match_info", { id: MATCH_ID }, SERIES_KEY);
  const match = matchInfo?.data || {};
  const matchStartMs = matchStartMsFromMatch(match);
  const matchDate = matchDateFromMatch(match);
  if (!matchStartMs) {
    throw new Error("Match start time not found for this match.");
  }

  const submissions = await TeamSubmission.find({ matchId: MATCH_ID })
    .select("user createdAt matchStartMs superSub")
    .lean();

  const autoSubs = submissions.filter((s) => {
    const created = new Date(s.createdAt || 0).getTime();
    return created >= matchStartMs;
  });
  if (!autoSubs.length) {
    await mongoose.disconnect();
    console.log(JSON.stringify({ ok: true, updated: 0, reason: "no auto submissions found" }));
    return;
  }

  const users = autoSubs.map((s) => s.user);
  const teams = await Team.find({ user: { $in: users } })
    .select("user players captain viceCaptain superSub")
    .lean();
  const teamByUser = new Map(teams.map((t) => [String(t.user), t]));

  const priorSubs = await TeamSubmission.find({
    user: { $in: users },
    matchStartMs: { $lt: matchStartMs }
  })
    .select("user matchStartMs createdAt players captain viceCaptain booster boosterPlayer superSub")
    .lean();

  const submissionsByUser = new Map();
  for (const sub of priorSubs) {
    const key = String(sub.user);
    const list = submissionsByUser.get(key) || [];
    list.push(sub);
    submissionsByUser.set(key, list);
  }
  for (const list of submissionsByUser.values()) {
    list.sort((a, b) => {
      const aMs = Number(a.matchStartMs || new Date(a.createdAt || 0).getTime());
      const bMs = Number(b.matchStartMs || new Date(b.createdAt || 0).getTime());
      return aMs - bMs;
    });
  }

  const usedSuperSubByDay = new Set(
    submissions
      .filter((s) => s.superSub && s.matchDate)
      .map((s) => `${s.user}-${s.matchDate}`)
  );

  const updates = [];
  for (const sub of autoSubs) {
    const userKey = String(sub.user);
    const userSubs = submissionsByUser.get(userKey) || [];
    let prevSub = null;
    for (const candidate of userSubs) {
      const subMs = Number(candidate.matchStartMs || new Date(candidate.createdAt || 0).getTime());
      if (!Number.isFinite(subMs)) continue;
      if (subMs < matchStartMs) {
        prevSub = candidate;
      } else {
        break;
      }
    }
    const team = teamByUser.get(userKey);
    const basePlayers = prevSub?.players?.length ? prevSub.players : team?.players || [];
    const baseCaptain = prevSub?.captain || team?.captain || null;
    const baseVice = prevSub?.viceCaptain || team?.viceCaptain || null;
    const baseSuperSub = prevSub?.superSub || team?.superSub || null;

    const superSubAllowed = matchDate
      ? !usedSuperSubByDay.has(`${userKey}-${matchDate}`)
      : true;
    const superSub = superSubAllowed ? baseSuperSub || null : null;

    updates.push({
      updateOne: {
        filter: { user: sub.user, matchId: MATCH_ID },
        update: {
          $set: {
            players: basePlayers,
            captain: baseCaptain,
            viceCaptain: baseVice,
            booster: null,
            boosterPlayer: null,
            superSub
          }
        }
      }
    });
  }

  if (updates.length) {
    await TeamSubmission.bulkWrite(updates);
  }

  await mongoose.disconnect();
  console.log(JSON.stringify({ ok: true, updated: updates.length }));
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
