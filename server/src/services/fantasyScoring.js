export const DEFAULT_RULESET = {
  name: "ICC_T20_2026",
  batting: {
    run: 1,
    boundary: 4,
    six: 6,
    bonus25: 4,
    bonus50: 8,
    bonus75: 12,
    bonus100: 16,
    duck: -2,
    strikeRate: {
      minBalls: 10,
      exceptBowler: true,
      gt170: 6,
      between150_170: 4,
      between130_150: 2,
      between60_70: -2,
      between50_59_99: -4,
      below50: -6
    }
  },
  bowling: {
    dotBall: 1,
    wicket: 30,
    lbwBowledBonus: 8,
    bonus3w: 4,
    bonus4w: 8,
    bonus5w: 12,
    maidenOver: 12,
    economy: {
      minOvers: 2,
      below5: 6,
      between5_5_99: 4,
      between6_7: 2,
      between10_11: -2,
      between11_12: -4,
      above12: -6
    }
  },
  fielding: {
    catch: 8,
    threeCatchBonus: 4,
    stumping: 12,
    runoutDirect: 12,
    runoutIndirect: 6
  },
  additional: {
    captainMultiplier: 2,
    viceCaptainMultiplier: 1.5,
    announcedLineup: 4,
    playingSubstitute: 4,
    playingXI: 4
  }
};

function oversToBalls(oversValue) {
  if (oversValue === undefined || oversValue === null) return 0;
  const str = String(oversValue);
  if (!str.includes(".")) {
    return Math.round(Number(str) * 6);
  }
  const [whole, part] = str.split(".");
  return Number(whole) * 6 + Number(part);
}

function toNumber(val) {
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

function isPureBowlerRole(roleValue) {
  const role = String(roleValue || "").toLowerCase();
  return role.includes("bowl") && !role.includes("all");
}

function getInnings(scorecardData) {
  if (!scorecardData) return [];
  if (Array.isArray(scorecardData)) return scorecardData;
  if (Array.isArray(scorecardData.scorecard)) return scorecardData.scorecard;
  if (Array.isArray(scorecardData.innings)) return scorecardData.innings;
  return [];
}

function getBattingEntries(innings) {
  return innings?.batting || innings?.batsmen || innings?.battingScorecard || [];
}

function getBowlingEntries(innings) {
  return innings?.bowling || innings?.bowlers || innings?.bowlingScorecard || [];
}

function getFieldingEntries(innings) {
  return innings?.fielding || [];
}

function normalizeName(entry) {
  const name =
    entry?.name ||
    entry?.fullName ||
    entry?.shortName ||
    entry?.batsman?.name ||
    entry?.batsman?.fullName ||
    entry?.bowler?.name ||
    entry?.bowler?.fullName ||
    entry?.catcher?.name ||
    entry?.catcher?.fullName ||
    entry?.player?.name ||
    entry?.player?.fullName ||
    entry?.batsman ||
    entry?.bowler ||
    entry?.player ||
    "";
  return String(name).trim();
}

function battingPoints(entry, rules, options = {}) {
  const runs = toNumber(entry.runs ?? entry.r ?? entry.score);
  const balls = toNumber(entry.balls ?? entry.b);
  const fours = toNumber(entry.fours ?? entry["4s"] ?? entry.four);
  const sixes = toNumber(entry.sixes ?? entry["6s"] ?? entry.six);
  const dismissal = String(entry.dismissal ?? entry.outDesc ?? entry.out ?? "").toLowerCase();
  const out = dismissal.length > 0 && dismissal !== "not out";
  const applyStrikeRate = options.applyStrikeRate !== false;

  let points = 0;
  points += runs * rules.batting.run;
  points += fours * rules.batting.boundary;
  points += sixes * rules.batting.six;

  if (runs >= 100) points += rules.batting.bonus100;
  else if (runs >= 75) points += rules.batting.bonus75;
  else if (runs >= 50) points += rules.batting.bonus50;
  else if (runs >= 25) points += rules.batting.bonus25;

  if (runs === 0 && out) points += rules.batting.duck;

  if (applyStrikeRate && balls >= rules.batting.strikeRate.minBalls) {
    const strikeRate = (runs / balls) * 100;
    if (strikeRate > 170) points += rules.batting.strikeRate.gt170;
    else if (strikeRate > 150) points += rules.batting.strikeRate.between150_170;
    else if (strikeRate >= 130) points += rules.batting.strikeRate.between130_150;
    else if (strikeRate >= 60 && strikeRate <= 70) points += rules.batting.strikeRate.between60_70;
    else if (strikeRate >= 50 && strikeRate < 60) points += rules.batting.strikeRate.between50_59_99;
    else if (strikeRate < 50) points += rules.batting.strikeRate.below50;
  }

  return { points, runs, balls, fours, sixes };
}

function bowlingPoints(entry, rules) {
  const wickets = toNumber(entry.wickets ?? entry.w);
  const runsConceded = toNumber(entry.runs ?? entry.r);
  const overs = entry.overs ?? entry.o;
  const maidens = toNumber(entry.maidens ?? entry.m);
  const balls = oversToBalls(overs);
  const dotBalls = toNumber(
    entry.dotBalls ??
    entry.dots ??
    entry.dotballs ??
    entry["0s"] ??
    entry.zeroes ??
    entry.zeroBalls
  );

  let points = 0;
  points += wickets * rules.bowling.wicket;
  points += dotBalls * rules.bowling.dotBall;

  if (wickets >= 5) points += rules.bowling.bonus5w;
  else if (wickets >= 4) points += rules.bowling.bonus4w;
  else if (wickets >= 3) points += rules.bowling.bonus3w;

  points += maidens * rules.bowling.maidenOver;

  if (balls >= rules.bowling.economy.minOvers * 6) {
    const economy = runsConceded / (balls / 6);
    if (economy < 5) points += rules.bowling.economy.below5;
    else if (economy >= 5 && economy < 6) points += rules.bowling.economy.between5_5_99;
    else if (economy >= 6 && economy <= 7) points += rules.bowling.economy.between6_7;
    else if (economy >= 10 && economy <= 11) points += rules.bowling.economy.between10_11;
    else if (economy > 11 && economy <= 12) points += rules.bowling.economy.between11_12;
    else if (economy > 12) points += rules.bowling.economy.above12;
  }

  return { points, wickets, runsConceded, overs, maidens, dotBalls };
}

function fieldingPoints(entry, rules) {
  const catches = toNumber(entry.catches ?? entry.catch);
  const stumpings = toNumber(entry.stumpings ?? entry.stumping ?? entry.stumped);
  const runoutDirect = toNumber(entry.runoutDirect ?? entry.runout_direct);
  const runoutIndirect = toNumber(entry.runoutIndirect ?? entry.runout_indirect);

  let points = 0;
  points += catches * rules.fielding.catch;
  if (catches >= 3) points += rules.fielding.threeCatchBonus;
  points += stumpings * rules.fielding.stumping;
  points += runoutDirect * rules.fielding.runoutDirect;
  points += runoutIndirect * rules.fielding.runoutIndirect;

  return { points, catches, stumpings, runoutDirect, runoutIndirect };
}

function addPointsToMap(map, name, bucket, points) {
  if (!name || !points) return;
  const current = map.get(name) || { name, batting: 0, bowling: 0, fielding: 0 };
  current[bucket] += points;
  map.set(name, current);
}

function parseRunoutFielders(entry) {
  const names = [];
  const dismissalText = String(entry?.["dismissal-text"] ?? entry?.dismissalText ?? "").trim();
  const match = dismissalText.match(/run out\s*\(([^)]+)\)/i);
  if (match && match[1]) {
    const split = match[1]
      .split(/[\/,&]/)
      .map((v) => v.trim())
      .filter(Boolean);
    names.push(...split);
  }
  if (!names.length && entry?.catcher?.name) {
    names.push(String(entry.catcher.name).trim());
  }
  return Array.from(new Set(names));
}

function isLbwOrBowledDismissal(entry) {
  const dismissal = String(entry?.dismissal || "").toLowerCase();
  if (dismissal === "lbw" || dismissal === "bowled") return true;
  const text = String(entry?.["dismissal-text"] ?? entry?.dismissalText ?? "").toLowerCase();
  if (text.startsWith("lbw b ")) return true;
  if (/^\bb\s+[a-z]/.test(text)) return true;
  return false;
}

export function calculateMatchPoints(scorecardData, rules, options = {}) {
  const innings = getInnings(scorecardData);
  const map = new Map();
  const roleByName = options?.playerRoleByName instanceof Map ? options.playerRoleByName : new Map();

  innings.forEach((inn) => {
    getBattingEntries(inn).forEach((entry) => {
      const name = normalizeName(entry);
      if (!name) return;
      const role = roleByName.get(normalizeName(name)) || "";
      const applyStrikeRate =
        !(rules?.batting?.strikeRate?.exceptBowler && isPureBowlerRole(role));
      const result = battingPoints(entry, rules, { applyStrikeRate });
      addPointsToMap(map, name, "batting", result.points);

      // Bowling bonus: wicket by LBW/Bowled
      if (isLbwOrBowledDismissal(entry)) {
        const bowlerName = normalizeName(entry?.bowler?.name || entry?.bowler);
        addPointsToMap(map, bowlerName, "bowling", toNumber(rules?.bowling?.lbwBowledBonus));
      }

      // Fielding run-out direct/indirect split.
      const dismissal = String(entry?.dismissal || "").toLowerCase();
      if (dismissal === "runout" || dismissal === "run out") {
        const fielders = parseRunoutFielders(entry);
        if (fielders.length === 1) {
          addPointsToMap(map, fielders[0], "fielding", toNumber(rules?.fielding?.runoutDirect));
        } else if (fielders.length > 1) {
          fielders.forEach((f) => {
            addPointsToMap(map, f, "fielding", toNumber(rules?.fielding?.runoutIndirect));
          });
        }
      }
    });

    getBowlingEntries(inn).forEach((entry) => {
      const name = normalizeName(entry);
      if (!name) return;
      const result = bowlingPoints(entry, rules);
      addPointsToMap(map, name, "bowling", result.points);
    });

    getFieldingEntries(inn).forEach((entry) => {
      const name = normalizeName(entry);
      if (!name) return;
      const result = fieldingPoints(entry, rules);
      addPointsToMap(map, name, "fielding", result.points);
    });
  });

  const points = Array.from(map.values()).map((p) => ({
    ...p,
    total: p.batting + p.bowling + p.fielding
  }));

  return points.sort((a, b) => b.total - a.total);
}

export function applyPlayingXIPoints(
  points = [],
  playingXI = [],
  bonus = Number(DEFAULT_RULESET?.additional?.playingXI ?? 4),
  playingSubstitutes = [],
  substituteBonus = Number(DEFAULT_RULESET?.additional?.playingSubstitute ?? 4)
) {
  const list = Array.isArray(points) ? points.map((p) => ({ ...p })) : [];
  const lookup = new Map(list.map((p) => [normalizeName(p.name), p]));
  const xi = Array.isArray(playingXI) ? playingXI : [];
  const substitutes = Array.isArray(playingSubstitutes) ? playingSubstitutes : [];
  xi.forEach((name) => {
    const key = normalizeName(name);
    if (!key) return;
    const current = lookup.get(key);
    if (current) {
      current.appearance = (current.appearance || 0) + bonus;
      current.total = (current.total || 0) + bonus;
    } else {
      const entry = { name, batting: 0, bowling: 0, fielding: 0, appearance: bonus, total: bonus };
      list.push(entry);
      lookup.set(key, entry);
    }
  });

  const xiKeys = new Set(xi.map((name) => normalizeName(name)).filter(Boolean));
  substitutes.forEach((name) => {
    const key = normalizeName(name);
    if (!key || xiKeys.has(key)) return;
    const current = lookup.get(key);
    if (current) {
      current.substituteAppearance = (current.substituteAppearance || 0) + substituteBonus;
      current.total = (current.total || 0) + substituteBonus;
    } else {
      const entry = {
        name,
        batting: 0,
        bowling: 0,
        fielding: 0,
        substituteAppearance: substituteBonus,
        total: substituteBonus
      };
      list.push(entry);
      lookup.set(key, entry);
    }
  });

  return list.sort((a, b) => b.total - a.total);
}
