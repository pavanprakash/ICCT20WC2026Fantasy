import express from "express";
import Player from "../models/Player.js";
import FantasyMatchPoints from "../models/FantasyMatchPoints.js";

const router = express.Router();

const CACHE_TTL_MS = 60 * 1000;
let pointsCache = { expiresAt: 0, totals: new Map() };

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function calcPoints(player) {
  const runs = player.stats?.runs || 0;
  const wickets = player.stats?.wickets || 0;
  const catches = player.stats?.catches || 0;
  return runs + wickets * 20 + catches * 10;
}

router.get("/", async (req, res) => {
  const now = Date.now();
  if (pointsCache.expiresAt <= now) {
    const matchPoints = await FantasyMatchPoints.find({}, { points: 1 }).lean();
    const totals = new Map();
    matchPoints.forEach((match) => {
      (match.points || []).forEach((p) => {
        const key = normalizeName(p?.name);
        if (!key) return;
        const total = Number(p?.total || 0);
        totals.set(key, (totals.get(key) || 0) + total);
      });
    });
    pointsCache = { expiresAt: now + CACHE_TTL_MS, totals };
  }

  const players = await Player.find().lean();
  const withPoints = players.map((p) => ({
    ...p,
    points: pointsCache.totals.get(normalizeName(p.name)) ?? calcPoints(p)
  }));
  res.json(withPoints);
});

export default router;
