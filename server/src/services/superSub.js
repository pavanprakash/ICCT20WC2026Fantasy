import { normalizePlayingXI } from "./playingXI.js";

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
  const team1Key = normalizeName(team1);
  const team2Key = normalizeName(team2);
  const teamMatches = (p) => {
    const country = normalizeName(p?.country || "");
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

  let target = null;
  let minPoints = Infinity;
  for (const p of players) {
    const key = normalizeName(p.name);
    const base = baseMap.get(key) ?? 0;
    if (base < minPoints) {
      minPoints = base;
      target = p;
    }
  }
  if (!target) {
    return { nameSet, roleByName, capName: effectiveCapName, vcName: effectiveVcName, superSubUsed: false };
  }

  const targetKey = normalizeName(target.name);
  nameSet.delete(targetKey);
  nameSet.add(superKey);
  roleByName.set(superKey, superSub.role || roleByName.get(superKey) || "");

  const capKey = normalizeName(effectiveCapName);
  const vcKey = normalizeName(effectiveVcName);
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
