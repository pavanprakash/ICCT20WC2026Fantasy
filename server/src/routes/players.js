import express from "express";
import Player from "../models/Player.js";

const router = express.Router();

function calcPoints(player) {
  const runs = player.stats?.runs || 0;
  const wickets = player.stats?.wickets || 0;
  const catches = player.stats?.catches || 0;
  return runs + wickets * 20 + catches * 10;
}

router.get("/", async (req, res) => {
  const players = await Player.find().lean();
  const withPoints = players.map((p) => ({
    ...p,
    points: Number.isFinite(p.fantasyPoints) ? p.fantasyPoints : calcPoints(p)
  }));
  res.json(withPoints);
});

export default router;
