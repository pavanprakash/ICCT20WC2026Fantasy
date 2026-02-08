import React, { useEffect, useMemo, useState } from "react";

import fixtures from "../data/fixtures-2026.js";
import api from "../api.js";

const parseUtc = (dateStr, timeStr) => {
  if (!timeStr) return null;
  const [hourStr, minuteStr] = timeStr.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hour, minute);
};


function formatDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export default function Fixtures() {
  const [remoteFixtures, setRemoteFixtures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.get("/fixtures")
      .then((res) => {
        if (!mounted) return;
        const matches = res.data?.matches || [];
        setRemoteFixtures(matches);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setRemoteFixtures([]);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const activeFixtures = useMemo(() => {
    return remoteFixtures.length ? remoteFixtures : fixtures;
  }, [remoteFixtures]);

  const now = Date.now();
  const grouped = activeFixtures.reduce((acc, fixture) => {
    if (!acc[fixture.date]) acc[fixture.date] = [];
    acc[fixture.date].push(fixture);
    return acc;
  }, {});

  const dates = Object.keys(grouped).sort();

  if (loading) {
    return <div className="page">Loading fixtures...</div>;
  }

  return (
    <section className="page">
      <div className="page__header">
        <h2>Fixtures</h2>
        <p>Official ICC Men's T20 World Cup 2026 fixtures in text format (start times in GMT).</p>
      </div>

      <div className="fixture-list">
        {dates.map((date) => (
          <div key={date} className="fixture-day">
            <h3>{formatDate(date)}</h3>
            <div className="fixture-day__matches">
              {grouped[date].map((match, idx) => (
                <div className="fixture-item" key={`${date}-${idx}`}>
                  <div>
                    <div className="fixture-time">GMT {match.timeGMT || match.time}</div>
                    <div className="fixture-teams">{match.team1} vs {match.team2}</div>
                  </div>
                  <div className="fixture-meta">
                    <span className="pill">{match.stage}</span>
                    <span className="pill">{match.statusLabel || ((parseUtc(match.date, match.timeGMT) || 0) < now ? "Completed" : "Scheduled")}</span>
                    <span className="muted">{match.venue}</span>
                    {match.status ? <span className="muted">{match.status}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
