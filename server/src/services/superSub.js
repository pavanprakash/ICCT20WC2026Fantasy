import { normalizePlayingXI } from "./playingXI.js";

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeTeamToken(value) {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (!raw) return "";
  const map = {
    AFG: "AFG",
    AFGHANISTAN: "AFG",
    AUS: "AUS",
    AUSTRALIA: "AUS",
    BAN: "BAN",
    BANGLADESH: "BAN",
    CAN: "CAN",
    CANADA: "CAN",
    ENG: "ENG",
    ENGLAND: "ENG",
    IND: "IND",
    INDIA: "IND",
    IRE: "IRE",
    IRELAND: "IRE",
    ITA: "ITA",
    ITALY: "ITA",
    NAM: "NAM",
    NAMIBIA: "NAM",
    NEP: "NEP",
    NEPAL: "NEP",
    NED: "NED",
    NETHERLANDS: "NED",
    NZ: "NZ",
    NEWZEALAND: "NZ",
    OMAN: "OMAN",
    PAK: "PAK",
    PAKISTAN: "PAK",
    SA: "SA",
    SOUTHAFRICA: "SA",
    SCO: "SCO",
    SCOTLAND: "SCO",
    SL: "SL",
    SRILANKA: "SL",
    UAE: "UAE",
    USA: "USA",
    US: "USA",
    WESTINDIES: "WI",
    WI: "WI",
    ZIM: "ZIM",
    ZIMBABWE: "ZIM"
  };
  return map[raw] || raw;
}

function getPlayerNameById(players, idOrObj) {
  if (!idOrObj || !Array.isArray(players)) return null;
  const id = idOrObj?._id || idOrObj;
  const found = players.find((p) => String(p._id) === String(id));
  return found?.name || null;
}

export function applySuperSubByLowest(submission, pointsDoc) {
  const players = submission?.players || [];
  const nameSet = new Set(players.map((p) => normalizeName(p.name)));
  const roleByName = new Map(players.map((p) => [normalizeName(p.name), p.role]));
  const capName = submission?.captain?.name || getPlayerNameById(players, submission?.captain);
  const vcName = submission?.viceCaptain?.name || getPlayerNameById(players, submission?.viceCaptain);
  let effectiveCapName = capName || null;
  let effectiveVcName = vcName || null;

  const superSub = submission?.superSub || null;
  if (!superSub || !players.length) {
    return { nameSet, roleByName, capName: effectiveCapName, vcName: effectiveVcName, superSubUsed: false };
  }

  const playingXI = normalizePlayingXI(pointsDoc?.playingXI || []);
  const team1 = submission?.team1 || pointsDoc?.team1 || "";
  const team2 = submission?.team2 || pointsDoc?.team2 || "";
  const team1Key = normalizeTeamToken(team1);
  const team2Key = normalizeTeamToken(team2);
  const teamMatches = (p) => {
    const country = normalizeTeamToken(p?.country || "");
    return (team1Key && country === team1Key) || (team2Key && country === team2Key);
  };
  const hasTeamMatch = players.some(teamMatches);
  const playingMatchesTeam = playingXI.some((name) =>
    players.some((p) => normalizeName(p.name) === name && teamMatches(p))
  );
  if (hasTeamMatch && !playingMatchesTeam) {
    return { nameSet, roleByName, capName: effectiveCapName, vcName: effectiveVcName, superSubUsed: false };
  }

  const superKey = normalizeName(superSub.name);
  if (!superKey || !playingXI.includes(superKey)) {
    return { nameSet, roleByName, capName: effectiveCapName, vcName: effectiveVcName, superSubUsed: false };
  }

  const points = Array.isArray(pointsDoc?.points) ? pointsDoc.points : [];
  const baseMap = new Map(points.map((p) => [normalizeName(p.name), Number(p.total || 0)]));
  const playingXISet = new Set(playingXI);
  const eligible = players.filter((p) => {
    const key = normalizeName(p?.name);
    return key && teamMatches(p) && playingXISet.has(key);
  });

  if (!eligible.length) {
    return { nameSet, roleByName, capName: effectiveCapName, vcName: effectiveVcName, superSubUsed: false };
  }

  const eligibleWithBase = eligible.map((p) => ({
    player: p,
    key: normalizeName(p.name),
    base: baseMap.get(normalizeName(p.name)) ?? 0
  }));
  const minPoints = Math.min(...eligibleWithBase.map((row) => row.base));
  const minCandidates = eligibleWithBase.filter((row) => row.base === minPoints);
  const capKey = normalizeName(effectiveCapName);
  const vcKey = normalizeName(effectiveVcName);

  // Tie-break priority: captain, then vice-captain, then first in submission order.
  const chosen =
    minCandidates.find((row) => capKey && row.key === capKey) ||
    minCandidates.find((row) => vcKey && row.key === vcKey) ||
    minCandidates[0];
  const target = chosen?.player || null;
  if (!target) {
    return { nameSet, roleByName, capName: effectiveCapName, vcName: effectiveVcName, superSubUsed: false };
  }

  const targetKey = normalizeName(target.name);
  nameSet.delete(targetKey);
  nameSet.add(superKey);
  roleByName.set(superKey, superSub.role || roleByName.get(superKey) || "");

  if (capKey && targetKey === capKey) {
    effectiveCapName = superSub.name;
  } else if (vcKey && targetKey === vcKey) {
    effectiveVcName = superSub.name;
  }

  return {
    nameSet,
    roleByName,
    capName: effectiveCapName,
    vcName: effectiveVcName,
    superSubUsed: true,
    superSubName: superSub.name,
    superSubReplaced: target.name
  };
}
