import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
            const fixture = row.matchName || (row.team1 && row.team2 ? `${row.team1} vs ${row.team2}` : "TBD");
            const when = row.matchStartMs || row.matchDate;
            const showSuperSubTag = Boolean(row.superSubUsed || row.superSub);
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
