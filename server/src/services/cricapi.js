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
