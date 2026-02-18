import React, { useEffect, useMemo, useState } from "react";
import api from "../api.js";
import { countryFlag } from "../utils/flags.js";

const MATCH_DURATION_MS = 4 * 60 * 60 * 1000;
const SYNC_WINDOW_MS = 10 * 60 * 1000;

const formatPrice = (value) => Number(value || 0).toFixed(1);

export default function Players() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [fixtures, setFixtures] = useState([]);

  useEffect(() => {
    let mounted = true;
    const loadPlayers = async () => {
      try {
        await api.post("/fantasy/sync");
      } catch (err) {
        // Sync failures should not block showing players.
      }
      const res = await api.get("/players");
      if (mounted) {
        setPlayers(res.data);
        setLoading(false);
      }
    };
    const loadFixtures = async () => {
      try {
        const res = await api.get("/fixtures");
        if (mounted) {
          setFixtures(res.data?.matches || []);
        }
      } catch (err) {
        if (mounted) {
          setFixtures([]);
        }
      }
    };
    loadPlayers();
    loadFixtures();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!fixtures.length) return;
    let cancelled = false;
    const timers = [];
    const todayKey = new Date().toISOString().slice(0, 10);

    const scheduleSync = (match) => {
      if (!match?.date || !match?.timeGMT) return;
      if (match.date !== todayKey) return;
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
        const res = await api.get("/players");
        if (!cancelled) {
          setPlayers(res.data);
        }
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

    fixtures.forEach(scheduleSync);

    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [fixtures]);

  const teams = useMemo(() => {
    const set = new Set(players.map((p) => p.country));
    return ["all", ...Array.from(set).sort()];
  }, [players]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      const matchTeam = teamFilter === "all" || p.country === teamFilter;
      const matchQuery = !q || p.name.toLowerCase().includes(q);
      return matchTeam && matchQuery;
    });
  }, [players, query, teamFilter]);

  if (loading) {
    return <div className="page">Loading players...</div>;
  }

  return (
    <section className="page">
      <div className="page__header">
        <h2>Player Pool</h2>
        <p>Browse the ICC 2026 fantasy roster and plan your XI.</p>
      </div>

      <div className="filters">
        <div className="filter-group">
          <label className="label">Search</label>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player name"
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
          Showing {filtered.length} of {players.length}
        </div>
      </div>

      <div className="grid grid--players">
        {filtered.map((player) => (
          <div className="card card--player" key={player._id}>
            <div className="card__top">
              <h4>{player.name}</h4>
              <span className="pill">{player.role}</span>
            </div>
            {(() => {
              const flag = countryFlag(player.country);
              return (
                <div className="player-flag">
                  {flag.type === "img" ? <img src={flag.value} alt={`${player.country} flag`} /> : flag.value}
                </div>
              );
            })()}
            <div className="stats">
              <div>Runs: {player.stats.runs}</div>
              <div>Wickets: {player.stats.wickets}</div>
              <div>Catches: {player.stats.catches}</div>
            </div>
            <div className="card__footer">
              <span className="price">Price: £{formatPrice(player.price)}m</span>
              <span className="points">
                Points: {Number.isFinite(player.points) ? player.points : 0}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
