import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api.js";

const formatDate = (value) => {
  if (!value) return "TBD";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "TBD";
  return dt.toLocaleDateString();
};

const formatTime = (value) => {
  if (!value) return "TBD";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "TBD";
  return dt.toLocaleTimeString();
};

export default function ViewPoints() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let mounted = true;
    api.get("/fantasy/submissions")
      .then((res) => {
        if (!mounted) return;
        setRows(res.data?.submissions || []);
        setStatus("ready");
      })
      .catch(() => {
        if (!mounted) return;
        setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="page">
      <div className="page__header">
        <h2>View Points</h2>
        <p>Points earned for fixtures your team was submitted against.</p>
      </div>

      {status === "loading" && <div className="muted">Loading points...</div>}
      {status === "error" && <div className="notice">Failed to load points.</div>}

      {status === "ready" && rows.length === 0 && (
        <div className="notice">No submissions found yet.</div>
      )}

      {rows.length > 0 && (
        <div className="table table--points">
          <div className="table__row table__head">
            <span>Date</span>
            <span>Time</span>
            <span>Fixture</span>
            <span>Venue</span>
            <span>Points</span>
          </div>
          {rows.map((row) => {
            const fixture = row.matchName || (row.team1 && row.team2 ? `${row.team1} vs ${row.team2}` : "TBD");
            const when = row.matchStartMs || row.matchDate;
            return (
              <div className="table__row" key={row.id}>
                <span>{formatDate(when)}</span>
                <span>{formatTime(when)}</span>
                <span>{fixture}</span>
                <span>{row.venue || "TBD"}</span>
                <span>
                  <Link to={`/points/${row.id}`} className="link link--points">
                    {row.totalPoints}
                  </Link>
                  {row.booster ? <span className="booster-flag">Booster</span> : null}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
