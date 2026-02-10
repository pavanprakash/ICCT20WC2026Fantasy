import React, { useEffect, useMemo, useState } from "react";
import api from "../api.js";
import fixtures from "../data/fixtures-2026.js";
import SelectedTeamField from "../components/SelectedTeamField.jsx";

const BUDGET = 90;
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
const formatPrice = (value) => Number(value || 0).toFixed(1);
const todayUtc = () => {
  const now = new Date();
  return now.toISOString().slice(0, 10);
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

const computeMatchWindow = (matches) => {
  const list = matches.map(parseMatchStart).filter(Boolean).sort((a, b) => a.startMs - b.startMs);
  const now = Date.now();
  const lockMatch = list.find(
    (m) => now >= m.startMs - LOCK_BEFORE_MS && now <= m.startMs + LOCK_AFTER_MS
  );
  const nextMatch = list.find((m) => m.startMs > now);
  return { list, lockMatch, nextMatch };
};

export default function TeamBuilder() {
  const statusRef = React.useRef(null);
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
  const [nextMatch, setNextMatch] = useState(null);
  const [teamMeta, setTeamMeta] = useState(null);
  const [submissionLock, setSubmissionLock] = useState({ locked: false, message: null });
  const [lockMeta, setLockMeta] = useState({ firstStart: null, lockUntil: null });
  const [dailyPoints, setDailyPoints] = useState({ total: 0, matches: 0, loading: true });
  const [periodPoints, setPeriodPoints] = useState({ total: 0, matches: 0, loading: true });
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const [playersStatus, setPlayersStatus] = useState("loading");

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
        const [p, t] = await Promise.all([api.get("/players"), api.get("/teams/me")]);
        if (!mounted) return;
        const list = Array.isArray(p.data) ? p.data : [];
        setPlayers(list);
        setPlayersStatus(list.length ? "ready" : "empty");
        if (t.data) {
          setTeamName(t.data.name);
          setSelected(t.data.players.map((pl) => pl._id));
          setCaptainId(t.data.captain ? String(t.data.captain) : "");
          setViceCaptainId(t.data.viceCaptain ? String(t.data.viceCaptain) : "");
          setSavedTeam({
            players: t.data.players.map((pl) => pl._id),
            captainId: t.data.captain ? String(t.data.captain) : "",
            viceCaptainId: t.data.viceCaptain ? String(t.data.viceCaptain) : ""
          });
          setIsEditing(false);
        setTeamMeta({
          lockedInLeague: t.data.lockedInLeague || false,
          transfersLimit: t.data.transfersLimit ?? 120,
          transfersUsedTotal: t.data.transfersUsedTotal ?? 0,
          transfersByRound: t.data.transfersByRound || {},
          submittedAt: t.data.submittedAt || null,
          lastSubmissionDate: t.data.lastSubmissionDate || null,
          submittedForDate: t.data.submittedForDate || null,
          submittedForMatchId: t.data.submittedForMatchId || null,
          submittedForMatchStart: t.data.submittedForMatchStart || null
        });
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
        const matches = res.data?.matches || [];
        const { lockMatch, nextMatch: upcoming } = computeMatchWindow(matches);
        if (!matches.length) {
          const local = fixtures.map((m) => ({
            ...m,
            timeGMT: m.timeGMT || m.time || null
          }));
          const localWindow = computeMatchWindow(local);
          setNextMatch(localWindow.nextMatch || null);
          setFixtureDay(local.filter((m) => m.date === (localWindow.nextMatch?.date || nextFixtureDateUtc())));
          setFixtureStatus(local.length ? "ok" : "empty");
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
        const focusDate = (upcoming && upcoming.date) || nextFixtureDateUtc();
        const focusMatches = matches.filter((m) => m.date === focusDate);
        setFixtureDay(focusMatches);
        setFixtureStatus(focusMatches.length ? "ok" : "empty");
      })
      .catch(() => {
        if (!mounted) return;
        const dateKey = nextFixtureDateUtc();
        const localTodays = fixtures.filter((m) => m.date === dateKey);
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
    if (!teamMeta) return 0;
    const key = roundKey();
    const map = teamMeta.transfersByRound || {};
    if (map instanceof Map) {
      return Number(map.get(key) || 0);
    }
    return Number(map[key] || 0);
  }, [teamMeta]);

  const transfersRemaining = useMemo(() => {
    if (!teamMeta) return null;
    const limit = teamMeta.transfersLimit ?? 120;
    const used = teamMeta.transfersUsedTotal ?? 0;
    return Math.max(0, limit - used);
  }, [teamMeta]);

  const transfersByRoundList = useMemo(() => {
    if (!teamMeta?.transfersByRound) return [];
    const map = teamMeta.transfersByRound;
    const entries = map instanceof Map ? Array.from(map.entries()) : Object.entries(map);
    return entries
      .map(([round, count]) => ({ round, count: Number(count) || 0 }))
      .sort((a, b) => (a.round > b.round ? 1 : -1));
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
      setStatus("Budget exceeded. Remove a player first.");
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
  const firstSubmitFreeWindow = useMemo(() => {
    if (!nextMatch?.startMs) return false;
    const start = Number(nextMatch.startMs);
    if (!Number.isFinite(start)) return false;
    const used = teamMeta?.transfersUsedTotal ?? 0;
    return Date.now() < start && used === 0;
  }, [nextMatch?.startMs, teamMeta?.transfersUsedTotal]);

  const alreadySubmittedForNext =
    teamMeta?.submittedForMatchId &&
    nextMatch?.id &&
    teamMeta.submittedForMatchId === nextMatch.id &&
    !firstSubmitFreeWindow;
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
        focusStatus("Select a captain and a vice-captain.");
        return;
      }
      const res = await api.post("/teams", {
        name: teamName,
        playerIds: selected,
        captainId,
        viceCaptainId,
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
        setTeamMeta((prev) => ({
          lockedInLeague: res.data.lockedInLeague ?? prev?.lockedInLeague ?? false,
          transfersLimit: res.data.transfersLimit ?? prev?.transfersLimit ?? 120,
          transfersUsedTotal: res.data.transfersUsedTotal ?? prev?.transfersUsedTotal ?? 0,
          transfersByRound: res.data.transfersByRound ?? prev?.transfersByRound ?? {},
          transferPhase: res.data.transferPhase ?? prev?.transferPhase ?? "GROUP",
          postGroupResetDone: res.data.postGroupResetDone ?? prev?.postGroupResetDone ?? false,
          lastSubmissionDate: res.data.lastSubmissionDate ?? prev?.lastSubmissionDate ?? null,
          submittedForMatchId: res.data.submittedForMatchId ?? prev?.submittedForMatchId ?? null,
          submittedForMatchStart: res.data.submittedForMatchStart ?? prev?.submittedForMatchStart ?? null
        }));
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

  useEffect(() => {
    const selectedSet = new Set(selected.map(String));
    if (captainId && !selectedSet.has(String(captainId))) {
      setCaptainId("");
    }
    if (viceCaptainId && !selectedSet.has(String(viceCaptainId))) {
      setViceCaptainId("");
    }
  }, [selected, captainId, viceCaptainId]);

  useEffect(() => {
    if (!teamMeta || !isEditing) return;
    setEditSecondsLeft(240);
    const id = setTimeout(() => {
      setSelected(savedTeam.players || []);
      setCaptainId(savedTeam.captainId || "");
      setViceCaptainId(savedTeam.viceCaptainId || "");
      setIsEditing(false);
      setEditSecondsLeft(0);
      setStatus("Edit timed out. Reverted to saved team.");
    }, 240000);
    return () => clearTimeout(id);
  }, [teamMeta, isEditing, savedTeam]);

  useEffect(() => {
    if (!teamMeta || !isEditing) return;
    const tick = setInterval(() => {
      setEditSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(tick);
  }, [teamMeta, isEditing]);

  const handleRemove = (id) => {
    if (teamMeta && !isEditing) {
      setStatus("Click Update Team to make changes.");
      return;
    }
    setSelected((prev) => prev.filter((s) => String(s) !== String(id)));
  };

  const editTimerLabel = useMemo(() => {
    const total = Math.max(0, editSecondsLeft || 0);
    const minutes = String(Math.floor(total / 60)).padStart(2, "0");
    const seconds = String(total % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [editSecondsLeft]);

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
        <p>Pick 11 players under a budget of £90m. Max 7 players from the same team.</p>
      </div>

      <div className="team-builder">
        <div className="team-panel">
          <label className="label">Team Name</label>
          <input
            className="input"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
          />
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
          {firstSubmitFreeWindow && !teamMeta?.submittedForMatchStart ? (
            <div className="notice">Free changes until your first match starts.</div>
          ) : null}
          {teamMeta?.lockedInLeague ? (
            <div className="transfer-summary">
              <div>Transfers this round: <strong>{transfersUsedThisRound}</strong></div>
              <div>Transfers used: <strong>{teamMeta.transfersUsedTotal ?? 0}</strong></div>
              <div>Transfers remaining: <strong>{transfersRemaining ?? 0}</strong> / {teamMeta.transfersLimit ?? 120}</div>
              <div className="muted">Transfer phase: {teamMeta.transferPhase === "FINAL" ? "Finals" : "Group"}</div>
              {teamMeta.transferPhase === "FINAL" && !teamMeta.postGroupResetDone ? (
                <div className="muted">Post-group reset available (unlimited). Your next update won't count.</div>
              ) : null}
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
            </div>
          ) : (
            <div className="transfer-summary muted">Unlimited transfers until you submit a team into a league.</div>
          )}
          <div className="panel-block">
            <div className="filter-group">
              <label className="label">Captain</label>
              <select
                className="input"
                value={captainId}
                onChange={(e) => setCaptainId(e.target.value)}
              >
                <option value="">Select captain</option>
                {selectedPlayers.map((player) => (
                  <option key={`cap-${player._id}`} value={player._id}>
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
              >
                <option value="">Select vice-captain</option>
                {selectedPlayers.map((player) => (
                  <option key={`vc-${player._id}`} value={player._id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="panel-block">
            <div className="panel-title">Upcoming Fixtures (GMT)</div>
            {nextMatch?.date ? (
              <div className="muted">Next match date: {nextMatch.date}</div>
            ) : null}
            {fixtureStatus === "loading" && <div className="muted">Loading fixtures...</div>}
            {fixtureStatus === "error" && <div className="muted">Fixtures unavailable.</div>}
            {fixtureStatus === "empty" && (
              <div className="muted">
                {targetDateKey ? `No fixtures for ${targetDateKey}.` : "No upcoming fixtures."}
              </div>
            )}
            {fixtureStatus === "ok" && (
              <div className="fixture-mini">
                {fixtureDay.map((match, idx) => (
                  <div key={match.id || idx} className="fixture-mini__item">
                    <div className="fixture-mini__time">GMT {match.timeGMT || match.time}</div>
                    <div className="fixture-mini__teams">{match.team1} vs {match.team2}</div>
                    <div className="muted">{match.venue}</div>
                    <div className="muted">{match.statusLabel || match.status}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="muted">
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
              isSubmissionLocked ||
              alreadySubmittedForNext
            }
          >
            {teamMeta && !isEditing ? "Update Team" : selected.length > 0 ? "Submit Team" : "Select Team"}
            {teamMeta && isEditing ? ` (${editTimerLabel})` : ""}
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
          <div className="panel-block">
            <div className="panel-title">Selected XI</div>
            <SelectedTeamField
              players={selectedPlayers}
              captainId={captainId}
              viceCaptainId={viceCaptainId}
              canEdit={!teamMeta || isEditing}
              onRemove={handleRemove}
            />
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
              <label className="label">Team</label>
              <div className={`multi-select ${teamDropdownOpen ? "multi-select--open" : ""}`}>
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
            <div className="filter-meta muted">
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
            <div className="panel-block">
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
                  <div className="muted">{player.country}</div>
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
