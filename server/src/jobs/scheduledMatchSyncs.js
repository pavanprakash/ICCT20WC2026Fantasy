import MatchSyncAttempt from "../models/MatchSyncAttempt.js";
import { cricapiGet } from "../services/cricapi.js";
import { syncMatchPoints } from "../services/syncMatchPoints.js";

const MATCH_DURATION_MS = 4 * 60 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;
const OFFSET_15_MS = 15 * 60 * 1000;
const OFFSET_45_MS = 45 * 60 * 1000;

const normalize = (value) => String(value || "").toLowerCase().trim();

const isTargetMatch = (match) => {
  const seriesId = String(match?.series_id || match?.seriesId || "");
  const target = process.env.CRICAPI_SERIES_ID || "0cdf6736-ad9b-4e95-a647-5ee3a99c5510";
  if (seriesId && seriesId === target) return true;
  const hay = [match?.name, match?.series, match?.seriesName, match?.matchType, match?.status]
    .filter(Boolean)
    .join(" ");
  return /t20/.test(normalize(hay)) && /world cup/.test(normalize(hay));
};

const matchStartMs = (match) => {
  const dt = match?.dateTimeGMT || match?.dateTime;
  if (!dt) return null;
  const ms = new Date(dt).getTime();
  return Number.isFinite(ms) ? ms : null;
};

export async function scheduledMatchSyncs() {
  const key = process.env.CRICAPI_SERIES_KEY || process.env.CRICAPI_KEY;
  if (!key) throw new Error("CRICAPI_SERIES_KEY or CRICAPI_KEY is not set");
  const seriesId = process.env.CRICAPI_SERIES_ID || "0cdf6736-ad9b-4e95-a647-5ee3a99c5510";

  const data = await cricapiGet("/series_info", { id: seriesId }, key);
  const raw = data?.data?.matchList || data?.data?.matches || data?.data?.match || [];
  const list = Array.isArray(raw) ? raw : [];
  const matches = list.filter(isTargetMatch);

  const now = Date.now();
  let attempted = 0;

  for (const match of matches) {
    const matchId = match?.id;
    if (!matchId) continue;
    const start = matchStartMs(match);
    if (!start) continue;

    const end = start + MATCH_DURATION_MS;
    const window15Start = end + OFFSET_15_MS;
    const window45Start = end + OFFSET_45_MS;

    const in15 = now >= window15Start && now <= window15Start + WINDOW_MS;
    const in45 = now >= window45Start && now <= window45Start + WINDOW_MS;
    if (!in15 && !in45) continue;

    const attempt = await MatchSyncAttempt.findOne({ matchId }).lean();
    if (in15 && attempt?.attempt15At) continue;
    if (in45 && attempt?.attempt45At) continue;

    try {
      await syncMatchPoints(matchId, { scorecardKey: key });
      await MatchSyncAttempt.findOneAndUpdate(
        { matchId },
        {
          $set: {
            attempt15At: in15 ? new Date() : attempt?.attempt15At,
            attempt45At: in45 ? new Date() : attempt?.attempt45At,
            lastError: null
          }
        },
        { upsert: true, new: true }
      );
      attempted += 1;
    } catch (err) {
      await MatchSyncAttempt.findOneAndUpdate(
        { matchId },
        {
          $set: {
            lastError: err.message,
            attempt15At: in15 ? new Date() : attempt?.attempt15At,
            attempt45At: in45 ? new Date() : attempt?.attempt45At
          }
        },
        { upsert: true, new: true }
      );
    }
  }

  return { attempted };
}
