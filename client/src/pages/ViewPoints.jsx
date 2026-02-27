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

const TEAM_CODE_MAP = {
  AFGHANISTAN: "AFG",
  AUSTRALIA: "AUS",
  BANGLADESH: "BAN",
  CANADA: "CAN",
  ENGLAND: "ENG",
  INDIA: "IND",
  IRELAND: "IRE",
  ITALY: "ITA",
  NAMIBIA: "NAM",
  NEPAL: "NEP",
  NETHERLANDS: "NED",
  "NEW ZEALAND": "NZ",
  OMAN: "OMN",
  PAKISTAN: "PAK",
  SCOTLAND: "SCO",
  "SOUTH AFRICA": "SA",
  "SRI LANKA": "SL",
  UAE: "UAE",
  USA: "USA",
  "WEST INDIES": "WI",
  ZIMBABWE: "ZIM"
};

const shortTeam = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "TBD";
  const upper = raw.toUpperCase();
  if (upper.length <= 3) return upper;
  if (TEAM_CODE_MAP[upper]) return TEAM_CODE_MAP[upper];
  return upper.replace(/[^A-Z]/g, "").slice(0, 3) || "TBD";
};

const simpleFixture = (row) => {
  if (row?.team1 && row?.team2) return `${shortTeam(row.team1)} v ${shortTeam(row.team2)}`;
  const raw = String(row?.matchName || "").trim();
  if (!raw) return "TBD";
  const first = raw.split(",")[0] || raw;
  const parts = first.split(/\s+v(?:s)?\s+/i);
  if (parts.length === 2) return `${shortTeam(parts[0])} v ${shortTeam(parts[1])}`;
  return first;
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
            const clickable = canOpenPoints(row);
            const showSuperSubTag = Boolean(row.superSubUsed) || (Boolean(row.superSub) && clickable);
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
