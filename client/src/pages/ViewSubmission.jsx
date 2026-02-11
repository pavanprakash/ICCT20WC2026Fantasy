import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import api from "../api.js";
import SelectedTeamField from "../components/SelectedTeamField.jsx";

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const formatDateTime = (value) => {
  if (!value) return "TBD";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "TBD";
  return dt.toLocaleString();
};

export default function ViewSubmission() {
  const { id } = useParams();
  const [submission, setSubmission] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let mounted = true;
    api.get(`/fantasy/submissions/${id}`)
      .then((res) => {
        if (!mounted) return;
        setSubmission(res.data?.submission || null);
        setStatus("ready");
      })
      .catch(() => {
        if (!mounted) return;
        setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  const pointsByName = useMemo(() => {
    const map = new Map();
    if (!submission?.breakdown) return map;
    submission.breakdown.forEach((p) => {
      map.set(normalize(p.name), p.totalPoints);
    });
    return map;
  }, [submission?.breakdown]);

  return (
    <section className="page">
      <div className="page__header">
        <h2>Submitted XI</h2>
        {submission ? (
          <p>
            {submission.matchName || (submission.team1 && submission.team2 ? `${submission.team1} vs ${submission.team2}` : "Fixture")}
            {" · "}
            {formatDateTime(submission.matchStartMs || submission.matchDate)}
          </p>
        ) : (
          <p>Loading submission...</p>
        )}
      </div>
      {submission?.booster ? (
        <div className="notice notice--success">Batsmen Booster applied for this fixture.</div>
      ) : null}

      <div className="muted">
        <Link to="/points">← Back to View Points</Link>
      </div>

      {status === "error" && <div className="notice">Failed to load submission.</div>}

      {submission && (
        <>
          <div className="panel-block">
              <div className="panel-title">Total Points</div>
              <div className="muted">{submission.totalPoints}</div>
            </div>
          {submission.breakdown && submission.breakdown.length ? (
            <div className="panel-block">
              <div className="panel-title">Points Breakdown</div>
              <div className="table table--points">
                <div className="table__row table__head">
                  <span>Player</span>
                  <span>Base</span>
                  <span>Multiplier</span>
                  <span>Total</span>
                </div>
                {submission.breakdown.map((row) => (
                  <div className="table__row" key={row.name}>
                    <span>{row.name}</span>
                    <span>{row.basePoints}</span>
                    <span>{row.multiplier}x</span>
                    <span>{row.totalPoints}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <SelectedTeamField
            players={submission.players || []}
            captainId={submission.captainId}
            viceCaptainId={submission.viceCaptainId}
            canEdit={false}
            pointsByName={pointsByName}
          />
        </>
      )}
    </section>
  );
}
