import dotenv from "dotenv";
import mongoose from "mongoose";
import FantasyRule from "../models/FantasyRule.js";
import FantasyMatchPoints from "../models/FantasyMatchPoints.js";
import Player from "../models/Player.js";
import { cricapiGet, cricapiGetScorecardSafe } from "../services/cricapi.js";
import { calculateMatchPoints, DEFAULT_RULESET } from "../services/fantasyScoring.js";
import { getPlayingXI } from "../services/playingXI.js";

dotenv.config();

const SERIES_ID = process.env.CRICAPI_SERIES_ID || "0cdf6736-ad9b-4e95-a647-5ee3a99c5510";
const SERIES_KEY = process.env.CRICAPI_SERIES_KEY || process.env.CRICAPI_KEY;
// Use the same key for scorecards to avoid mismatched API permissions.
const SCORECARD_KEY = SERIES_KEY;

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isCompletedMatch(match) {
  const ms = String(match?.ms || "").toLowerCase();
  if (ms === "result") return true;
  if (match?.matchEnded === true) return true;
  const status = String(match?.status || match?.matchStatus || "").toLowerCase();
  return /match ended|result|won|abandoned|no result|draw|tied|complete|completed|match over|finished/.test(status);
}

function isCompletedScorecard(scoreData) {
  if (scoreData?.matchEnded === true) return true;
  const status = String(scoreData?.status || scoreData?.matchStatus || "").toLowerCase();
  return /match ended|result|won|abandoned|no result|draw|tied|complete|completed|match over|finished/.test(status);
}


function matchDateFromMatch(match) {
  const dt = match?.dateTimeGMT || match?.dateTime;
  if (!dt) return null;
  const iso = new Date(dt).toISOString();
  return iso.slice(0, 10);
}

function matchStartMsFromMatch(match) {
  const dt = match?.dateTimeGMT || match?.dateTime;
  if (!dt) return null;
  const ms = new Date(dt).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isT20WorldCup2026(match) {
  const seriesId = String(match?.series_id || match?.seriesId || "");
  if (seriesId && seriesId === SERIES_ID) return true;
  const series = String(match?.series || match?.seriesName || "").toLowerCase();
  if (!series) return true;
  return series === "icc men's t20 world cup 2026";
}

async function ensureRules() {
  const existing = await FantasyRule.findOne({ name: DEFAULT_RULESET.name });
  if (!existing) {
    await FantasyRule.create(DEFAULT_RULESET);
  }
}

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");

  await mongoose.connect(mongoUri);
  await ensureRules();
  const rules = await FantasyRule.findOne({ name: DEFAULT_RULESET.name }).lean();

  const debug = String(process.env.DEBUG_SYNC || "").toLowerCase() === "true";
  let matches = [];
  let seriesList = [];
  let seriesStatus = null;
  let seriesReason = null;
  try {
    const seriesInfo = await cricapiGet("/series_info", { id: SERIES_ID }, SERIES_KEY);
    seriesStatus = seriesInfo?.status || null;
    seriesReason = seriesInfo?.reason || seriesInfo?.message || null;
    const raw =
      seriesInfo?.data?.matchList ||
      seriesInfo?.data?.matches ||
      seriesInfo?.data?.match ||
      [];
    seriesList = Array.isArray(raw) ? raw : [];
    matches = seriesList.filter(isT20WorldCup2026);
  } catch (err) {
    // fall back to currentMatches
  }
  if (!matches.length) {
    // currentMatches is paginated via offset; fetch until empty or safety cap.
    const PAGE_SIZE = 25;
    const MAX_PAGES = 20;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * PAGE_SIZE;
      const current = await cricapiGet("/currentMatches", { offset }, SERIES_KEY);
      const list = Array.isArray(current?.data) ? current.data : [];
      if (!list.length) break;
      for (const m of list) {
        const seriesId = String(m?.series_id || m?.seriesId || "");
        if (seriesId === SERIES_ID) matches.push(m);
      }
      if (list.length < PAGE_SIZE) break;
    }
  }
  if (debug) {
    const ended = matches.filter((m) => m?.matchEnded === true).length;
    const seriesIds = matches.slice(0, 5).map((m) => m?.series_id || m?.seriesId);
    console.log(
      JSON.stringify({
        debug: true,
        seriesStatus,
        seriesReason,
        seriesListTotal: seriesList.length,
        matchesTotal: matches.length,
        matchesEnded: ended,
        sampleSeriesIds: seriesIds
      })
    );
  }

  const aggregate = new Map();
  let processed = 0;

  for (const match of matches) {
    const matchId = match?.id || match?.match_id || match?.matchId || match?.unique_id;
    if (!matchId) continue;
    const safe = await cricapiGetScorecardSafe(matchId, SCORECARD_KEY);
    if (safe.skipped) {
      console.warn(
        JSON.stringify({
          source: "scripts/syncFantasyPoints",
          matchId,
          reason: safe.reason || "unavailable"
        })
      );
      if (debug) {
        console.log(
          JSON.stringify({
            debug: true,
            matchId,
            message: "Scorecard not available",
            reason: safe.reason || "unavailable"
          })
        );
      }
      continue;
    }
    const scoreRoot = safe.data?.data;
    if (match?.matchEnded !== true && !isCompletedMatch(match) && !isCompletedScorecard(scoreRoot)) {
      continue;
    }
    const scorecard = scoreRoot?.scorecard || scoreRoot?.innings || scoreRoot;
    const playingXI = getPlayingXI(scoreRoot);
    const points = calculateMatchPoints(scorecard, rules);
    if (!points.length) {
      if (debug) {
        const topKeys = scoreData && typeof scoreData === "object" ? Object.keys(scoreData).slice(0, 20) : [];
        const dataKeys = scoreRoot && typeof scoreRoot === "object" ? Object.keys(scoreRoot).slice(0, 20) : [];
        const status = scoreData?.status || scoreRoot?.status || scoreRoot?.matchStatus || null;
        const message = scoreData?.message || scoreRoot?.message || null;
        const reason = scoreData?.reason || null;
        const rootKeys = scoreRoot && typeof scoreRoot === "object" ? Object.keys(scoreRoot).slice(0, 20) : [];
        const inningsArr = Array.isArray(scoreRoot?.innings) ? scoreRoot.innings : null;
        const scorecardArr = Array.isArray(scoreRoot?.scorecard) ? scoreRoot.scorecard : null;
        console.log(
          JSON.stringify({
            debug: true,
            matchId,
            message: "No points computed",
            apiStatus: status,
            apiMessage: message,
            apiReason: reason,
            topKeys,
            dataKeys,
            rootKeys,
            inningsLength: inningsArr ? inningsArr.length : null,
            scorecardLength: scorecardArr ? scorecardArr.length : null
          })
        );
      }
      continue;
    }
    processed += 1;

    const matchDate = matchDateFromMatch(match);
    const matchStartMs = matchStartMsFromMatch(match);
    await FantasyMatchPoints.findOneAndUpdate(
      { matchId: matchId, ruleset: rules.name },
      { matchId: matchId, matchDate, matchStartMs, ruleset: rules.name, points, playingXI },
      { upsert: true, new: true }
    );

    for (const p of points) {
      const key = normalizeName(p.name);
      const current = aggregate.get(key) || 0;
      aggregate.set(key, current + (p.total || 0));
    }
  }

  const players = await Player.find({}).lean();
  const bulk = [];
  for (const player of players) {
    const key = normalizeName(player.name);
    const total = aggregate.get(key) || 0;
    bulk.push({
      updateOne: {
        filter: { _id: player._id },
        update: { $set: { fantasyPoints: total, lastPointsUpdatedAt: new Date() } }
      }
    });
  }

  if (bulk.length) {
    await Player.bulkWrite(bulk);
  }

  console.log(JSON.stringify({
    ok: true,
    matchesProcessed: processed,
    playersUpdated: players.length,
    updatedAt: new Date().toISOString()
  }));

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
