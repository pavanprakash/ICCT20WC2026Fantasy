import dotenv from "dotenv";
import mongoose from "mongoose";
import FantasyMatchPoints from "../models/FantasyMatchPoints.js";
import FantasyRule from "../models/FantasyRule.js";
import Player from "../models/Player.js";
import { applyPlayingXIPoints, DEFAULT_RULESET } from "../services/fantasyScoring.js";

dotenv.config();

const MATCHES = [
  {
    matchId: "12982418-fac9-4344-8cbd-ead8322e5c08",
    matchDate: "2026-02-12",
    matchStartMs: Date.parse("2026-02-12T05:30:00Z"),
    warnings: ["manual_override"],
    playingXI: [
      "Pathum Nissanka",
      "Kamil Mishara",
      "Kusal Mendis",
      "Pavan Rathnayake",
      "Dasun Shanaka",
      "Kamindu Mendis",
      "Dunith Wellalage",
      "Dushan Hemantha",
      "Dushmantha Chameera",
      "Maheesh Theekshana",
      "Matheesha Pathirana",
      "Aamir Kaleem",
      "Jatinder Singh",
      "Hammad Mirza",
      "Mohammad Nadeem",
      "Wasim Ali",
      "Vinayak Shukla",
      "Jiten Ramanandi",
      "Nadeem Khan",
      "Sufyan Mehmood",
      "Shah Faisal",
      "Jay Odedra"
    ],
    points: [
      { name: "Kusal Mendis", batting: 99, bowling: 0, fielding: 14 },
      { name: "Pavan Rathnayake", batting: 112, bowling: 0, fielding: 0 },
      { name: "Dasun Shanaka", batting: 102, bowling: 0, fielding: 0 },
      { name: "Kamindu Mendis", batting: 35, bowling: 34, fielding: 6 },
      { name: "Dushmantha Chameera", batting: 0, bowling: 60, fielding: 8 },
      { name: "Maheesh Theekshana", batting: 0, bowling: 66, fielding: 0 },
      { name: "Dunith Wellalage", batting: 10, bowling: 36, fielding: 0 },
      { name: "Pathum Nissanka", batting: 21, bowling: 0, fielding: 8 },
      { name: "Kamil Mishara", batting: 16, bowling: 0, fielding: 20 },
      { name: "Matheesha Pathirana", batting: 0, bowling: 6, fielding: 0 },
      { name: "Dushan Hemantha", batting: 0, bowling: 26, fielding: 0 },
      { name: "Mohammad Nadeem", batting: 79, bowling: 0, fielding: 0 },
      { name: "Jiten Ramanandi", batting: -2, bowling: 58, fielding: 6 },
      { name: "Aamir Kaleem", batting: 10, bowling: 0, fielding: 0 },
      { name: "Wasim Ali", batting: 51, bowling: -6, fielding: 0 },
      { name: "Sufyan Mehmood", batting: 1, bowling: 24, fielding: 0 },
      { name: "Jay Odedra", batting: -2, bowling: 30, fielding: 0 },
      { name: "Nadeem Khan", batting: 2, bowling: -2, fielding: 8 },
      { name: "Vinayak Shukla", batting: 1, bowling: 0, fielding: 6 },
      { name: "Hammad Mirza", batting: 13, bowling: 0, fielding: 0 },
      { name: "Jatinder Singh", batting: 1, bowling: 0, fielding: 0 },
      { name: "Shah Faisal", batting: 1, bowling: 2, fielding: 0 }
    ]
  },
  {
    matchId: "b403191f-ae3d-4614-83c8-fded8801d716",
    matchDate: "2026-02-12",
    matchStartMs: Date.parse("2026-02-12T09:30:00Z"),
    warnings: ["manual_override"],
    points: [
      { name: "Justin Mosca", batting: 108, bowling: 0, fielding: 14 },
      { name: "Anthony Mosca", batting: 124, bowling: 0, fielding: 8 },
      { name: "Crishan Kalugamage", batting: 0, bowling: 100, fielding: 0 },
      { name: "Ben Manenti", batting: 0, bowling: 66, fielding: 0 },
      { name: "Rohit Paudel", batting: 39, bowling: 0, fielding: 0 },
      { name: "Aarif Sheikh", batting: 43, bowling: 0, fielding: 0 },
      { name: "Aasif Sheikh", batting: 28, bowling: 0, fielding: 0 },
      { name: "Karan KC", batting: 32, bowling: -2, fielding: 0 },
      { name: "Dipendra Singh Airee", batting: 17, bowling: 2, fielding: 0 },
      { name: "Ali Hasan", batting: 0, bowling: 26, fielding: 0 },
      { name: "JJ Smuts", batting: 0, bowling: 34, fielding: 0 },
      { name: "Jaspreet Singh", batting: 0, bowling: 30, fielding: 0 },
      { name: "Harry Manenti", batting: 0, bowling: 0, fielding: 28 },
      { name: "Gian Meade", batting: 0, bowling: 0, fielding: 18 },
      { name: "Grant Stewart", batting: 0, bowling: -2, fielding: 8 },
      { name: "Marcus Campopiano", batting: 0, bowling: 0, fielding: 8 },
      { name: "Kushal Bhurtel", batting: 5, bowling: 0, fielding: 0 },
      { name: "Lokesh Bam", batting: 3, bowling: 0, fielding: 0 },
      { name: "Gulsan Jha", batting: 3, bowling: 0, fielding: 0 },
      { name: "Sandeep Lamichhane", batting: 5, bowling: -2, fielding: 0 },
      { name: "Nandan Yadav", batting: -2, bowling: 0, fielding: 0 },
      { name: "Lalit Rajbanshi", batting: -2, bowling: 0, fielding: 0 }
    ]
  },
  {
    matchId: "d97bd726-63b9-4ab2-af02-a2c9a41ac430",
    matchDate: "2026-02-12",
    matchStartMs: Date.parse("2026-02-12T13:30:00Z"),
    warnings: ["manual_override"],
    playingXI: [
      "Ishan Kishan",
      "Sanju Samson",
      "Tilak Varma",
      "Suryakumar Yadav",
      "Hardik Pandya",
      "Shivam Dube",
      "Rinku Singh",
      "Axar Patel",
      "Varun Chakravarthy",
      "Arshdeep Singh",
      "Jasprit Bumrah",
      "Louren Steenkamp",
      "Jan Frylinck",
      "Jan Nicol Loftie-Eaton",
      "Gerhard Erasmus",
      "JJ Smit",
      "Zane Green",
      "Malan Kruger",
      "Ruben Trumpelmann",
      "Bernard Scholtz",
      "Ben Shikongo",
      "Max Heingo"
    ],
    points: [
      { name: "Gerhard Erasmus", batting: 34, bowling: 132, fielding: 14 },
      { name: "Hardik Pandya", batting: 106, bowling: 64, fielding: 0 },
      { name: "Ishan Kishan", batting: 129, bowling: 0, fielding: 0 },
      { name: "Varun Chakravarthy", batting: 1, bowling: 100, fielding: 0 },
      { name: "Axar Patel", batting: -2, bowling: 74, fielding: 16 },
      { name: "Shivam Dube", batting: 35, bowling: 36, fielding: 8 },
      { name: "Tilak Varma", batting: 41, bowling: 0, fielding: 8 },
      { name: "Sanju Samson", batting: 44, bowling: 0, fielding: 0 },
      { name: "Louren Steenkamp", batting: 53, bowling: 0, fielding: 8 },
      { name: "Jan Frylinck", batting: 42, bowling: 0, fielding: 0 },
      { name: "Jasprit Bumrah", batting: 0, bowling: 34, fielding: 8 },
      { name: "Arshdeep Singh", batting: 2, bowling: 26, fielding: 0 },
      { name: "Bernard Scholtz", batting: 8, bowling: 28, fielding: 0 },
      { name: "Ben Shikongo", batting: -2, bowling: 24, fielding: 14 },
      { name: "JJ Smit", batting: -2, bowling: 24, fielding: 8 },
      { name: "Zane Green", batting: 7, bowling: 0, fielding: 18 },
      { name: "Suryakumar Yadav", batting: 18, bowling: 0, fielding: 0 },
      { name: "Jan Nicol Loftie-Eaton", batting: 17, bowling: 0, fielding: 0 },
      { name: "Malan Kruger", batting: 5, bowling: 0, fielding: 6 },
      { name: "Rinku Singh", batting: 1, bowling: 0, fielding: 0 },
      { name: "Dylan Leicher", batting: 0, bowling: 0, fielding: 8 },
      { name: "Max Heingo", batting: 0, bowling: 0, fielding: 0 },
      { name: "Ruben Trumpelmann", batting: 0, bowling: 0, fielding: 0 }
    ]
  }
];

const PLAYING_XI_BONUS = Number(DEFAULT_RULESET?.additional?.playingXI ?? 4);

const MATCHES_WITH_TOTALS = MATCHES.map((match) => {
  const base = match.points.map((p) => ({ ...p, total: p.batting + p.bowling + p.fielding }));
  const withXI = applyPlayingXIPoints(base, match.playingXI || [], PLAYING_XI_BONUS);
  return { ...match, points: withXI };
});

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function ensureRules() {
  const existing = await FantasyRule.findOne({ name: DEFAULT_RULESET.name });
  if (!existing) {
    await FantasyRule.create(DEFAULT_RULESET);
  }
}

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(mongoUri);
  await ensureRules();
  const rules = await FantasyRule.findOne({ name: DEFAULT_RULESET.name }).lean();

  for (const match of MATCHES_WITH_TOTALS) {
    await FantasyMatchPoints.findOneAndUpdate(
      { matchId: match.matchId, ruleset: rules.name },
      {
        matchId: match.matchId,
        matchDate: match.matchDate,
        matchStartMs: match.matchStartMs,
        ruleset: rules.name,
        points: match.points,
        playingXI: match.playingXI || [],
        warnings: match.warnings || ["manual_override"]
      },
      { upsert: true, new: true }
    );
  }

  const aggregate = new Map();
  const allMatchPoints = await FantasyMatchPoints.find({ ruleset: rules.name }).lean();
  for (const doc of allMatchPoints) {
    for (const p of doc.points || []) {
      const key = normalizeName(p.name);
      const current = aggregate.get(key) || 0;
      aggregate.set(key, current + Number(p.total || 0));
    }
  }

  const players = await Player.find({}).lean();
  const bulk = [];
  for (const player of players) {
    const key = normalizeName(player.name);
    const total = aggregate.get(key) || 0;
    bulk.push({
      updateOne: {
        filter: { _id: player._id },
        update: { $set: { fantasyPoints: total, lastPointsUpdatedAt: new Date() } }
      }
    });
  }
  if (bulk.length) {
    await Player.bulkWrite(bulk);
  }

  await mongoose.disconnect();
  console.log(
    JSON.stringify({
      ok: true,
      matchIds: MATCHES_WITH_TOTALS.map((m) => m.matchId),
      totalPointsRows: MATCHES_WITH_TOTALS.reduce((sum, m) => sum + m.points.length, 0)
    })
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
