import express from "express";
import { cricapiGet, cricapiGetScorecardSafe } from "../services/cricapi.js";

const router = express.Router();

router.get("/currentMatches", async (req, res) => {
  try {
    const data = await cricapiGet("/currentMatches", req.query);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get("/matches", async (req, res) => {
  try {
    const data = await cricapiGet("/matches", req.query);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get("/series", async (req, res) => {
  try {
    const data = await cricapiGet("/series", req.query);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get("/match_info/:id", async (req, res) => {
  try {
    const data = await cricapiGet("/match_info", { id: req.params.id, ...req.query });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get("/match_scorecard/:id", async (req, res) => {
  try {
    const safe = await cricapiGetScorecardSafe(req.params.id);
    if (safe.skipped) {
      console.warn(
        JSON.stringify({
          source: "routes/cricapi:GET /match_scorecard/:id",
          matchId: req.params.id,
          reason: safe.reason || "unavailable"
        })
      );
      return res.json({
        skipped: true,
        reason: safe.reason || "unavailable",
        matchId: req.params.id
      });
    }
    res.json(safe.data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get("/match_points/:id", async (req, res) => {
  try {
    const data = await cricapiGet("/match_points", { id: req.params.id, ...req.query });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get("/match_squad/:id", async (req, res) => {
  try {
    const data = await cricapiGet("/match_squad", { id: req.params.id, ...req.query });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
