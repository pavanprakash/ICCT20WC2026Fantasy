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

const boosterLabel = (value) => {
  const key = String(value || "").toLowerCase();
  if (!key) return null;
  if (key === "batsman") return "Batsman Booster";
  if (key === "bowler") return "Bowler Booster";
  if (key === "wk") return "Wicketkeeper Booster";
  if (key === "allrounder") return "All-rounder Booster";
  if (key === "teamx2") return "Team X2 Booster";
  if (key === "captainx3") return "Captain X3 Booster";
  return "Booster";
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

  const captainKey = useMemo(() => {
    if (submission?.effectiveCaptainName) {
      return normalize(submission.effectiveCaptainName);
    }
    if (!submission?.captainId || !submission?.players?.length) return null;
    const cap = submission.players.find((p) => String(p._id) === String(submission.captainId));
    return cap ? normalize(cap.name) : null;
  }, [submission?.captainId, submission?.players, submission?.effectiveCaptainName]);

  const viceCaptainKey = useMemo(() => {
    if (submission?.effectiveViceCaptainName) {
      return normalize(submission.effectiveViceCaptainName);
    }
    if (!submission?.viceCaptainId || !submission?.players?.length) return null;
    const vc = submission.players.find((p) => String(p._id) === String(submission.viceCaptainId));
    return vc ? normalize(vc.name) : null;
  }, [submission?.viceCaptainId, submission?.players, submission?.effectiveViceCaptainName]);

  const breakdown = useMemo(() => {
    const rows = Array.isArray(submission?.breakdown) ? submission.breakdown : [];
    return rows.slice();
  }, [submission?.breakdown]);

  const pointsByName = useMemo(() => {
    const map = new Map();
    breakdown.forEach((p) => {
      map.set(normalize(p.name), p.totalPoints);
    });
    return map;
  }, [breakdown]);

  const showCaptainTags = Boolean(submission?.booster) && submission?.booster !== "captainx3";

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
        <div className="notice notice--success">
          {boosterLabel(submission.booster)} applied for this fixture.
        </div>
      ) : null}
      {submission?.superSub ? (
        <div className="notice notice--info">
          Super Sub: {submission.superSub.name || "Selected"}.
        </div>
      ) : null}

      <div className="muted">
        <Link to="/points" className="link--back">← Back to View Points</Link>
      </div>

      {status === "error" && <div className="notice">Failed to load submission.</div>}

      {submission && (
        <>
          <div className="panel-block points-panel">
              <div className="panel-title">Total Points</div>
              <div className="points-accent">{submission.totalPoints}</div>
            </div>
          {breakdown.length ? (
            <div className="panel-block points-panel">
              <div className="panel-title">Points Breakdown</div>
              <div className="table table--points">
                <div className="table__row table__head">
                  <span>Player</span>
                  <span>Base</span>
                  <span>Multiplier</span>
                  <span>Total</span>
                </div>
                {breakdown.map((row) => (
                  <div className="table__row" key={row.name}>
                    <span>
                      {row.name}
                      {showCaptainTags && captainKey && normalize(row.name) === captainKey ? " (C)" : ""}
                      {showCaptainTags && viceCaptainKey && normalize(row.name) === viceCaptainKey ? " (VC)" : ""}
                    </span>
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
