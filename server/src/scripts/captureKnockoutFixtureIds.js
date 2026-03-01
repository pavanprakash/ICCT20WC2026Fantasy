import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { cricapiGet } from "../services/cricapi.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../../..");

const TARGETS = [
  { date: "2026-03-04", team1: "SA", team2: "NZ" },
  { date: "2026-03-05", team1: "IND", team2: "ENG" },
  { date: "2026-03-08", team1: "TBC", team2: "TBC", final: true }
];

const SERIES_ID = process.env.CRICAPI_SERIES_ID || "0cdf6736-ad9b-4e95-a647-5ee3a99c5510";
const KEY = process.env.CRICAPI_SERIES_KEY || process.env.CRICAPI_KEY;

const TEAM_TOKEN = {
  SOUTHAFRICA: "SA",
  RSA: "SA",
  SA: "SA",
  NEWZEALAND: "NZ",
  NZ: "NZ",
  INDIA: "IND",
  IND: "IND",
  ENGLAND: "ENG",
  ENG: "ENG",
  TBC: "TBC",
  TBD: "TBC"
};

const normalize = (v) => String(v || "").toUpperCase().replace(/[^A-Z]/g, "");
const token = (v) => TEAM_TOKEN[normalize(v)] || normalize(v);
const pairKey = (a, b) => [token(a), token(b)].sort().join("|");

function parseDate(match) {
  if (match?.date) return String(match.date).slice(0, 10);
  const dt = match?.dateTimeGMT || match?.dateTime;
  if (!dt) return null;
  const d = new Date(dt);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseTeams(match) {
  if (match?.t1 || match?.t2) return { team1: match.t1, team2: match.t2 };
  if (Array.isArray(match?.teamInfo) && match.teamInfo.length >= 2) {
    return {
      team1: match.teamInfo[0]?.shortname || match.teamInfo[0]?.name,
      team2: match.teamInfo[1]?.shortname || match.teamInfo[1]?.name
    };
  }
  if (Array.isArray(match?.teams) && match.teams.length >= 2) {
    return { team1: match.teams[0], team2: match.teams[1] };
  }
  return { team1: null, team2: null };
}

function injectIdInFixtureObject(objectText, matchId) {
  if (/id:\s*"/.test(objectText)) {
    return objectText.replace(/id:\s*"[^"]*"/, `id: "${matchId}"`);
  }
  return objectText.replace("{", `{ id: "${matchId}",`);
}

function updateFixtureContent(content, row, matchId) {
  const escapedDate = row.date.replace(/[-/]/g, "\\$&");
  const escapedT1 = row.team1.replace(/[-/]/g, "\\$&");
  const escapedT2 = row.team2.replace(/[-/]/g, "\\$&");
  const regex = new RegExp(
    `\\{[^\\n]*date:\\s*"${escapedDate}"[^\\n]*team1:\\s*"${escapedT1}"[^\\n]*team2:\\s*"${escapedT2}"[^\\n]*\\}`,
    "g"
  );
  return content.replace(regex, (obj) => injectIdInFixtureObject(obj, matchId));
}

async function main() {
  if (!KEY) {
    throw new Error("CRICAPI_SERIES_KEY or CRICAPI_KEY is required");
  }

  const series = await cricapiGet("/series_info", { id: SERIES_ID }, KEY);
  const list = series?.data?.matchList || series?.data?.matches || series?.data?.match || [];
  const matches = Array.isArray(list) ? list : [];

  const found = [];
  for (const target of TARGETS) {
    const targetPair = pairKey(target.team1, target.team2);
    const candidates = matches.filter((m) => parseDate(m) === target.date);
    let chosen = null;
    if (target.final) {
      chosen = candidates.find((m) => /final/i.test(String(m?.name || ""))) || null;
    }
    if (!chosen) {
      chosen =
        candidates.find((m) => {
          const t = parseTeams(m);
          return pairKey(t.team1, t.team2) === targetPair;
        }) || null;
    }
    if (chosen?.id) {
      found.push({ ...target, id: String(chosen.id), name: chosen.name || null });
    }
  }

  const files = [
    path.join(ROOT, "client/src/data/fixtures-2026.js"),
    path.join(ROOT, "server/src/data/fixtures-2026.js")
  ];

  for (const file of files) {
    let content = await fs.readFile(file, "utf8");
    for (const row of found) {
      content = updateFixtureContent(content, row, row.id);
    }
    await fs.writeFile(file, content, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        seriesId: SERIES_ID,
        found,
        updatedFiles: files
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

