import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

export default function LeagueMemberPoints() {
  const { id, userId } = useParams();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading");
  const [meta, setMeta] = useState({ userName: "", leagueName: "" });

  useEffect(() => {
    let mounted = true;
    api.get(`/leagues/${id}/points/${userId}`)
      .then((res) => {
        if (!mounted) return;
        setRows(res.data?.submissions || []);
        setMeta({
          userName: res.data?.userName || "Member",
          leagueName: res.data?.leagueName || "League"
        });
        setStatus("ready");
      })
      .catch((err) => {
        if (!mounted) return;
        setStatus(err.response?.data?.error || "Failed to load points.");
      });
    return () => {
      mounted = false;
    };
  }, [id, userId]);

  return (
    <section className="page">
      <div className="page__header">
        <h2>View Points</h2>
        <p>{meta.userName} · {meta.leagueName}</p>
      </div>

      {status === "loading" && <div className="muted">Loading points...</div>}
      {status !== "loading" && status !== "ready" && <div className="notice">{status}</div>}

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
            const showSuperSubTag = Boolean(row.superSubUsed);
            const clickable = canOpenPoints(row);
            return (
              <div className="table__row" key={row.id}>
                <span>{formatDate(when)}</span>
                <span>{formatTime(when)}</span>
                <span>{fixture}</span>
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
                    <span className="booster-flag booster-flag--sub">Super Sub Used</span>
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
