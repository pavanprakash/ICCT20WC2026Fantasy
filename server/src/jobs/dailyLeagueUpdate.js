import FantasyRule from "../models/FantasyRule.js";
import FantasyMatchPoints from "../models/FantasyMatchPoints.js";
import Player from "../models/Player.js";
import Team from "../models/Team.js";
import League from "../models/League.js";
import User from "../models/User.js";
import { cricapiGet } from "../services/cricapi.js";
import { calculateMatchPoints, DEFAULT_RULESET } from "../services/fantasyScoring.js";

const SERIES_ID = process.env.CRICAPI_SERIES_ID || "0cdf6736-ad9b-4e95-a647-5ee3a99c5510";
const SERIES_KEY = process.env.CRICAPI_SERIES_KEY || process.env.CRICAPI_KEY;
const SCORECARD_KEY = process.env.CRICAPI_SCORECARD_KEY || process.env.CRICAPI_KEY;

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isCompletedMatch(match) {
  if (match?.matchEnded === true) return true;
  const ms = String(match?.ms || "").toLowerCase();
  if (ms === "result") return true;
  const status = String(match?.status || match?.matchStatus || "").toLowerCase();
  return /match ended|result|won|abandoned|no result|draw|tied|complete|completed|match over/.test(status);
}

function isCompletedScorecard(scoreData) {
  if (scoreData?.matchEnded === true) return true;
  const status = String(scoreData?.status || scoreData?.matchStatus || "").toLowerCase();
  return /match ended|result|won|abandoned|no result|draw|tied|complete|completed|match over/.test(status);
}

function matchDateFromMatch(match) {
  const dt = match?.dateTimeGMT || match?.dateTime;
  if (!dt) return null;
  const iso = new Date(dt).toISOString();
  return iso.slice(0, 10);
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

async function syncFantasyPoints() {
  await ensureRules();
  const rules = await FantasyRule.findOne({ name: DEFAULT_RULESET.name }).lean();

  const seriesInfo = await cricapiGet("/series_info", { id: SERIES_ID }, SERIES_KEY);
  const rawMatches =
    seriesInfo?.data?.matchList ||
    seriesInfo?.data?.matches ||
    seriesInfo?.data?.match ||
    [];
  const list = Array.isArray(rawMatches) ? rawMatches : [];
  const matches = list
    .filter(isT20WorldCup2026)
    .filter(Boolean);

  const aggregate = new Map();
  let processed = 0;

  for (const match of matches) {
    const matchId = match?.id || match?.match_id || match?.matchId || match?.unique_id;
    if (!matchId) continue;
    const scoreData = await cricapiGet("/match_scorecard", { id: matchId }, SCORECARD_KEY);
    const scoreRoot = scoreData?.data;
    if (!isCompletedMatch(match) && !isCompletedScorecard(scoreRoot)) {
      continue;
    }
    const scorecard = scoreRoot?.scorecard || scoreRoot?.innings || scoreRoot;
    const points = calculateMatchPoints(scorecard, rules);
    if (!points.length) {
      continue;
    }
    processed += 1;

    const matchDate = matchDateFromMatch(match);
    await FantasyMatchPoints.findOneAndUpdate(
      { matchId: matchId, ruleset: rules.name },
      { matchId: matchId, matchDate, ruleset: rules.name, points },
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

  return { matchesProcessed: processed, playersUpdated: players.length };
}

function calcPoints(player) {
  const runs = player.stats?.runs || 0;
  const wickets = player.stats?.wickets || 0;
  const catches = player.stats?.catches || 0;
  return runs + wickets * 20 + catches * 10;
}

function teamPoints(players) {
  return players.reduce((sum, p) => {
    if (Number.isFinite(p.fantasyPoints)) {
      return sum + p.fantasyPoints;
    }
    return sum + calcPoints(p);
  }, 0);
}

async function computeLeagueStandings(league) {
  const memberIds = league.members || [];
  const users = await User.find({ _id: { $in: memberIds } }).select("name").lean();
  const userMap = new Map(users.map((u) => [String(u._id), u.name]));

  const teams = await Team.find({ user: { $in: memberIds } })
    .populate("players")
    .lean();
  const teamMap = new Map(teams.map((t) => [String(t.user), t]));

  const rows = memberIds.map((id) => {
    const team = teamMap.get(String(id));
    const players = team?.players || [];
    const points = team ? teamPoints(players) : 0;
    return {
      userId: String(id),
      userName: userMap.get(String(id)) || "Unknown",
      teamId: team?._id || null,
      teamName: team?.name || "No Team",
      points
    };
  });

  rows.sort((a, b) => b.points - a.points);
  const ranked = rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
  return ranked;
}

export async function updateAllLeaguesDaily() {
  const sync = await syncFantasyPoints();
  const leagues = await League.find({}).lean();
  for (const league of leagues) {
    const standings = await computeLeagueStandings(league);
    await League.updateOne(
      { _id: league._id },
      { $set: { standings, standingsUpdatedAt: new Date() } }
    );
  }
  return { leaguesUpdated: leagues.length, ...sync };
}

export async function buildLeagueDashboard(leagueId) {
  const league = await League.findById(leagueId).lean();
  if (!league) return null;
  let standings = Array.isArray(league.standings) ? league.standings : [];
  let updatedAt = league.standingsUpdatedAt || null;
  if (!standings.length) {
    standings = await computeLeagueStandings(league);
    updatedAt = new Date();
    await League.updateOne(
      { _id: league._id },
      { $set: { standings, standingsUpdatedAt: updatedAt } }
    );
  }
  return {
    id: league._id,
    name: league.name,
    code: league.code,
    standings,
    standingsUpdatedAt: updatedAt
  };
}
