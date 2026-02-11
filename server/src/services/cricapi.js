const BASE_URL = "https://api.cricapi.com/v1";

function requireKey(override) {
  const key = override || process.env.CRICAPI_KEY;
  if (!key) {
    throw new Error("CRICAPI_KEY is not set");
  }
  return key;
}

function buildUrl(path, params = {}, overrideKey) {
  const apikey = requireKey(overrideKey);
  const search = new URLSearchParams({ apikey, ...params });
  return `${BASE_URL}${path}?${search.toString()}`;
}

export async function cricapiGet(path, params, overrideKey) {
  const url = buildUrl(path, params, overrideKey);
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CricAPI error ${res.status}: ${text}`);
  }
  return res.json();
}

function extractMatchStatus(matchInfo) {
  return (
    matchInfo?.data?.status ||
    matchInfo?.data?.matchStatus ||
    matchInfo?.status ||
    ""
  );
}

function isNotStartedStatus(status) {
  const value = String(status || "").toLowerCase();
  return (
    value.includes("not started") ||
    value.includes("upcoming") ||
    value.includes("fixture") ||
    value.includes("scheduled")
  );
}

function isScorecardNotFoundError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("scorecard") && msg.includes("not found");
}

export async function cricapiGetScorecardSafe(matchId, overrideKey) {
  let matchInfo = null;
  try {
    matchInfo = await cricapiGet("/match_info", { id: matchId }, overrideKey);
    const status = extractMatchStatus(matchInfo);
    if (isNotStartedStatus(status)) {
      return { skipped: true, reason: "not_started", matchInfo };
    }
  } catch (err) {
    // If match_info fails, fall back to scorecard attempt.
  }

  try {
    const data = await cricapiGet("/match_scorecard", { id: matchId }, overrideKey);
    return { skipped: false, data, matchInfo };
  } catch (err) {
    if (isScorecardNotFoundError(err)) {
      return { skipped: true, reason: "not_found", error: err, matchInfo };
    }
    throw err;
  }
}
