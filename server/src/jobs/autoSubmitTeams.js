import Team from "../models/Team.js";
import TeamSubmission from "../models/TeamSubmission.js";
import { cricapiGet } from "../services/cricapi.js";

const SERIES_ID = process.env.CRICAPI_SERIES_ID || "0cdf6736-ad9b-4e95-a647-5ee3a99c5510";
const SERIES_KEY = process.env.CRICAPI_SERIES_KEY || process.env.CRICAPI_KEY;

const normalize = (value) => String(value || "").toLowerCase().trim();

const isT20WorldCup2026 = (match) => {
  const seriesId = String(match?.series_id || match?.seriesId || "");
  if (seriesId && seriesId === SERIES_ID) return true;
  const series = String(match?.series || match?.seriesName || "").toLowerCase();
  if (!series) return true;
  return series === "icc men's t20 world cup 2026";
};

const parseTeams = (match) => {
  if (match?.t1 || match?.t2) {
    return { team1: match?.t1 || "TBD", team2: match?.t2 || "TBD" };
  }
  if (Array.isArray(match?.teams) && match.teams.length >= 2) {
    return { team1: match.teams[0], team2: match.teams[1] };
  }
  if (Array.isArray(match?.teamInfo) && match.teamInfo.length >= 2) {
    return {
      team1: match.teamInfo[0]?.shortname || match.teamInfo[0]?.name,
      team2: match.teamInfo[1]?.shortname || match.teamInfo[1]?.name
    };
  }
  const name = String(match?.name || "");
  const parts = name.split(" vs ");
  if (parts.length >= 2) {
    return { team1: parts[0].trim(), team2: parts[1].trim() };
  }
  return { team1: "TBD", team2: "TBD" };
};

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

export async function autoSubmitMissingTeams() {
  if (!SERIES_KEY) {
    throw new Error("CRICAPI_SERIES_KEY or CRICAPI_KEY is not set");
  }

  const seriesInfo = await cricapiGet("/series_info", { id: SERIES_ID }, SERIES_KEY);
  const raw =
    seriesInfo?.data?.matchList ||
    seriesInfo?.data?.matches ||
    seriesInfo?.data?.match ||
    [];
  const list = Array.isArray(raw) ? raw : [];
  const now = Date.now();

  const matches = list
    .filter(isT20WorldCup2026)
    .map((match) => {
      const id = match?.id || match?.match_id || match?.matchId || match?.unique_id;
      const matchStartMs = matchStartMsFromMatch(match);
      const matchDate = matchDateFromMatch(match);
      const teams = parseTeams(match);
      const venue =
        match?.venue ||
        match?.venueName ||
        match?.venue?.name ||
        match?.ground ||
        match?.groundName ||
        match?.city ||
        null;
      return {
        id,
        matchStartMs,
        matchDate,
        name: match?.name || null,
        team1: teams.team1,
        team2: teams.team2,
        venue
      };
    })
    .filter((match) => match.id && match.matchStartMs && match.matchStartMs <= now);

  if (!matches.length) {
    return { autoSubmissions: 0, matchesChecked: 0 };
  }

  const matchIds = matches.map((m) => String(m.id));
  const existingSubs = await TeamSubmission.find({ matchId: { $in: matchIds } })
    .select("user matchId matchDate superSub")
    .lean();

  const existingSet = new Set(existingSubs.map((s) => `${s.user}-${s.matchId}`));
  const usedSuperSubByDay = new Set(
    existingSubs
      .filter((s) => s.superSub && s.matchDate)
      .map((s) => `${s.user}-${s.matchDate}`)
  );

  const teams = await Team.find({})
    .select("user players captain viceCaptain superSub createdAt")
    .lean();

  const maxStartMs = Math.max(...matches.map((m) => m.matchStartMs || 0));
  const priorSubs = await TeamSubmission.find({
    matchStartMs: { $lt: maxStartMs }
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

  const inserts = [];
  const latestByTeam = new Map();

  for (const team of teams) {
    if (!Array.isArray(team.players) || team.players.length === 0) continue;
    if (!team.lastSubmissionDate && !team.submittedForMatchStart) continue;
    const teamCreatedAt = team.createdAt ? new Date(team.createdAt).getTime() : null;

    for (const match of matches) {
      if (teamCreatedAt && match.matchStartMs < teamCreatedAt) continue;
      const key = `${team.user}-${match.id}`;
      if (existingSet.has(key)) continue;

    const userSubs = submissionsByUser.get(String(team.user)) || [];
    const prevSub = (() => {
      let candidate = null;
      for (const sub of userSubs) {
        const subMs = Number(sub.matchStartMs || new Date(sub.createdAt || 0).getTime());
        if (!Number.isFinite(subMs)) continue;
        if (subMs < match.matchStartMs) {
          candidate = sub;
        } else {
          break;
        }
      }
      return candidate;
    })();

    const basePlayers = prevSub?.players?.length ? prevSub.players : team.players;
    const baseCaptain = prevSub?.captain || team.captain || null;
    const baseVice = prevSub?.viceCaptain || team.viceCaptain || null;
    const baseSuperSub = prevSub?.superSub || team.superSub || null;

    const superSubAllowed = match.matchDate
      ? !usedSuperSubByDay.has(`${team.user}-${match.matchDate}`)
      : true;
    const superSub = superSubAllowed ? baseSuperSub || null : null;

    inserts.push({
      user: team.user,
      team: team._id,
        matchId: match.id,
        matchStartMs: match.matchStartMs,
        matchDate: match.matchDate,
        matchName: match.name,
        team1: match.team1,
        team2: match.team2,
        venue: match.venue,
      players: basePlayers,
      captain: baseCaptain,
      viceCaptain: baseVice,
      booster: null,
      boosterPlayer: null,
      superSub
    });
      existingSet.add(key);
      if (superSub && match.matchDate) {
        usedSuperSubByDay.add(`${team.user}-${match.matchDate}`);
      }

      const latest = latestByTeam.get(String(team._id));
      if (!latest || match.matchStartMs > latest.matchStartMs) {
        latestByTeam.set(String(team._id), match);
      }
    }
  }

  if (inserts.length) {
    await TeamSubmission.insertMany(inserts, { ordered: false });
  }

  const teamUpdates = [];
  for (const [teamId, match] of latestByTeam.entries()) {
    teamUpdates.push({
      updateOne: {
        filter: { _id: teamId },
        update: {
          $set: {
            submittedForMatchId: match.id,
            submittedForMatchStart: new Date(match.matchStartMs),
            submittedForDate: match.matchDate,
            lastSubmissionDate: match.matchDate
          }
        }
      }
    });
  }
  if (teamUpdates.length) {
    await Team.bulkWrite(teamUpdates);
  }

  return { autoSubmissions: inserts.length, matchesChecked: matches.length };
}
