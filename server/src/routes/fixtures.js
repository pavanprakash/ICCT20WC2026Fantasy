import express from "express";
import { cricapiGet } from "../services/cricapi.js";

const router = express.Router();

const normalize = (value) => String(value || "").toLowerCase().trim();
const SERIES_ID = process.env.CRICAPI_SERIES_ID || "0cdf6736-ad9b-4e95-a647-5ee3a99c5510";

const isTargetMatch = (match) => {
  const seriesId = String(match?.series_id || match?.seriesId || "");
  if (seriesId && seriesId === SERIES_ID) return true;
  const hay = [
    match?.name,
    match?.series,
    match?.seriesName,
    match?.series_id,
    match?.matchType,
    match?.matchTypeLower,
    match?.status
  ]
    .filter(Boolean)
    .join(" ");

  const hasT20 = /t20/.test(normalize(hay));
  const hasWC = /world cup/.test(normalize(hay));
  const dateText = `${match?.dateTime || ""} ${match?.dateTimeGMT || ""} ${match?.date || ""}`;
  const has2026 = /2026/.test(hay) || /2026/.test(dateText);

  return hasT20 && hasWC && has2026;
};

const parseTeams = (match) => {
  if (match?.t1 || match?.t2) {
    return { team1: match?.t1 || "TBD", team2: match?.t2 || "TBD" };
  }
  if (Array.isArray(match?.teams) && match.teams.length >= 2) {
    return { team1: match.teams[0], team2: match.teams[1] };
  }
  if (Array.isArray(match?.teamInfo) && match.teamInfo.length >= 2) {
    return { team1: match.teamInfo[0]?.shortname || match.teamInfo[0]?.name, team2: match.teamInfo[1]?.shortname || match.teamInfo[1]?.name };
  }
  const name = String(match?.name || "");
  const parts = name.split(" vs ");
  if (parts.length >= 2) {
    return { team1: parts[0].trim(), team2: parts[1].trim() };
  }
  return { team1: "TBD", team2: "TBD" };
};

const toGmt = (match) => {
  const dt = match?.dateTimeGMT || match?.dateTime;
  if (!dt) return { date: match?.date || null, timeGMT: null };
  const date = new Date(dt);
  if (Number.isNaN(date.getTime())) return { date: match?.date || null, timeGMT: null };
  const iso = date.toISOString();
  return { date: iso.slice(0, 10), timeGMT: iso.slice(11, 16) };
};

const getStatusLabel = (match) => {
  if (match?.matchEnded === true) return "Completed";
  const status = normalize(match?.status || match?.matchStatus || "");
  if (/match ended|result|won|abandoned|no result|draw|tied|complete|completed|match over/.test(status)) {
    return "Completed";
  }
  return "Scheduled";
};

router.get("/", async (req, res) => {
  try {
    const key = process.env.CRICAPI_SERIES_KEY || process.env.CRICAPI_KEY;
    const seriesId = process.env.CRICAPI_SERIES_ID || "0cdf6736-ad9b-4e95-a647-5ee3a99c5510";
    const data = await cricapiGet("/series_info", { id: seriesId }, key);
    const raw =
      data?.data?.matchList ||
      data?.data?.matches ||
      data?.data?.match ||
      [];
    const list = Array.isArray(raw) ? raw : [];
    if (req.query?.debug) {
      return res.json({
        sampleSeries: list.slice(0, 5).map((m) => m?.series || m?.seriesName || null),
        sampleStatus: list.slice(0, 5).map((m) => m?.status || m?.matchStatus || null),
        sampleVenue: list.slice(0, 5).map((m) => m?.venue || m?.venueName || null),
        sampleIds: list.slice(0, 5).map((m) => m?.id || null),
        total: list.length
      });
    }

    const matches = list
      .filter((match) => isTargetMatch(match))
      .filter((match) => {
        const status = normalize(match?.matchStatus || match?.status || "");
        const isCompleted = /match ended|result|won|abandoned|no result|draw|tied|complete|completed|match over|finished/.test(status);
        return !isCompleted;
      })
      .map((match) => {
        const teams = parseTeams(match);
        const gmt = toGmt(match);
        const venue =
          match?.venue ||
          match?.venueName ||
          match?.venue?.name ||
          match?.ground ||
          match?.groundName ||
          match?.city ||
          "TBD";
        return {
          id: match?.id,
          name: match?.name,
          team1: teams.team1,
          team2: teams.team2,
          venue,
          stage: match?.matchType || match?.matchTypeLower || match?.matchFormat || "Group",
          date: gmt.date,
          timeGMT: gmt.timeGMT,
          status: match?.status || match?.matchStatus || null,
          statusLabel: getStatusLabel(match)
        };
      })
      .filter((match) => match.date)
      .sort((a, b) => (a.date + (a.timeGMT || "")) > (b.date + (b.timeGMT || "")) ? 1 : -1);

    res.json({
      source: "cricapi",
      updatedAt: new Date().toISOString(),
      total: matches.length,
      matches
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
