import React, { useEffect, useMemo, useState } from "react";
import api from "../api.js";
import fixtures from "../data/fixtures-2026.js";

const BUDGET = 100;
const TEAM_SIZE = 11;
const MAX_PER_TEAM = 7;
const formatPrice = (value) => Number(value || 0).toFixed(1);
const todayUtc = () => {
  const now = new Date();
  return now.toISOString().slice(0, 10);
};

const roundKey = todayUtc;

export default function TeamBuilder() {
  const [players, setPlayers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [teamName, setTeamName] = useState("My XI");
  const [status, setStatus] = useState(null);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [fixtureDay, setFixtureDay] = useState([]);
  const [fixtureStatus, setFixtureStatus] = useState("loading");
  const [teamMeta, setTeamMeta] = useState(null);
  const [submissionLock, setSubmissionLock] = useState({ locked: false, message: null });
  const [lockMeta, setLockMeta] = useState({ firstStart: null, lockUntil: null });
  const [dailyPoints, setDailyPoints] = useState({ total: 0, matches: 0, loading: true });

  useEffect(() => {
    let mounted = true;
    Promise.all([api.get("/players"), api.get("/teams/me")]).then(([p, t]) => {
      if (!mounted) return;
      setPlayers(p.data);
      if (t.data) {
        setTeamName(t.data.name);
        setSelected(t.data.players.map((pl) => pl._id));
        setTeamMeta({
          lockedInLeague: t.data.lockedInLeague || false,
          transfersLimit: t.data.transfersLimit ?? 120,
          transfersUsedTotal: t.data.transfersUsedTotal ?? 0,
          transfersByRound: t.data.transfersByRound || {},
          submittedAt: t.data.submittedAt || null,
          lastSubmissionDate: t.data.lastSubmissionDate || null
        });
      } else {
        setTeamMeta(null);
      }
    });

    const dateKey = todayUtc();
    api.get("/fixtures")
      .then((res) => {
        if (!mounted) return;
        const matches = res.data?.matches || [];
        const todays = matches.filter((m) => m.date === dateKey);
        if (todays.length) {
          setFixtureDay(todays);
          setFixtureStatus("ok");
          const first = todays.map((m) => m.timeGMT).filter(Boolean).sort()[0];
          if (first) {
            const now = new Date();
            const start = new Date(`${dateKey}T${first}:00Z`).getTime();
            const lockUntil = start + 4 * 60 * 1000;
            setLockMeta({ firstStart: start, lockUntil });
            const locked = now.getTime() >= start && now.getTime() <= lockUntil;
            setSubmissionLock({
              locked,
              message: locked ? "Submissions locked for 4 minutes after first match start." : null
            });
          }
          return;
        }
        const localTodays = fixtures.filter((m) => m.date === dateKey);
        setFixtureDay(localTodays);
        setFixtureStatus(localTodays.length ? "ok" : "empty");
        const firstLocal = localTodays.map((m) => m.timeGMT).filter(Boolean).sort()[0];
        if (firstLocal) {
          const start = new Date(`${dateKey}T${firstLocal}:00Z`).getTime();
          const lockUntil = start + 4 * 60 * 1000;
          setLockMeta({ firstStart: start, lockUntil });
          const now = Date.now();
          const locked = now >= start && now <= lockUntil;
          setSubmissionLock({
            locked,
            message: locked ? "Submissions locked for 4 minutes after first match start." : null
          });
        } else {
          setSubmissionLock({ locked: false, message: null });
          setLockMeta({ firstStart: null, lockUntil: null });
        }
      })
      .catch(() => {
        if (!mounted) return;
        const localTodays = fixtures.filter((m) => m.date === dateKey);
        setFixtureDay(localTodays);
        setFixtureStatus(localTodays.length ? "ok" : "error");
        const firstLocal = localTodays.map((m) => m.timeGMT).filter(Boolean).sort()[0];
        if (firstLocal) {
          const start = new Date(`${dateKey}T${firstLocal}:00Z`).getTime();
          const lockUntil = start + 4 * 60 * 1000;
          setLockMeta({ firstStart: start, lockUntil });
          const now = Date.now();
          const locked = now >= start && now <= lockUntil;
          setSubmissionLock({
            locked,
            message: locked ? "Submissions locked for 4 minutes after first match start." : null
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
    let mounted = true;
    setDailyPoints((prev) => ({ ...prev, loading: true }));
    const dateKey = todayUtc();
    api.get(`/fantasy/daily?date=${dateKey}`)
      .then((res) => {
        if (!mounted) return;
        setDailyPoints({
          total: res.data?.totalPoints ?? 0,
          matches: res.data?.matchesCount ?? 0,
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
    if (!lockMeta.firstStart || !lockMeta.lockUntil) return;
    const tick = () => {
      const now = Date.now();
      const locked = now >= lockMeta.firstStart && now <= lockMeta.lockUntil;
      setSubmissionLock({
        locked,
        message: locked ? "Submissions locked for 4 minutes after first match start." : null
      });
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [lockMeta.firstStart, lockMeta.lockUntil]);

  const teams = useMemo(() => {
    const set = new Set(players.map((p) => p.country));
    return ["all", ...Array.from(set).sort()];
  }, [players]);

  const selectedPlayers = useMemo(
    () => selected.map((id) => players.find((p) => p._id === id)).filter(Boolean),
    [players, selected]
  );

  const totalCost = useMemo(() => {
    return selectedPlayers.reduce((sum, p) => sum + (p?.price || 0), 0);
  }, [selectedPlayers]);

  const totalPoints = useMemo(() => {
    return selectedPlayers.reduce((sum, p) => sum + (p?.points || 0), 0);
  }, [selectedPlayers]);

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

  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      const matchQuery = !q || p.name.toLowerCase().includes(q);
      const matchTeam = teamFilter === "all" || p.country === teamFilter;
      return matchQuery && matchTeam;
    });
  }, [players, query, teamFilter]);

  const toggle = (id) => {
    setStatus(null);
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

    if (totalCost + player.price > BUDGET) {
      setStatus("Budget exceeded. Remove a player first.");
      return;
    }
    setSelected([...selected, id]);
  };

  const todayKey = todayUtc();
  const isSubmissionLocked = submissionLock.locked;
  const lockCountdown = useMemo(() => {
    if (!isSubmissionLocked || !lockMeta.lockUntil) return null;
    const minutes = Math.max(0, Math.ceil((lockMeta.lockUntil - Date.now()) / 60000));
    return minutes;
  }, [isSubmissionLocked, lockMeta.lockUntil]);
  const submittedToday = teamMeta?.lockedInLeague && teamMeta?.lastSubmissionDate === todayKey;

  const saveTeam = async () => {
    setStatus(null);
    try {
      if (selected.length !== TEAM_SIZE) {
        setStatus("Pick exactly 11 players before saving.");
        return;
      }
      const res = await api.post("/teams", { name: teamName, playerIds: selected });
      if (res.data) {
        setTeamMeta((prev) => ({
          lockedInLeague: res.data.lockedInLeague ?? prev?.lockedInLeague ?? false,
          transfersLimit: res.data.transfersLimit ?? prev?.transfersLimit ?? 120,
          transfersUsedTotal: res.data.transfersUsedTotal ?? prev?.transfersUsedTotal ?? 0,
          transfersByRound: res.data.transfersByRound ?? prev?.transfersByRound ?? {},
          transferPhase: res.data.transferPhase ?? prev?.transferPhase ?? "GROUP",
          postGroupResetDone: res.data.postGroupResetDone ?? prev?.postGroupResetDone ?? false,
          lastSubmissionDate: res.data.lastSubmissionDate ?? prev?.lastSubmissionDate ?? null
        }));
      }
      setStatus("Team saved successfully.");
    } catch (err) {
      setStatus(err.response?.data?.error || "Failed to save team");
    }
  };

  return (
    <section className="page">
      <div className="page__header">
        <h2>Create Your Team</h2>
        <p>Pick 11 players under a budget of £100m. Max 7 players from the same team.</p>
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
              <span className="muted">Budget</span>
              <strong>£{formatPrice(totalCost)}m / £{formatPrice(BUDGET)}m</strong>
            </div>
            <div>
              <span className="muted">Points</span>
              <strong>{totalPoints}</strong>
            </div>
            <div>
              <span className="muted">Daily Points</span>
              <strong>{dailyPoints.loading ? "..." : dailyPoints.total}</strong>
            </div>
            <div>
              <span className="muted">Matches Today</span>
              <strong>{dailyPoints.loading ? "..." : dailyPoints.matches}</strong>
            </div>
          </div>
          {status && <div className="notice">{status}</div>}
          {isSubmissionLocked && submissionLock.message ? (
            <div className="notice">{submissionLock.message}{lockCountdown !== null ? ` (${lockCountdown} min)` : ""}</div>
          ) : null}
          {submittedToday ? (
            <div className="notice">You have already submitted your team today.</div>
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
            <div className="panel-title">Today's Fixtures (GMT)</div>
            {fixtureStatus === "loading" && <div className="muted">Loading fixtures...</div>}
            {fixtureStatus === "error" && <div className="muted">Fixtures unavailable.</div>}
            {fixtureStatus === "empty" && <div className="muted">No fixtures today.</div>}
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
          <button className="btn btn--primary" onClick={saveTeam} disabled={isSubmissionLocked || submittedToday}>
            {teamMeta ? (teamMeta.lockedInLeague ? "Transfer Team" : "Update Team") : "Submit Team"}
          </button>
        </div>

        <div>
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
              <select
                className="input"
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
              >
                {teams.map((team) => (
                  <option key={team} value={team}>
                    {team === "all" ? "All Teams" : team}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-meta muted">
              Showing {filteredPlayers.length} of {players.length}
            </div>
          </div>

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
                    <span className="pill">{player.role}</span>
                  </div>
                  <div className="muted">{player.country}</div>
                  <div className="card__footer">
                    <span className="price">Price £{formatPrice(player.price)}m</span>
                    <span className="points">Pts {player.points}</span>
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
