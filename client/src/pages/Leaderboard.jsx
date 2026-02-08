import React, { useEffect, useState } from "react";
import api from "../api.js";

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.get("/teams/leaderboard").then((res) => {
      if (mounted) {
        setRows(res.data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <div className="page">Loading leaderboard...</div>;

  return (
    <section className="page">
      <div className="page__header">
        <h2>Leaderboard</h2>
        <p>Top fantasy teams ranked by points.</p>
      </div>
      <div className="table">
        <div className="table__row table__head">
          <span>Rank</span>
          <span>Team</span>
          <span>Manager</span>
          <span>Points</span>
        </div>
        {rows.map((row, idx) => (
          <div className="table__row" key={row.id}>
            <span>#{idx + 1}</span>
            <span>{row.name}</span>
            <span>{row.owner}</span>
            <span>{row.points}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
