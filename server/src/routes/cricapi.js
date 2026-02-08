import express from "express";
import { cricapiGet } from "../services/cricapi.js";

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
    const data = await cricapiGet("/match_scorecard", { id: req.params.id, ...req.query });
    res.json(data);
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
