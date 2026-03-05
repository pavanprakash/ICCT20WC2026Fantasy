import FantasyPointOverride from "../models/FantasyPointOverride.js";
import { normalizeNameKey } from "../utils/nameCanonical.js";

function normalizeName(value) {
  return normalizeNameKey(value);
}

function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function computeTotal(row) {
  return (
    Number(row.batting || 0) +
    Number(row.bowling || 0) +
    Number(row.fielding || 0) +
    Number(row.appearance || 0) +
    Number(row.substituteAppearance || 0)
  );
}

export async function applyPointOverrides(points = [], { matchId, ruleset }) {
  if (!matchId || !ruleset) return Array.isArray(points) ? points : [];

  const overrides = await FantasyPointOverride.find({
    matchId,
    ruleset,
    active: true
  }).lean();

  if (!overrides.length) return Array.isArray(points) ? points : [];

  const list = Array.isArray(points) ? points.map((p) => ({ ...p })) : [];
  const indexByKey = new Map();
  list.forEach((p, idx) => {
    const key = normalizeName(p?.name);
    if (key) indexByKey.set(key, idx);
  });

  for (const ov of overrides) {
    const key = normalizeName(ov?.playerKey || ov?.playerName);
    if (!key) continue;

    let idx = indexByKey.get(key);
    if (idx === undefined) {
      list.push({
        name: ov.playerName || ov.playerKey,
        batting: 0,
        bowling: 0,
        fielding: 0,
        appearance: 0,
        substituteAppearance: 0,
        total: 0
      });
      idx = list.length - 1;
      indexByKey.set(key, idx);
    }

    const row = { ...list[idx] };
    if (ov.playerName) row.name = ov.playerName;

    const batting = toNumberOrNull(ov.batting);
    const bowling = toNumberOrNull(ov.bowling);
    const fielding = toNumberOrNull(ov.fielding);
    const appearance = toNumberOrNull(ov.appearance);
    const substituteAppearance = toNumberOrNull(ov.substituteAppearance);
    const total = toNumberOrNull(ov.total);

    if (batting !== null) row.batting = batting;
    if (bowling !== null) row.bowling = bowling;
    if (fielding !== null) row.fielding = fielding;
    if (appearance !== null) row.appearance = appearance;
    if (substituteAppearance !== null) row.substituteAppearance = substituteAppearance;

    row.total = total !== null ? total : computeTotal(row);
    list[idx] = row;
  }

  return list.sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
}
