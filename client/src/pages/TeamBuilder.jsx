import React, { useEffect, useMemo, useState } from "react";
import api from "../api.js";
import fixtures from "../data/fixtures-2026.js";
import SelectedTeamField from "../components/SelectedTeamField.jsx";
import { countryFlag } from "../utils/flags.js";
import batsmanBooster from "../assets/Batsman-Booster.png";
import bowlerBooster from "../assets/Bowler-Booster.png";
import wkBooster from "../assets/Booster-Wk.png";
import allRounderBooster from "../assets/AllRounderBooster.png";
import teamX2Booster from "../assets/TeamX2.svg";
import captainX3Booster from "../assets/CAPT-X3.svg";

const BUDGET = 100;
const TEAM_SIZE = 11;
const MAX_PER_TEAM = 7;
const ROLE_LIMITS = {
  bat: 5,
  bowl: 5,
  wk: 4,
  ar: 4
};
const ROLE_MIN = {
  bat: 3,
  bowl: 3,
  wk: 1,
  ar: 1
};
const MATCH_DURATION_MS = 4 * 60 * 60 * 1000;
const SYNC_WINDOW_MS = 10 * 60 * 1000;
const LOCK_BEFORE_MS = 5 * 1000;
const LOCK_AFTER_MS = 5 * 60 * 1000;
const FIRST_SUPER8_START_MS = Date.UTC(2026, 1, 21, 13, 30, 0, 0);
const TEMP_SUPER_SUB_DISABLED_MATCH_ID = String(import.meta.env.VITE_SUPER_SUB_DISABLED_MATCH_ID || "").trim();
const formatPrice = (value) => Number(value || 0).toFixed(1);
const todayUtc = () => {
  const now = new Date();
  return now.toISOString().slice(0, 10);
};

const addUtcDays = (dateKey, offsetDays) => {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
};

const nextFixtureDateUtc = () => {
  const today = todayUtc();
  const dates = fixtures.map((f) => f.date);
  const unique = Array.from(new Set(dates)).filter((d) => d > today).sort();
  return unique[0] || today;
};

const roundKey = todayUtc;

const parseMatchStart = (match) => {
  if (!match?.date || !match?.timeGMT) return null;
  const start = new Date(`${match.date}T${match.timeGMT}:00Z`).getTime();
  if (!Number.isFinite(start)) return null;
  return { ...match, startMs: start };
};

const fixtureKey = (match) => `${match?.date || ""}|${match?.timeGMT || match?.time || ""}`;

const mergeFixturesWithLocal = (apiMatches = []) => {
  const localByKey = new Map(
    fixtures.map((m) => [fixtureKey(m), { ...m, timeGMT: m.timeGMT || m.time || null }])
  );
  const merged = [];
  const seen = new Set();

  for (const apiMatch of apiMatches) {
    const key = fixtureKey(apiMatch);
    const local = localByKey.get(key);
    if (local) {
      merged.push({
        ...apiMatch,
        team1: local.team1 || apiMatch.team1,
        team2: local.team2 || apiMatch.team2,
        venue: local.venue || apiMatch.venue,
        stage: local.stage || apiMatch.stage,
        date: local.date || apiMatch.date,
        timeGMT: local.timeGMT || apiMatch.timeGMT || apiMatch.time || null
      });
      seen.add(key);
    } else {
      merged.push(apiMatch);
    }
  }

  for (const local of fixtures) {
    const key = fixtureKey(local);
    if (!seen.has(key)) {
      merged.push({ ...local, timeGMT: local.timeGMT || local.time || null, statusLabel: "Scheduled" });
    }
  }

  return merged.sort((a, b) => `${a.date || ""}${a.timeGMT || ""}`.localeCompare(`${b.date || ""}${b.timeGMT || ""}`));
};

const computeMatchWindow = (matches) => {
  const list = matches.map(parseMatchStart).filter(Boolean).sort((a, b) => a.startMs - b.startMs);
  const now = Date.now();
  const lockMatch = list.find(
    (m) => now >= m.startMs - LOCK_BEFORE_MS && now <= m.startMs + LOCK_AFTER_MS
  );
  const nextMatch = list.find((m) => m.startMs > now);
  return { list, lockMatch, nextMatch };
};

const roleKey = (player) => {
  const role = String(player?.role || "").toLowerCase();
  if (role.includes("wk") || role.includes("keeper")) return "wk";
  if (role.includes("all")) return "ar";
  if (role.includes("bowl")) return "bowl";
  return "bat";
};

export default function TeamBuilder() {
  const statusRef = React.useRef(null);
  const selectedXiRef = React.useRef(null);
  const [players, setPlayers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [teamName, setTeamName] = useState("My XI");
  const [status, setStatus] = useState(null);
  const [captainId, setCaptainId] = useState("");
  const [viceCaptainId, setViceCaptainId] = useState("");
  const [isEditing, setIsEditing] = useState(true);
  const [savedTeam, setSavedTeam] = useState({ players: [], captainId: "", viceCaptainId: "" });
  const [editSecondsLeft, setEditSecondsLeft] = useState(0);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState([]);
  const [roleFilter, setRoleFilter] = useState("all");
  const [priceRange, setPriceRange] = useState("all");
  const [fixtureDay, setFixtureDay] = useState([]);
  const [fixtureStatus, setFixtureStatus] = useState("loading");
  const [fixturesAll, setFixturesAll] = useState([]);
  const [fixtureDateFilter, setFixtureDateFilter] = useState("");
  const [nextMatch, setNextMatch] = useState(null);
  const [teamMeta, setTeamMeta] = useState(null);
  const [submissionLock, setSubmissionLock] = useState({ locked: false, message: null });
  const [lockMeta, setLockMeta] = useState({ firstStart: null, lockUntil: null });
  const [dailyPoints, setDailyPoints] = useState({ total: 0, matches: 0, loading: true });
  const [periodPoints, setPeriodPoints] = useState({ total: 0, matches: 0, loading: true });
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const [playersStatus, setPlayersStatus] = useState("loading");
  const [boosterSelected, setBoosterSelected] = useState(null);
  const [boosterPlayerId, setBoosterPlayerId] = useState("");
  const [superSubId, setSuperSubId] = useState("");
  const [submissionHistory, setSubmissionHistory] = useState([]);

  const refreshPlayers = async (shouldApply = () => true) => {
    const res = await api.get("/players");
    if (!shouldApply()) return;
    setPlayers(res.data);
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        await api.post("/fantasy/sync");
      } catch (err) {
        // Sync failures should not block showing players.
      }
      try {
        setPlayersStatus("loading");
        const [p, t, s] = await Promise.all([api.get("/players"), api.get("/teams/me"), api.get("/fantasy/submissions")]);
        if (!mounted) return;
        const list = Array.isArray(p.data) ? p.data : [];
        setPlayers(list);
        setPlayersStatus(list.length ? "ready" : "empty");
        setSubmissionHistory(s.data?.submissions || []);
        if (t.data) {
          setTeamName(t.data.name);
          setSelected(t.data.players.map((pl) => pl._id));
          setCaptainId(t.data.captain ? String(t.data.captain) : "");
          setViceCaptainId(t.data.viceCaptain ? String(t.data.viceCaptain) : "");
          setBoosterPlayerId(t.data.boosterPlayer ? String(t.data.boosterPlayer) : "");
          setSuperSubId(t.data.superSub ? String(t.data.superSub) : "");
          setSavedTeam({
            players: t.data.players.map((pl) => pl._id),
            captainId: t.data.captain ? String(t.data.captain) : "",
            viceCaptainId: t.data.viceCaptain ? String(t.data.viceCaptain) : ""
          });
          setIsEditing(false);
        const usedBoosters = Array.isArray(t.data.usedBoosters) && t.data.usedBoosters.length
          ? t.data.usedBoosters
          : (t.data.boosterUsed && t.data.boosterType ? [t.data.boosterType] : []);
        setTeamMeta({
          lockedInLeague: t.data.lockedInLeague || false,
          transfersLimit: t.data.transfersLimit ?? 120,
          transfersUsedTotal: t.data.transfersUsedTotal ?? 0,
          transfersByRound: t.data.transfersByRound || {},
          submittedAt: t.data.submittedAt || null,
          lastSubmissionDate: t.data.lastSubmissionDate || null,
          submittedForDate: t.data.submittedForDate || null,
          submittedForMatchId: t.data.submittedForMatchId || null,
          submittedForMatchStart: t.data.submittedForMatchStart || null,
          boosterUsed: t.data.boosterUsed || false,
          boosterType: t.data.boosterType || null,
          usedBoosters,
          boosterPlayer: t.data.boosterPlayer || null,
          superSub: t.data.superSub || null
        });
        setBoosterSelected(null);
        } else {
          setTeamMeta(null);
          setSavedTeam({ players: [], captainId: "", viceCaptainId: "" });
          setIsEditing(true);
        }
      } catch (err) {
        if (!mounted) return;
        setPlayers([]);
        setPlayersStatus("error");
        setTeamMeta(null);
        setSavedTeam({ players: [], captainId: "", viceCaptainId: "" });
        setIsEditing(true);
        setStatus("Unable to load players. Check your connection and try again.");
      }
    };
    load();

    api.get("/fixtures")
      .then((res) => {
        if (!mounted) return;
        const matches = mergeFixturesWithLocal(res.data?.matches || []);
        const todayKey = todayUtc();
        const { lockMatch, nextMatch: upcoming } = computeMatchWindow(matches);
        if (!matches.length) {
          const local = fixtures.map((m) => ({
            ...m,
            timeGMT: m.timeGMT || m.time || null
          }));
          const localWindow = computeMatchWindow(local);
          setFixturesAll(local);
          setNextMatch(localWindow.nextMatch || null);
          const initialDate = todayKey || localWindow.nextMatch?.date || nextFixtureDateUtc();
          setFixtureDateFilter(initialDate);
          const initialMatches = local.filter((m) => m.date === initialDate);
          setFixtureDay(initialMatches);
          setFixtureStatus(initialMatches.length ? "ok" : "empty");
          setLockMeta({
            firstStart: localWindow.nextMatch?.startMs || null,
            lockUntil: localWindow.nextMatch?.startMs ? localWindow.nextMatch.startMs + LOCK_AFTER_MS : null
          });
          setSubmissionLock({
            locked: Boolean(localWindow.lockMatch),
            message: localWindow.lockMatch
              ? "Submissions locked from 5 seconds before match start until 5 minutes after it starts."
              : null
          });
          return;
        }
        setFixturesAll(matches);
        setNextMatch(upcoming || null);
        if (upcoming?.startMs) {
          setLockMeta({
            firstStart: upcoming.startMs,
            lockUntil: upcoming.startMs + LOCK_AFTER_MS
          });
        } else {
          setLockMeta({ firstStart: null, lockUntil: null });
        }
        setSubmissionLock({
          locked: Boolean(lockMatch),
          message: lockMatch
            ? "Submissions locked from 5 seconds before match start until 5 minutes after it starts."
            : null
        });
        const focusDate = todayKey || (upcoming && upcoming.date) || nextFixtureDateUtc();
        setFixtureDateFilter(focusDate);
        const focusMatches = matches.filter((m) => m.date === focusDate);
        setFixtureDay(focusMatches);
        setFixtureStatus(focusMatches.length ? "ok" : "empty");
      })
      .catch(() => {
        if (!mounted) return;
        const dateKey = nextFixtureDateUtc();
        const localTodays = fixtures.filter((m) => m.date === dateKey);
        setFixturesAll(fixtures);
        setFixtureDateFilter(dateKey);
        setFixtureDay(localTodays);
        setFixtureStatus(localTodays.length ? "ok" : "error");
        const firstLocal = localTodays.map((m) => m.timeGMT).filter(Boolean).sort()[0];
        if (firstLocal) {
          const start = new Date(`${dateKey}T${firstLocal}:00Z`).getTime();
          const lockUntil = start + LOCK_AFTER_MS;
          setLockMeta({ firstStart: start, lockUntil });
          const now = Date.now();
          const locked = now >= start && now <= lockUntil;
          setSubmissionLock({
            locked,
            message: locked ? "Submissions locked from 5 seconds before match start until 5 minutes after it starts." : null
          });
        } else {
          setSubmissionLock({ locked: false, message: null });
          setLockMeta({ firstStart: null, lockUntil: null });
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timers = [];

    const scheduleSync = (match) => {
      if (!match?.date || !match?.timeGMT) return;
      const start = new Date(`${match.date}T${match.timeGMT}:00Z`).getTime();
      if (!Number.isFinite(start)) return;
      const end = start + MATCH_DURATION_MS;
      const now = Date.now();

      const trigger = async () => {
        if (cancelled) return;
        try {
          await api.post("/fantasy/sync");
        } catch (err) {
          // Ignore sync errors for scheduled refreshes.
        }
        if (cancelled) return;
        await refreshPlayers(() => !cancelled);
      };

      if (end <= now && now - end <= SYNC_WINDOW_MS) {
        trigger();
        return;
      }
      if (end > now) {
        const delay = end - now;
        timers.push(setTimeout(trigger, delay));
      }
    };

    if (fixtureDay.length) {
      fixtureDay.forEach(scheduleSync);
    }

    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [fixtureDay, nextMatch]);

  const fixtureDates = useMemo(() => {
    const set = new Set((fixturesAll || []).map((m) => m.date).filter(Boolean));
    return Array.from(set).sort();
  }, [fixturesAll]);

  useEffect(() => {
    if (!fixtureDateFilter) return;
    const matches = (fixturesAll || []).filter((m) => m.date === fixtureDateFilter);
    setFixtureDay(matches);
    setFixtureStatus(matches.length ? "ok" : "empty");
  }, [fixtureDateFilter, fixturesAll]);

  const fixtureDateWindow = useMemo(() => {
    const start = todayUtc();
    return [0, 1, 2].map((offset) => addUtcDays(start, offset));
  }, [fixturesAll]);
  const fixturesByWindowDate = useMemo(() => {
    const byDate = new Map();
    for (const dateKey of fixtureDateWindow) {
      const rows = (fixturesAll || [])
        .filter((m) => m.date === dateKey)
        .sort((a, b) => String(a.timeGMT || a.time || "").localeCompare(String(b.timeGMT || b.time || "")));
      byDate.set(dateKey, rows);
    }
    return byDate;
  }, [fixtureDateWindow, fixturesAll]);

  useEffect(() => {
    let mounted = true;
    setDailyPoints((prev) => ({ ...prev, loading: true }));
    const dateKey = todayUtc();
    api.get(`/fantasy/daily?date=${dateKey}`)
      .then((res) => {
        if (!mounted) return;
        setDailyPoints({
          total: res.data?.totalPoints ?? 0,
          matches: res.data?.matches ?? 0,
          loading: false
        });
      })
      .catch(() => {
        if (!mounted) return;
        setDailyPoints({ total: 0, matches: 0, loading: false });
      });
    return () => {
      mounted = false;
    };
  }, [teamMeta?.lockedInLeague, teamMeta?.lastSubmissionDate]);

  useEffect(() => {
    let mounted = true;
    setPeriodPoints((prev) => ({ ...prev, loading: true }));
    if (!selected.length) {
      setPeriodPoints({ total: 0, matches: 0, loading: false });
      return () => {
        mounted = false;
      };
    }
    const since = teamMeta?.submittedForMatchStart
      ? new Date(teamMeta.submittedForMatchStart).getTime()
      : null;
    api.post("/fantasy/points/since", {
      playerIds: selected,
      since
    })
      .then((res) => {
        if (!mounted) return;
        setPeriodPoints({
          total: res.data?.totalPoints ?? 0,
          matches: res.data?.matches ?? 0,
          loading: false
        });
      })
      .catch(() => {
        if (!mounted) return;
        setPeriodPoints({ total: 0, matches: 0, loading: false });
      });
    return () => {
      mounted = false;
    };
  }, [selected, teamMeta?.submittedForMatchStart]);

  useEffect(() => {
    if (!lockMeta.firstStart || !lockMeta.lockUntil) return;
    const tick = () => {
      const now = Date.now();
      const locked =
        now >= lockMeta.firstStart - LOCK_BEFORE_MS && now <= lockMeta.lockUntil;
      setSubmissionLock({
        locked,
        message: locked
          ? "Submissions locked from 5 seconds before match start until 5 minutes after it starts."
          : null
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockMeta.firstStart, lockMeta.lockUntil]);

  const teams = useMemo(() => {
    const set = new Set(players.map((p) => p.country));
    return ["all", ...Array.from(set).sort()];
  }, [players]);

  const teamOptions = useMemo(() => teams.filter((t) => t !== "all"), [teams]);
  const teamFilterLabel = useMemo(() => {
    if (!teamFilter.length) return "All Teams";
    if (teamFilter.length === 1) return teamFilter[0];
    return `${teamFilter.length} teams`;
  }, [teamFilter]);

  const roles = useMemo(() => {
    const set = new Set(players.map((p) => p.role).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [players]);

  const priceRanges = useMemo(
    () => [
      { value: "all", label: "All Prices" },
      { value: "0-2.5", label: "0-2.5" },
      { value: "2.5-3", label: "2.5-3" },
      { value: "3-4", label: "3-4" },
      { value: "4-5", label: "4-5" },
      { value: "5-6", label: "5-6" },
      { value: "6-7", label: "6-7" },
      { value: "7-8", label: "7-8" },
      { value: "8-9", label: "8-9" },
      { value: "9-10", label: "9-10" },
      { value: "10+", label: "10+" }
    ],
    []
  );

  const selectedPlayers = useMemo(
    () => selected.map((id) => players.find((p) => p._id === id)).filter(Boolean),
    [players, selected]
  );

  const totalCost = useMemo(() => {
    return selectedPlayers.reduce((sum, p) => sum + (p?.price || 0), 0);
  }, [selectedPlayers]);

  const totalPoints = periodPoints.total;

  const transfersUsedThisRound = useMemo(() => {
    if (Date.now() < FIRST_SUPER8_START_MS) return 0;
    if (!teamMeta) return 0;
    const key = roundKey();
    const map = teamMeta.transfersByRound || {};
    if (map instanceof Map) {
      return Number(map.get(key) || 0);
    }
    return Number(map[key] || 0);
  }, [teamMeta]);

  const transfersRemaining = useMemo(() => {
    if (Date.now() < FIRST_SUPER8_START_MS) return null;
    if (!teamMeta) return null;
    const limit = teamMeta.transfersLimit ?? 120;
    const used = teamMeta.transfersUsedTotal ?? 0;
    return Math.max(0, limit - used);
  }, [teamMeta]);

  const transfersByRoundList = useMemo(() => {
    if (Date.now() < FIRST_SUPER8_START_MS) return [];
    if (!teamMeta?.transfersByRound) return [];
    const map = teamMeta.transfersByRound;
    const entries = map instanceof Map ? Array.from(map.entries()) : Object.entries(map);
    return entries
      .map(([round, count]) => ({ round, count: Number(count) || 0 }))
      .sort((a, b) => (a.round > b.round ? 1 : -1));
  }, [teamMeta]);

  const transferPhaseLabel = useMemo(() => {
    if (Date.now() < FIRST_SUPER8_START_MS) return "Super 8 (Pre-start)";
    if (!teamMeta?.transferPhase) return "Group";
    if (teamMeta.transferPhase === "SUPER8_PRE") return "Super 8 (Pre-start)";
    if (teamMeta.transferPhase === "SUPER8") return "Super 8";
    return "Group";
  }, [teamMeta?.transferPhase]);

  const showSuper8PreNotice = useMemo(() => {
    return Date.now() < FIRST_SUPER8_START_MS;
  }, [teamMeta]);

  const teamCounts = useMemo(() => {
    return selectedPlayers.reduce((acc, p) => {
      acc[p.country] = (acc[p.country] || 0) + 1;
      return acc;
    }, {});
  }, [selectedPlayers]);

  const roleCounts = useMemo(() => {
    const counts = { bat: 0, bowl: 0, wk: 0, ar: 0 };
    selectedPlayers.forEach((p) => {
      const role = String(p.role || "").toLowerCase();
      if (role.includes("wk") || role.includes("keeper")) {
        counts.wk += 1;
      } else if (role.includes("all")) {
        counts.ar += 1;
      } else if (role.includes("bowl")) {
        counts.bowl += 1;
      } else {
        counts.bat += 1;
      }
    });
    return counts;
  }, [selectedPlayers]);

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const [minRaw, maxRaw] = priceRange.includes("-") ? priceRange.split("-") : [null, null];
    const min = minRaw ? Number(minRaw) : null;
    const max = maxRaw ? Number(maxRaw) : null;
    const minOk = min === null || !Number.isNaN(min);
    const maxOk = max === null || !Number.isNaN(max);
    return players
      .filter((p) => {
      const matchQuery = !q || p.name.toLowerCase().includes(q);
      const matchTeam = teamFilter.length === 0 || teamFilter.includes(p.country);
      const matchRole = roleFilter === "all" || p.role === roleFilter;
      const price = Number(p.price ?? 0);
      let matchPrice = true;
      if (priceRange === "10+") {
        matchPrice = price >= 10;
      } else if (priceRange !== "all" && minOk && maxOk) {
        matchPrice = (min === null || price >= min) && (max === null || price <= max);
      }
      return matchQuery && matchTeam && matchRole && matchPrice;
    })
    .sort((a, b) => {
      const aPoints = Number(a.points ?? a.fantasyPoints ?? 0);
      const bPoints = Number(b.points ?? b.fantasyPoints ?? 0);
      if (bPoints !== aPoints) return bPoints - aPoints;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [players, query, teamFilter, roleFilter, priceRange]);

  const toggle = (id) => {
    setStatus(null);
    if (teamMeta && !isEditing) {
      setStatus("Click Update Team to make changes.");
      return;
    }
    if (selected.includes(id)) {
      setSelected(selected.filter((s) => s !== id));
      return;
    }
    if (selected.length >= TEAM_SIZE) {
      setStatus("You already picked 11 players.");
      return;
    }
    const player = players.find((p) => p._id === id);
    if (!player) return;

    const currentCount = teamCounts[player.country] || 0;
    if (currentCount + 1 > MAX_PER_TEAM) {
      setStatus("Max 7 players from the same team.");
      return;
    }

    const role = String(player.role || "").toLowerCase();
    let key = "bat";
    if (role.includes("wk") || role.includes("keeper")) {
      key = "wk";
    } else if (role.includes("all")) {
      key = "ar";
    } else if (role.includes("bowl")) {
      key = "bowl";
    }
    if ((roleCounts[key] || 0) + 1 > ROLE_LIMITS[key]) {
      setStatus(`Max ${ROLE_LIMITS[key]} ${key === "wk" ? "wicket-keepers" : key === "ar" ? "all-rounders" : key === "bowl" ? "bowlers" : "batters"}.`);
      return;
    }

    if (totalCost + player.price > BUDGET) {
      setStatus(`Budget exceeded. Max is £${formatPrice(BUDGET)}m.`);
      return;
    }
    setSelected([...selected, id]);
  };

  const targetDateKey = useMemo(() => {
    if (nextMatch?.date) return nextMatch.date;
    if (fixtureDay.length && fixtureDay[0]?.date) return fixtureDay[0].date;
    return nextFixtureDateUtc();
  }, [fixtureDay]);
  const matchesForTargetDate = useMemo(() => {
    if (!targetDateKey) return 0;
    return fixtureDay.filter((m) => m.date === targetDateKey).length;
  }, [fixtureDay, targetDateKey]);
  const isSubmissionLocked = submissionLock.locked;
  const lockCountdown = useMemo(() => {
    if (!isSubmissionLocked || !lockMeta.lockUntil) return null;
    const minutes = Math.max(0, Math.ceil((lockMeta.lockUntil - Date.now()) / 60000));
    return minutes;
  }, [isSubmissionLocked, lockMeta.lockUntil]);
  const alreadySubmittedForNext =
    teamMeta?.submittedForMatchId &&
    nextMatch?.id &&
    teamMeta.submittedForMatchId === nextMatch.id;
  const hasCaptains = Boolean(captainId) && Boolean(viceCaptainId) && captainId !== viceCaptainId;
  const formationOk =
    roleCounts.bat <= ROLE_LIMITS.bat &&
    roleCounts.bowl <= ROLE_LIMITS.bowl &&
    roleCounts.wk <= ROLE_LIMITS.wk &&
    roleCounts.ar <= ROLE_LIMITS.ar &&
    roleCounts.bat >= ROLE_MIN.bat &&
    roleCounts.bowl >= ROLE_MIN.bowl &&
    roleCounts.wk >= ROLE_MIN.wk &&
    roleCounts.ar >= ROLE_MIN.ar;
  const canSubmitTeam = selected.length === TEAM_SIZE && formationOk && hasCaptains;

  const saveTeam = async () => {
    setStatus(null);
    const focusStatus = (message) => {
      setStatus(message);
      setTimeout(() => {
        statusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
    };
    try {
      if (selected.length !== TEAM_SIZE) {
        focusStatus("Pick exactly 11 players before saving.");
        return;
      }
      if (!formationOk) {
        focusStatus("Formation rules not met: min 3 batters, 3 bowlers, 1 wicket-keeper, 1 all-rounder.");
        return;
      }
      if (!hasCaptains) {
        focusStatus(
          captainId && viceCaptainId && String(captainId) === String(viceCaptainId)
            ? "Captain and vice-captain must be different."
            : "Select a captain and a vice-captain."
        );
        return;
      }
      const usedBoosters = teamMeta?.usedBoosters || [];
      const boosterPayload = usedBoosters.includes(boosterSelected) ? null : boosterSelected;
      const boosterPlayerPayload =
        boosterPayload === "captainx3" ? boosterPlayerId || "" : "";
      if (boosterPayload === "captainx3") {
        if (!boosterPlayerPayload) {
          focusStatus("Select a player for CAPTAIN X3 booster.");
          return;
        }
        if (String(boosterPlayerPayload) === String(captainId) || String(boosterPlayerPayload) === String(viceCaptainId)) {
          focusStatus("CAPTAIN X3 player cannot be captain or vice-captain.");
          return;
        }
      }
      if (superSubId && selected.includes(superSubId)) {
        focusStatus("Super sub cannot be one amongst the submitted team.");
        return;
      }
      if (superSubTempDisabled && superSubId) {
        focusStatus("Super Sub is temporarily disabled for this fixture.");
        return;
      }
      if (superSubId && (String(superSubId) === String(captainId) || String(superSubId) === String(viceCaptainId))) {
        focusStatus("Super Sub cannot be captain or vice-captain.");
        return;
      }

      const res = await api.post("/teams", {
        name: teamName,
        playerIds: selected,
        captainId,
        viceCaptainId,
        booster: boosterPayload,
        boosterPlayerId: boosterPlayerPayload || null,
        superSubId: superSubId || null,
        nextMatch: nextMatch
          ? {
              id: nextMatch.id,
              startMs: nextMatch.startMs,
              date: nextMatch.date,
              name: nextMatch.name,
              team1: nextMatch.team1,
              team2: nextMatch.team2,
              venue: nextMatch.venue
            }
          : null
      });
      if (res.data) {
        const nextSuperSubId = res.data.superSub ? String(res.data.superSub) : "";
        setTeamMeta((prev) => ({
          lockedInLeague: res.data.lockedInLeague ?? prev?.lockedInLeague ?? false,
          transfersLimit: res.data.transfersLimit ?? prev?.transfersLimit ?? 120,
          transfersUsedTotal: res.data.transfersUsedTotal ?? prev?.transfersUsedTotal ?? 0,
          transfersByRound: res.data.transfersByRound ?? prev?.transfersByRound ?? {},
          transferPhase: res.data.transferPhase ?? prev?.transferPhase ?? "GROUP",
          postGroupResetDone: res.data.postGroupResetDone ?? prev?.postGroupResetDone ?? false,
          lastSubmissionDate: res.data.lastSubmissionDate ?? prev?.lastSubmissionDate ?? null,
          submittedForMatchId: res.data.submittedForMatchId ?? prev?.submittedForMatchId ?? null,
          submittedForMatchStart: res.data.submittedForMatchStart ?? prev?.submittedForMatchStart ?? null,
          boosterUsed: res.data.boosterUsed ?? prev?.boosterUsed ?? false,
          boosterType: res.data.boosterType ?? prev?.boosterType ?? null,
          usedBoosters: res.data.usedBoosters ?? prev?.usedBoosters ?? [],
          boosterPlayer: res.data.boosterPlayer ?? prev?.boosterPlayer ?? null,
          superSub: res.data.superSub ?? prev?.superSub ?? null
        }));
        setSuperSubId(nextSuperSubId);
        if (superSubId && nextMatch?.date) {
          setSubmissionHistory((prev) => {
            const exists = prev.some((s) => s.matchId === nextMatch.id);
            if (exists) return prev;
            return [
              {
                id: `local-${nextMatch.id}`,
                matchId: nextMatch.id,
                matchDate: nextMatch.date,
                matchStartMs: nextMatch.startMs,
                matchName: nextMatch.name || null,
                team1: nextMatch.team1 || null,
                team2: nextMatch.team2 || null,
                superSub: { _id: superSubId }
              },
              ...prev
            ];
          });
        }
        setSavedTeam({
          players: [...selected],
          captainId,
          viceCaptainId
        });
        setIsEditing(false);
      }
      setStatus("Team saved successfully.");
    } catch (err) {
      focusStatus(err.response?.data?.error || "Failed to save team");
    }
  };

  const usedBoosters = teamMeta?.usedBoosters || [];
  const boosterDisabled = !isEditing;
  const superSubOptions = useMemo(() => {
    const selectedSet = new Set(selected.map(String));
    return players.filter((p) => !selectedSet.has(String(p._id)));
  }, [players, selected]);
  const superSubUsage = useMemo(() => {
    if (!nextMatch?.date || !submissionHistory.length) return null;
    const used = submissionHistory.find((s) => {
      const matchDate = s.matchDate || (s.matchStartMs ? new Date(s.matchStartMs).toISOString().slice(0, 10) : null);
      return (
        matchDate === nextMatch.date &&
        s.superSub &&
        String(s.matchId || "") !== String(nextMatch.id || "")
      );
    });
    if (!used) return null;
    const fixtureName = used.matchName || (used.team1 && used.team2 ? `${used.team1} vs ${used.team2}` : "this fixture");
    return { used: true, fixtureName, matchId: used.matchId };
  }, [submissionHistory, nextMatch?.date]);
  const superSubTempDisabled = Boolean(TEMP_SUPER_SUB_DISABLED_MATCH_ID) &&
    String(nextMatch?.id || "") === TEMP_SUPER_SUB_DISABLED_MATCH_ID;
  const superSubDisabled = boosterDisabled || Boolean(superSubUsage?.used) || superSubTempDisabled;
  const boosterLabel = (type) => {
    switch (type) {
      case "batsman":
        return "Batsmen Booster";
      case "bowler":
        return "Bowler Booster";
      case "wk":
        return "Wicket-Keeper Booster";
      case "allrounder":
        return "All-Rounder Booster";
      case "teamx2":
        return "Team X2";
      case "captainx3":
        return "CAPTAIN X3";
      default:
        return "Booster";
    }
  };

  const handleBoosterToggle = (type) => {
    if (boosterDisabled || usedBoosters.includes(type)) return;
    if (boosterSelected && boosterSelected !== type) return;
    if (boosterSelected === type) {
      setBoosterSelected(null);
      setBoosterPlayerId("");
      setStatus(`${boosterLabel(type)} removed.`);
      setTimeout(() => {
        statusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
      return;
    }
    setBoosterSelected(type);
    setStatus(`${boosterLabel(type)} applied. Submit team to confirm.`);
    setTimeout(() => {
      statusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  };

  const handleCaptainX3Pick = (player) => {
    if (boosterSelected !== "captainx3") return;
    if (String(player._id) === String(captainId) || String(player._id) === String(viceCaptainId)) {
      setStatus("CAPTAIN X3 player cannot be captain or vice-captain.");
      setTimeout(() => {
        statusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
      return;
    }
    setBoosterPlayerId(String(player._id));
    setStatus(`CAPTAIN X3 set for ${player.name}.`);
    setTimeout(() => {
      statusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  };

  const autoPopulateTeam = () => {
    if (teamMeta && !isEditing) {
      setStatus("Click Update Team to make changes.");
      return;
    }
    if (!players.length) {
      setStatus("Players not loaded yet.");
      return;
    }

    const budget = BUDGET;
    const selectedIds = new Set();
    const roleCountsLocal = { bat: 0, bowl: 0, wk: 0, ar: 0 };
    const teamCountsLocal = {};
    let totalCostLocal = 0;

    const candidates = players.map((p) => ({
      ...p,
      roleKey: roleKey(p),
      pointsValue: Number(p.points ?? p.fantasyPoints ?? 0),
      priceValue: Number(p.price ?? 0)
    }));

    const canAdd = (p) => {
      if (selectedIds.has(p._id)) return false;
      if (roleCountsLocal[p.roleKey] >= ROLE_LIMITS[p.roleKey]) return false;
      const count = teamCountsLocal[p.country] || 0;
      if (count >= MAX_PER_TEAM) return false;
      if (totalCostLocal + p.priceValue > budget) return false;
      return true;
    };

    const addPlayer = (p) => {
      selectedIds.add(p._id);
      roleCountsLocal[p.roleKey] += 1;
      teamCountsLocal[p.country] = (teamCountsLocal[p.country] || 0) + 1;
      totalCostLocal += p.priceValue;
    };

    // Fill minimum role requirements first.
    const byRole = {
      wk: candidates.filter((p) => p.roleKey === "wk").sort((a, b) => b.pointsValue - a.pointsValue),
      bat: candidates.filter((p) => p.roleKey === "bat").sort((a, b) => b.pointsValue - a.pointsValue),
      ar: candidates.filter((p) => p.roleKey === "ar").sort((a, b) => b.pointsValue - a.pointsValue),
      bowl: candidates.filter((p) => p.roleKey === "bowl").sort((a, b) => b.pointsValue - a.pointsValue)
    };

    const fillRole = (key, min) => {
      for (const p of byRole[key]) {
        if (roleCountsLocal[key] >= min) break;
        if (canAdd(p)) addPlayer(p);
      }
    };

    fillRole("wk", ROLE_MIN.wk);
    fillRole("bat", ROLE_MIN.bat);
    fillRole("ar", ROLE_MIN.ar);
    fillRole("bowl", ROLE_MIN.bowl);

    const allSorted = candidates.slice().sort((a, b) => b.pointsValue - a.pointsValue);
    for (const p of allSorted) {
      if (selectedIds.size >= TEAM_SIZE) break;
      if (canAdd(p)) addPlayer(p);
    }

    if (selectedIds.size < TEAM_SIZE) {
      // Second pass: prefer value picks if still short.
      const valueSorted = candidates.slice().sort((a, b) => {
        const aScore = a.priceValue ? a.pointsValue / a.priceValue : a.pointsValue;
        const bScore = b.priceValue ? b.pointsValue / b.priceValue : b.pointsValue;
        return bScore - aScore;
      });
      for (const p of valueSorted) {
        if (selectedIds.size >= TEAM_SIZE) break;
        if (canAdd(p)) addPlayer(p);
      }
    }

    if (selectedIds.size !== TEAM_SIZE) {
      setStatus("Unable to auto-populate within budget and rules. Try again or adjust filters.");
      return;
    }

    const selectedList = candidates.filter((p) => selectedIds.has(p._id));
    const sortedByPoints = selectedList.slice().sort((a, b) => b.pointsValue - a.pointsValue);
    const cap = sortedByPoints[0]?._id || "";
    const vc = sortedByPoints[1]?._id || "";

    setSelected(Array.from(selectedIds));
    setCaptainId(cap ? String(cap) : "");
    setViceCaptainId(vc ? String(vc) : "");
    setStatus("Team auto-populated.");
  };

  useEffect(() => {
    const selectedSet = new Set(selected.map(String));
    if (captainId && !selectedSet.has(String(captainId))) {
      setCaptainId("");
    }
    if (viceCaptainId && !selectedSet.has(String(viceCaptainId))) {
      setViceCaptainId("");
    }
    if (boosterSelected === "captainx3" && boosterPlayerId) {
      if (String(captainId) === String(boosterPlayerId)) {
        setCaptainId("");
      }
      if (String(viceCaptainId) === String(boosterPlayerId)) {
        setViceCaptainId("");
      }
    }
    if (superSubId && selectedSet.has(String(superSubId))) {
      setSuperSubId("");
    }
  }, [selected, captainId, viceCaptainId, boosterSelected, boosterPlayerId, superSubId]);

  useEffect(() => {
    if (!teamMeta || !isEditing) return;
    setEditSecondsLeft(0);
  }, [teamMeta, isEditing]);

  useEffect(() => {
    if (isEditing) return;
    setBoosterSelected(null);
    setBoosterPlayerId(teamMeta?.boosterPlayer ? String(teamMeta.boosterPlayer) : "");
    setSuperSubId(teamMeta?.superSub ? String(teamMeta.superSub) : "");
  }, [isEditing, teamMeta?.boosterPlayer, teamMeta?.superSub]);

  useEffect(() => {
    if (boosterSelected !== "captainx3" || boosterPlayerId) return;
    if (!selectedXiRef.current) return;
    selectedXiRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [boosterSelected, boosterPlayerId]);

  const handleRemove = (id) => {
    if (teamMeta && !isEditing) {
      setStatus("Click Update Team to make changes.");
      return;
    }
    setSelected((prev) => prev.filter((s) => String(s) !== String(id)));
  };

  const editTimerLabel = useMemo(() => "", []);

  useEffect(() => {
    if (!status) return;
    setTimeout(() => {
      statusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }, [status]);

  useEffect(() => {
    if (!teamDropdownOpen) return;
    const handleClick = (e) => {
      if (!e.target.closest(".multi-select")) {
        setTeamDropdownOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [teamDropdownOpen]);

  return (
    <section className="page">
      <div className="page__header">
        <h2>Create Your Team</h2>
        <p>Pick 11 players under a budget of £100m. Max 7 players from the same team.</p>
      </div>

      <div className="team-builder">
        <div className="team-panel">
          <div className="team-name-field">
            <label className="label">Team Name</label>
            <input
              className="input"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
          </div>
          <div className="summary">
            <div>
              <span className="muted">Players</span>
              <strong>{selected.length} / {TEAM_SIZE}</strong>
            </div>
            <div>
              <span className="muted">Submission Date</span>
              <strong>{targetDateKey} (UTC)</strong>
            </div>
            <div>
              <span className="muted">Formation</span>
              <strong className="formation-text">
                {roleCounts.wk} WK · {roleCounts.bat} BAT · {roleCounts.ar} AR · {roleCounts.bowl} BOWL
              </strong>
            </div>
            <div>
              <span className="muted">Budget</span>
              <strong>£{formatPrice(totalCost)}m / £{formatPrice(BUDGET)}m</strong>
            </div>
            <div>
              <span className="muted">Team Points</span>
              <strong>{periodPoints.loading ? "..." : totalPoints}</strong>
            </div>
            <div>
              <span className="muted">Daily Points</span>
              <strong>{dailyPoints.loading ? "..." : dailyPoints.total}</strong>
            </div>
            <div>
              <span className="muted">Matches Today</span>
              <strong>{dailyPoints.loading ? "..." : matchesForTargetDate}</strong>
            </div>
          </div>
          {status && (
            <div className="notice" ref={statusRef}>
              {status}
            </div>
          )}
          {isSubmissionLocked && submissionLock.message ? (
            <div className="notice">{submissionLock.message}{lockCountdown !== null ? ` (${lockCountdown} min)` : ""}</div>
          ) : null}
          {alreadySubmittedForNext ? (
            <div className="notice">You have already submitted your team for the upcoming match.</div>
          ) : null}
          {showSuper8PreNotice ? (
            <div className="notice">You are allowed to make unlimited transfers before the start of first Super 8 fixture.</div>
          ) : null}
          {superSubUsage?.used ? (
            <div className="notice">Super Sub already used against {superSubUsage.fixtureName}; it will be carried over to the next fixture today.</div>
          ) : null}
          {superSubTempDisabled ? (
            <div className="notice">Super Sub is temporarily disabled for this fixture.</div>
          ) : null}
          {teamMeta?.lockedInLeague ? (
            <div className="transfer-summary transfer-summary--team">
              <div>Transfers this round: <strong>{showSuper8PreNotice ? "Unlimited" : transfersUsedThisRound}</strong></div>
              {!showSuper8PreNotice ? (
                <div>Transfers used: <strong>{teamMeta.transfersUsedTotal ?? 0}</strong></div>
              ) : null}
              {!showSuper8PreNotice ? (
                <div>Transfers remaining: <strong>{transfersRemaining ?? 0}</strong> / {teamMeta.transfersLimit ?? 120}</div>
              ) : (
                <div>Transfers remaining: <strong>Unlimited</strong> (Super 8 cap after start: 46)</div>
              )}
              <div className="muted">Transfer phase: {transferPhaseLabel}</div>
              {showSuper8PreNotice ? (
                <div className="muted">Unlimited transfers until the first Super 8 fixture starts.</div>
              ) : null}
              {!showSuper8PreNotice ? (
                <div className="transfer-rounds">
                  <div className="muted">Transfers by round</div>
                  {transfersByRoundList.length === 0 ? (
                    <div className="muted">No transfers used yet.</div>
                  ) : (
                    <div className="transfer-rounds__list">
                      {transfersByRoundList.map((entry) => (
                        <div key={entry.round} className="transfer-rounds__item">
                          <span>{entry.round}</span>
                          <strong>{entry.count}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="transfer-summary muted">Unlimited transfers until you submit a team into a league.</div>
          )}
          {!teamMeta?.submittedForMatchId && (
            <button className="btn btn--primary" type="button" onClick={autoPopulateTeam}>
              Auto Populate Team
            </button>
          )}
          <div className="panel-block panel-block--captains">
            <div className="filter-group">
              <label className="label">Captain</label>
              <select
                className="input"
                value={captainId}
                onChange={(e) => setCaptainId(e.target.value)}
                disabled={Boolean(teamMeta) && !isEditing}
              >
                <option value="">Select captain</option>
                {selectedPlayers.map((player) => (
                  <option
                    key={`cap-${player._id}`}
                    value={player._id}
                    disabled={
                      (boosterSelected === "captainx3" && String(boosterPlayerId) === String(player._id)) ||
                      String(viceCaptainId) === String(player._id)
                    }
                  >
                    {player.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label className="label">Vice-Captain</label>
              <select
                className="input"
                value={viceCaptainId}
                onChange={(e) => setViceCaptainId(e.target.value)}
                disabled={Boolean(teamMeta) && !isEditing}
              >
                <option value="">Select vice-captain</option>
                {selectedPlayers.map((player) => (
                  <option
                    key={`vc-${player._id}`}
                    value={player._id}
                    disabled={
                      (boosterSelected === "captainx3" && String(boosterPlayerId) === String(player._id)) ||
                      String(captainId) === String(player._id)
                    }
                  >
                    {player.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label className="label">Super Sub (Optional)</label>
              <select
                className="input"
                value={superSubId}
                onChange={(e) => setSuperSubId(e.target.value)}
                disabled={superSubDisabled}
              >
                <option value="">Select</option>
                {superSubOptions.map((player) => (
                  <option key={`ss-${player._id}`} value={player._id}>
                    {player.name}
                  </option>
                ))}
              </select>
              <div className="muted">Replaces the first non-playing XI member for this fixture.</div>
            </div>
          </div>
          <div className="panel-block panel-block--fixtures">
            <div className="panel-title">Upcoming Fixtures (GMT)</div>
            <div className="fixture-columns">
              {fixtureDateWindow.map((dateKey) => {
                const rows = fixturesByWindowDate.get(dateKey) || [];
                return (
                  <div className="fixture-column" key={dateKey}>
                    <div className="fixture-column__header">{dateKey}</div>
                    {rows.length ? (
                      <div className="fixture-mini">
                        {rows.map((match, idx) => (
                          <div key={match.id || `${dateKey}-${idx}`} className="fixture-mini__item">
                            <div className="fixture-mini__time">GMT {match.timeGMT || match.time}</div>
                            <div className="fixture-mini__teams">{match.team1} vs {match.team2}</div>
                            <div className="muted">{match.venue}</div>
                            <div className="muted">{match.statusLabel || match.status || "Scheduled"}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="muted">No fixtures for {dateKey}.</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="muted formation-limits">
            Formation limits: min 3 batters, 3 bowlers, 1 wicket-keeper, 1 all-rounder. Max 5 batters, 5 bowlers, 4 wicket-keepers, 4 all-rounders.
          </div>
          <button
            className="btn btn--primary"
            onClick={() => {
              if (teamMeta && !isEditing) {
                setIsEditing(true);
                setEditSecondsLeft(240);
                setStatus("Editing enabled. Update your XI and submit.");
                return;
              }
              saveTeam();
            }}
            disabled={
              isSubmissionLocked
            }
          >
            {teamMeta && !isEditing ? "Update Team" : selected.length > 0 ? "Submit Team" : "Select Team"}
          </button>
          {teamMeta && isEditing ? (
            <button
              className="btn btn--reset"
              type="button"
              onClick={() => {
                setSelected(savedTeam.players || []);
                setCaptainId(savedTeam.captainId || "");
                setViceCaptainId(savedTeam.viceCaptainId || "");
                setStatus("Changes reset to saved team.");
                setTimeout(() => {
                  statusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 0);
              }}
            >
              Reset Team
            </button>
          ) : null}
        </div>

        <div>
          <div className="panel-block booster-panel">
            <div className="panel-title">Choose a Booster</div>
            <div className="booster-grid">
              <div
                className={`booster-card ${boosterSelected === "batsman" ? "booster-card--active" : ""} ${usedBoosters.includes("batsman") ? "booster-card--used" : ""}`}
                aria-disabled={boosterDisabled || usedBoosters.includes("batsman") || (boosterSelected && boosterSelected !== "batsman")}
                role="button"
                tabIndex={0}
                onClick={() => handleBoosterToggle("batsman")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleBoosterToggle("batsman");
                  }
                }}
              >
                <img
                  src={batsmanBooster}
                  alt="Batsmen Booster"
                  className="booster-card__image"
                  title={teamMeta?.boosterUsed ? "Booster already used for this tournament." : "Apply Batsmen Booster"}
                />
                <div className="booster-card__meta">
                  <strong>Batsmen Booster</strong>
                  <span>2x points for all batsmen</span>
                </div>
                {usedBoosters.includes("batsman") ? (
                  <span className="booster-card__badge">Applied</span>
                ) : boosterSelected === "batsman" ? (
                  <span className="booster-card__badge">Selected</span>
                ) : null}
              </div>
              <div
                className={`booster-card ${boosterSelected === "bowler" ? "booster-card--active" : ""} ${usedBoosters.includes("bowler") ? "booster-card--used" : ""}`}
                aria-disabled={boosterDisabled || usedBoosters.includes("bowler") || (boosterSelected && boosterSelected !== "bowler")}
                role="button"
                tabIndex={0}
                onClick={() => handleBoosterToggle("bowler")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleBoosterToggle("bowler");
                  }
                }}
              >
                <img
                  src={bowlerBooster}
                  alt="Bowler Booster"
                  className="booster-card__image"
                  title={teamMeta?.boosterUsed ? "Booster already used for this tournament." : "Apply Bowler Booster"}
                />
                <div className="booster-card__meta">
                  <strong>Bowler Booster</strong>
                  <span>2x points for all bowlers</span>
                </div>
                {usedBoosters.includes("bowler") ? (
                  <span className="booster-card__badge">Applied</span>
                ) : boosterSelected === "bowler" ? (
                  <span className="booster-card__badge">Selected</span>
                ) : null}
              </div>
              <div
                className={`booster-card ${boosterSelected === "wk" ? "booster-card--active" : ""} ${usedBoosters.includes("wk") ? "booster-card--used" : ""}`}
                aria-disabled={boosterDisabled || usedBoosters.includes("wk") || (boosterSelected && boosterSelected !== "wk")}
                role="button"
                tabIndex={0}
                onClick={() => handleBoosterToggle("wk")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleBoosterToggle("wk");
                  }
                }}
              >
                <img
                  src={wkBooster}
                  alt="Wicket-Keeper Booster"
                  className="booster-card__image"
                  title={teamMeta?.boosterUsed ? "Booster already used for this tournament." : "Apply Wicket-Keeper Booster"}
                />
                <div className="booster-card__meta">
                  <strong>Wicket-Keeper Booster</strong>
                  <span>2x points for all wicket-keepers</span>
                </div>
                {usedBoosters.includes("wk") ? (
                  <span className="booster-card__badge">Applied</span>
                ) : boosterSelected === "wk" ? (
                  <span className="booster-card__badge">Selected</span>
                ) : null}
              </div>
              <div
                className={`booster-card ${boosterSelected === "allrounder" ? "booster-card--active" : ""} ${usedBoosters.includes("allrounder") ? "booster-card--used" : ""}`}
                aria-disabled={boosterDisabled || usedBoosters.includes("allrounder") || (boosterSelected && boosterSelected !== "allrounder")}
                role="button"
                tabIndex={0}
                onClick={() => handleBoosterToggle("allrounder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleBoosterToggle("allrounder");
                  }
                }}
              >
                <img
                  src={allRounderBooster}
                  alt="All-Rounder Booster"
                  className="booster-card__image"
                  title={teamMeta?.boosterUsed ? "Booster already used for this tournament." : "Apply All-Rounder Booster"}
                />
                <div className="booster-card__meta">
                  <strong>All-Rounder Booster</strong>
                  <span>2x points for all all-rounders</span>
                </div>
                {usedBoosters.includes("allrounder") ? (
                  <span className="booster-card__badge">Applied</span>
                ) : boosterSelected === "allrounder" ? (
                  <span className="booster-card__badge">Selected</span>
                ) : null}
              </div>
              <div
                className={`booster-card ${boosterSelected === "teamx2" ? "booster-card--active" : ""} ${usedBoosters.includes("teamx2") ? "booster-card--used" : ""}`}
                aria-disabled={boosterDisabled || usedBoosters.includes("teamx2") || (boosterSelected && boosterSelected !== "teamx2")}
                role="button"
                tabIndex={0}
                onClick={() => handleBoosterToggle("teamx2")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleBoosterToggle("teamx2");
                  }
                }}
              >
                <img
                  src={teamX2Booster}
                  alt="Team X2 Booster"
                  className="booster-card__image"
                  title={teamMeta?.boosterUsed ? "Booster already used for this tournament." : "Apply Team X2 Booster"}
                />
                <div className="booster-card__meta">
                  <strong>Team X2</strong>
                  <span>2x points for all players</span>
                </div>
                {usedBoosters.includes("teamx2") ? (
                  <span className="booster-card__badge">Applied</span>
                ) : boosterSelected === "teamx2" ? (
                  <span className="booster-card__badge">Selected</span>
                ) : null}
              </div>
              <div
                className={`booster-card ${boosterSelected === "captainx3" ? "booster-card--active" : ""} ${usedBoosters.includes("captainx3") ? "booster-card--used" : ""}`}
                aria-disabled={boosterDisabled || usedBoosters.includes("captainx3") || (boosterSelected && boosterSelected !== "captainx3")}
                role="button"
                tabIndex={0}
                onClick={() => handleBoosterToggle("captainx3")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleBoosterToggle("captainx3");
                  }
                }}
              >
                <img
                  src={captainX3Booster}
                  alt="Captain X3 Booster"
                  className="booster-card__image"
                  title={teamMeta?.boosterUsed ? "Booster already used for this tournament." : "Apply CAPTAIN X3 Booster"}
                />
                <div className="booster-card__meta">
                  <strong>CAPTAIN X3</strong>
                  <span>3x points for one player</span>
                </div>
                {usedBoosters.includes("captainx3") ? (
                  <span className="booster-card__badge">Applied</span>
                ) : boosterSelected === "captainx3" ? (
                  <span className="booster-card__badge">Selected</span>
                ) : null}
              </div>
            </div>
            {boosterSelected === "captainx3" && (
              <div className="booster-select booster-select--hint">
                Click a player in Selected XI to apply CAPTAIN X3.
              </div>
            )}
            <div className="booster-hint">Use once during the tournament. Apply when updating your team.</div>
          </div>
          <div className="panel-block">
            <div className="panel-title">Selected XI</div>
            <div ref={selectedXiRef} className="selected-xi-anchor">
              <SelectedTeamField
                players={selectedPlayers}
                captainId={captainId}
                viceCaptainId={viceCaptainId}
                captainX3PlayerId={boosterPlayerId}
                showCaptainX3Prompt={boosterSelected === "captainx3" && !boosterPlayerId}
                onCaptainX3Pick={handleCaptainX3Pick}
                canEdit={!teamMeta || isEditing}
                onRemove={handleRemove}
              />
            </div>
          </div>
          <div className="filters">
            <div className="filter-group">
              <label className="label">Search Player</label>
              <input
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name"
              />
            </div>
            <div className="filter-group">
              <label className="label label--team-filter">Team</label>
              <div className={`multi-select multi-select--team ${teamDropdownOpen ? "multi-select--open" : ""}`}>
                <button
                  type="button"
                  className="input multi-select__toggle"
                  onClick={() => setTeamDropdownOpen((prev) => !prev)}
                >
                  <span>{teamFilterLabel}</span>
                  <span className="multi-select__chevron">▾</span>
                </button>
                {teamDropdownOpen && (
                  <div className="multi-select__menu">
                    <label className="multi-select__option">
                      <input
                        type="checkbox"
                        checked={teamFilter.length === 0}
                        onChange={() => setTeamFilter([])}
                      />
                      <span>All Teams</span>
                    </label>
                    {teamOptions.map((team) => (
                      <label key={team} className="multi-select__option">
                        <input
                          type="checkbox"
                          checked={teamFilter.includes(team)}
                          onChange={() => {
                            setTeamFilter((prev) =>
                              prev.includes(team)
                                ? prev.filter((t) => t !== team)
                                : [...prev, team]
                            );
                          }}
                        />
                        <span>{team}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="filter-group">
              <label className="label">Role</label>
              <select
                className="input"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role === "all" ? "All Roles" : role}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label className="label">Price Range (m)</label>
              <select
                className="input"
                value={priceRange}
                onChange={(e) => setPriceRange(e.target.value)}
              >
                {priceRanges.map((range) => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-meta filter-meta--team muted">
              Showing {filteredPlayers.length} of {players.length}
            </div>
          </div>

          {playersStatus !== "ready" ? (
            <div className="panel-block">
              {playersStatus === "loading" && <div className="muted">Loading players...</div>}
              {playersStatus === "empty" && <div className="muted">No players available yet.</div>}
              {playersStatus === "error" && (
                <div className="muted">Players failed to load. Please refresh.</div>
              )}
            </div>
          ) : null}

          {playersStatus === "ready" && filteredPlayers.length === 0 ? (
            <div className="panel-block panel-block--empty">
              <div className="muted">No players match your filters.</div>
            </div>
          ) : null}

          <div className="grid grid--players">
            {filteredPlayers.map((player) => {
              const isSelected = selected.includes(player._id);
              const count = teamCounts[player.country] || 0;
              const isBlocked = !isSelected && count >= MAX_PER_TEAM;
              return (
                <button
                  type="button"
                  key={player._id}
                  className={`card card--select ${isSelected ? "card--selected" : ""}`}
                  onClick={() => toggle(player._id)}
                  disabled={isBlocked}
                  aria-disabled={isBlocked}
                  title={isBlocked ? "Max 7 players from the same team" : ""}
                >
                  <div className="card__top">
                    <h4>{player.name}</h4>
                    <div className="pill-group">
                      {player.availabilityTag ? (
                        <span className="pill pill--warn">{player.availabilityTag}</span>
                      ) : null}
                      <span className="pill">{player.role}</span>
                    </div>
                  </div>
                  {(() => {
                    const flag = countryFlag(player.country);
                    return (
                      <div className="player-flag">
                        {flag.type === "img" ? <img src={flag.value} alt={`${player.country} flag`} /> : flag.value}
                      </div>
                    );
                  })()}
                  <div className="card__footer">
                    <span className="price">Price £{formatPrice(player.price)}m</span>
                    <span className="points">Total Pts {player.points}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
