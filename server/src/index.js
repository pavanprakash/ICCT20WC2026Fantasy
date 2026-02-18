import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.js";
import playerRoutes from "./routes/players.js";
import teamRoutes from "./routes/teams.js";
import leagueRoutes from "./routes/leagues.js";
import cricapiRoutes from "./routes/cricapi.js";
import fantasyRoutes from "./routes/fantasy.js";
import fixturesRoutes from "./routes/fixtures.js";
import cron from "node-cron";
import { updateAllLeaguesDaily } from "./jobs/dailyLeagueUpdate.js";
import { autoSubmitMissingTeams } from "./jobs/autoSubmitTeams.js";
import { scheduledMatchSyncs } from "./jobs/scheduledMatchSyncs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  process.env.DOTENV_PATH,
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "server/.env"),
  path.resolve(__dirname, "../.env")
].filter(Boolean);

for (const envPath of envCandidates) {
  dotenv.config({ path: envPath });
  if (process.env.CRICAPI_KEY || process.env.CRICAPI_SERIES_KEY) {
    console.log(`Loaded env from ${envPath}`);
    break;
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

app.set("trust proxy", 1);

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

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false
});

app.get("/", (req, res) => {
  res.status(200).send("ICC Fantasy API is running");
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "ICC Fantasy API running" });
});

app.use("/api", apiLimiter);
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
    // Run daily sync twice at 13:00 and 18:00 UTC (1pm & 6pm GMT)
    ["0 13 * * *", "0 18 * * *"].forEach((schedule) => {
      cron.schedule(
        schedule,
        async () => {
          try {
            const autoResult = await autoSubmitMissingTeams();
            console.log("Auto submissions completed", autoResult);
            const result = await updateAllLeaguesDaily();
            console.log("Daily league update completed", result);
          } catch (err) {
            console.error("Daily league update failed:", err.message);
          }
        },
        { timezone: "UTC" }
      );
    });
    // Auto-submit missing teams every 10 minutes after matches start.
    cron.schedule(
      "*/10 * * * *",
      async () => {
        try {
          const autoResult = await autoSubmitMissingTeams();
          if (autoResult.autoSubmissions || autoResult.matchesChecked) {
            console.log("Auto submissions completed", autoResult);
          }
        } catch (err) {
          console.error("Auto submissions failed:", err.message);
        }
      },
      { timezone: "UTC" }
    );

    // Sync match points 15 and 45 minutes after scheduled end time.
    cron.schedule(
      "*/5 * * * *",
      async () => {
        try {
          const result = await scheduledMatchSyncs();
          if (result.attempted) {
            console.log("Scheduled match syncs completed", result);
          }
        } catch (err) {
          console.error("Scheduled match syncs failed:", err.message);
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
