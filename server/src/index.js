import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.js";
import playerRoutes from "./routes/players.js";
import teamRoutes from "./routes/teams.js";
import leagueRoutes from "./routes/leagues.js";
import cricapiRoutes from "./routes/cricapi.js";
import fantasyRoutes from "./routes/fantasy.js";
import fixturesRoutes from "./routes/fixtures.js";
import cron from "node-cron";
import { updateAllLeaguesDaily } from "./jobs/dailyLeagueUpdate.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const allowlist = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (!allowlist.length) {
        return cb(null, true);
      }
      if (allowlist.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    }
  })
);
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "ICC Fantasy API running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/players", playerRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/leagues", leagueRoutes);
app.use("/api/cricapi", cricapiRoutes);
app.use("/api/fantasy", fantasyRoutes);
app.use("/api/fixtures", fixturesRoutes);

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    // Run daily sync at 19:00 UTC (7pm GMT)
    cron.schedule(
      "0 19 * * *",
      async () => {
        try {
          const result = await updateAllLeaguesDaily();
          console.log("Daily league update completed", result);
        } catch (err) {
          console.error("Daily league update failed:", err.message);
        }
      },
      { timezone: "UTC" }
    );
    app.listen(PORT, () => console.log(`Server running on ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });
