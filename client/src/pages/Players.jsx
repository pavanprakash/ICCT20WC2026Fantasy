import React, { useEffect, useMemo, useState } from "react";
import api from "../api.js";

const formatPrice = (value) => Number(value || 0).toFixed(1);

export default function Players() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");

  useEffect(() => {
    let mounted = true;
    api.get("/players").then((res) => {
      if (mounted) {
        setPlayers(res.data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

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
            <div className="muted">{player.country}</div>
            <div className="stats">
              <div>Runs: {player.stats.runs}</div>
              <div>Wickets: {player.stats.wickets}</div>
              <div>Catches: {player.stats.catches}</div>
            </div>
            <div className="card__footer">
              <span className="price">Price: £{formatPrice(player.price)}m</span>
              <span className="points">Points: {player.points}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
