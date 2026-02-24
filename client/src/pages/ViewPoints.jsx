import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api.js";

const MATCH_DURATION_MS = 4 * 60 * 60 * 1000;

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

const canOpenPoints = (row) => {
  const total = Number(row?.totalPoints || 0);
  if (total > 0) return true;
  const startMs = Number(row?.matchStartMs || 0);
  if (!Number.isFinite(startMs) || startMs <= 0) return false;
  return Date.now() >= startMs + MATCH_DURATION_MS;
};

const simpleFixture = (row) => {
  if (row?.team1 && row?.team2) return `${row.team1} v ${row.team2}`;
  const raw = String(row?.matchName || "").trim();
  if (!raw) return "TBD";
  return raw.split(",")[0] || raw;
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
            const fixture = simpleFixture(row);
            const when = row.matchStartMs || row.matchDate;
            const showCaptainTags = Boolean(row.booster) && row.booster !== "captainx3";
            const showSuperSubTag = Boolean(row.superSubUsed || row.superSub);
            const clickable = canOpenPoints(row);
            return (
              <div className="table__row" key={row.id}>
                <span>{formatDate(when)}</span>
                <span>{formatTime(when)}</span>
                <span>
                  {fixture}
                  {showCaptainTags && (row.captainName || row.viceCaptainName) ? (
                    <div className="muted">
                      {row.captainName ? `${row.captainName} (C)` : null}
                      {row.captainName && row.viceCaptainName ? " · " : null}
                      {row.viceCaptainName ? `${row.viceCaptainName} (VC)` : null}
                    </div>
                  ) : null}
                </span>
                <span>{row.venue || "TBD"}</span>
                <span>
                  {clickable ? (
                    <Link to={`/points/${row.id}`} className="link link--points">
                      {row.totalPoints}
                    </Link>
                  ) : (
                    <span>{row.totalPoints}</span>
                  )}
                  {row.booster ? <span className="booster-flag">Booster</span> : null}
                  {showSuperSubTag ? (
                    <span className="booster-flag booster-flag--sub">
                      {row.superSubUsed ? "Super Sub Used" : "Super Sub"}
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
