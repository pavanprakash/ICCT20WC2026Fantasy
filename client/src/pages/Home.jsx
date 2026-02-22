import React from "react";
const TEAM_BUDGET_CAP = Number(import.meta.env.VITE_TEAM_BUDGET_CAP || 100);
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <section className="page home">
      <div className="hero">
        <div>
          <p className="eyebrow">Fantasy • ICC World Cup 2026</p>
          <h1>Build your XI. Track points. Rule the leaderboard.</h1>
          <p className="lead">
            Create a fantasy team from elite international players, stay under budget,
            and climb the rankings as stats update.
          </p>
          <div className="hero__actions">
            <Link className="btn btn--primary" to="/team">
              Create Your Team
            </Link>
            <Link className="btn btn--ghost" to="/players">
              View Player Pool
            </Link>
          </div>
        </div>
        <div className="hero__card">
          <h3>Live Points Formula</h3>
          <ul>
            <li>Runs = 1 point each</li>
            <li>Wickets = 20 points each</li>
            <li>Catches = 10 points each</li>
          </ul>
          <p className="hint">Demo stats seeded locally.</p>
        </div>
      </div>
      <div className="grid">
        <div className="card">
          <h4>Balanced Budget</h4>
          <p>Pick exactly 11 players with a max budget of {TEAM_BUDGET_CAP}.</p>
        </div>
        <div className="card">
          <h4>Quick Team Builder</h4>
          <p>Filter the roster, compare roles, and lock in your XI.</p>
        </div>
        <div className="card">
          <h4>Leaderboard</h4>
          <p>See how your squad stacks up against others.</p>
        </div>
      </div>
    </section>
  );
}
