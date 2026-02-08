import React, { useEffect, useState } from "react";
import api from "../api.js";

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [leagueStandings, setLeagueStandings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([api.get("/teams/leaderboard"), api.get("/leagues/mine/standings")])
      .then(([leaderboardRes, leaguesRes]) => {
        if (!mounted) return;
        setRows(leaderboardRes.data);
        setLeagueStandings(leaguesRes.data || []);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setLoading(false);
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

      {leagueStandings.length > 0 && (
        <div className="panel-block">
          <div className="panel-title">Your League Rankings</div>
          {leagueStandings.map((league) => (
            <div key={league.id} className="panel-block">
              <div className="panel-title">{league.name}</div>
              <div className="muted">
                Team: {league.myTeamName} · Rank: {league.myRank ?? "—"} · Points: {league.myPoints}
              </div>
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
              </div>
            </div>
          ))}
        </div>
      )}

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
