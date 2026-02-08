import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api.js";

const formatDateTime = (value) => {
  if (!value) return "Not updated yet";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "Not updated yet";
  return dt.toLocaleString();
};

export default function LeagueDashboard() {
  const { id } = useParams();
  const [league, setLeague] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let mounted = true;
    setStatus(null);
    api.get(`/leagues/${id}/dashboard`)
      .then((res) => {
        if (!mounted) return;
        setLeague(res.data);
      })
      .catch((err) => {
        if (!mounted) return;
        setStatus(err.response?.data?.error || "Failed to load league");
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <section className="page">
      <div className="page__header">
        <h2>League Dashboard</h2>
        {league ? (
          <p>{league.name} · Code {league.code}</p>
        ) : (
          <p>Loading league details...</p>
        )}
      </div>

      {status && <div className="notice">{status}</div>}

      {league && (
        <div className="panel-block">
          <div className="panel-title">Standings</div>
          <div className="muted">Last updated: {formatDateTime(league.standingsUpdatedAt)}</div>
          <div className="table">
            <div className="table__row table__head">
              <span>Rank</span>
              <span>Manager</span>
              <span>Team</span>
              <span>Points</span>
            </div>
            {(league.standings || []).map((row) => (
              <div className="table__row" key={row.userId}>
                <span>#{row.rank}</span>
                <span>{row.userName}</span>
                <span>{row.teamName}</span>
                <span>{row.points}</span>
              </div>
            ))}
            {(!league.standings || league.standings.length === 0) && (
              <div className="muted">No standings available yet.</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
