const BASE_URL = "https://api.cricapi.com/v1";

function requireKey() {
  const key = process.env.CRICAPI_KEY;
  if (!key) {
    throw new Error("CRICAPI_KEY is not set");
  }
  return key;
}

function buildUrl(path, params = {}) {
  const apikey = requireKey();
  const search = new URLSearchParams({ apikey, ...params });
  return `${BASE_URL}${path}?${search.toString()}`;
}

export async function cricapiGet(path, params) {
  const url = buildUrl(path, params);
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CricAPI error ${res.status}: ${text}`);
  }
  return res.json();
}
