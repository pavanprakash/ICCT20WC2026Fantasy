function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractName(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return (
    entry.name ||
    entry.fullName ||
    entry.shortName ||
    entry.batsman?.name ||
    entry.batsman?.fullName ||
    entry.bowler?.name ||
    entry.bowler?.fullName ||
    entry.player?.name ||
    entry.player?.fullName ||
    entry.catcher?.name ||
    entry.catcher?.fullName ||
    entry.batsman ||
    entry.bowler ||
    entry.player ||
    ""
  );
}

function getInnings(scoreRoot) {
  if (!scoreRoot) return [];
  if (Array.isArray(scoreRoot)) return scoreRoot;
  if (Array.isArray(scoreRoot.scorecard)) return scoreRoot.scorecard;
  if (Array.isArray(scoreRoot.innings)) return scoreRoot.innings;
  return [];
}

function extractPlayingXIFields(scoreRoot) {
  const names = [];
  const addNames = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach((val) => {
      const name = extractName(val);
      if (name) names.push(name);
    });
  };
  const scan = (obj, depth = 0) => {
    if (!obj || typeof obj !== "object" || depth > 3) return;
    for (const [key, value] of Object.entries(obj)) {
      if (!value) continue;
      const lower = key.toLowerCase();
      if (lower.includes("playing") && (lower.includes("xi") || lower.includes("11"))) {
        addNames(value);
      } else if (Array.isArray(value) && value.length && typeof value[0] === "string") {
        if (lower === "playingxi" || lower === "playing11") {
          addNames(value);
        }
      } else if (typeof value === "object") {
        scan(value, depth + 1);
      }
    }
  };
  scan(scoreRoot, 0);
  return Array.from(new Set(names.map((n) => String(n).trim()).filter(Boolean)));
}

function extractSubstituteFields(scoreRoot) {
  const names = [];
  const addNames = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach((val) => {
      const name = extractName(val);
      if (name) names.push(name);
    });
  };
  const scan = (obj, depth = 0) => {
    if (!obj || typeof obj !== "object" || depth > 4) return;
    for (const [key, value] of Object.entries(obj)) {
      if (!value) continue;
      const lower = key.toLowerCase();
      const isSubKey =
        lower.includes("substitute") ||
        lower.includes("replacement") ||
        lower.includes("impact");
      if (isSubKey) {
        if (Array.isArray(value)) {
          addNames(value);
        } else if (typeof value === "object") {
          scan(value, depth + 1);
        }
      } else if (typeof value === "object") {
        scan(value, depth + 1);
      }
    }
  };
  scan(scoreRoot, 0);
  return Array.from(new Set(names.map((n) => String(n).trim()).filter(Boolean)));
}

function inferFromInnings(scoreRoot) {
  const names = new Set();
  const innings = getInnings(scoreRoot);
  const addEntries = (entries) => {
    if (!Array.isArray(entries)) return;
    entries.forEach((entry) => {
      const name = extractName(entry);
      if (name) names.add(name);
    });
  };
  innings.forEach((inn) => {
    addEntries(inn?.batting || inn?.batsmen || inn?.battingScorecard);
    addEntries(inn?.bowling || inn?.bowlers || inn?.bowlingScorecard);
    addEntries(inn?.fielding);
  });
  return Array.from(names);
}

export function getPlayingXI(scoreRoot) {
  const direct = extractPlayingXIFields(scoreRoot);
  if (direct.length) return direct;
  return inferFromInnings(scoreRoot);
}

export function getPlayingSubstitutes(scoreRoot, playingXI = []) {
  const subs = extractSubstituteFields(scoreRoot);
  if (!subs.length) return [];
  const xiSet = new Set((playingXI || []).map((n) => normalizeName(n)).filter(Boolean));
  return subs.filter((name) => !xiSet.has(normalizeName(name)));
}

export function normalizePlayingXI(list) {
  return Array.from(new Set((list || []).map((n) => normalizeName(n)).filter(Boolean)));
}
