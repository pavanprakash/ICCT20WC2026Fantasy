import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import api, { setAuthToken } from "./api.js";
import Home from "./pages/Home.jsx";
import Players from "./pages/Players.jsx";
import TeamBuilder from "./pages/TeamBuilder.jsx";
import Leaderboard from "./pages/Leaderboard.jsx";
import Auth from "./pages/Auth.jsx";
import LeagueCreate from "./pages/LeagueCreate.jsx";
import LeagueDashboard from "./pages/LeagueDashboard.jsx";
import Fixtures from "./pages/Fixtures.jsx";
import Rules from "./pages/Rules.jsx";

function Navbar({ user, onLogout }) {
  return (
    <header className="nav">
      <div className="brand">
        <span className="brand__tag">ICC 2026</span>
        <Link to="/" className="brand__title">
          Fantasy League
        </Link>
      </div>
      <nav className="nav__links">
        <Link to="/fixtures">Fixtures</Link>
        <Link to="/rules">Rules</Link>
        <Link to="/team">Create Team</Link>
        <Link to="/leaderboard">Leaderboard</Link>
        <Link to="/league">Create League</Link>
      </nav>
      <div className="nav__auth">
        {user ? (
          <>
            <span className="nav__user">{user.name}</span>
            <button className="btn btn--ghost" onClick={onLogout}>
              Logout
            </button>
          </>
        ) : (
          <Link className="btn btn--ghost" to="/auth">
            Login
          </Link>
        )}
      </div>
    </header>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("fantasy_auth");
    if (stored) {
      const data = JSON.parse(stored);
      setUser(data.user);
      setAuthToken(data.token);
      const lastPath = localStorage.getItem("fantasy_last_path");
      if (lastPath && lastPath !== "/auth" && location.pathname === "/auth") {
        navigate(lastPath, { replace: true });
      }
    }
  }, []);

  useEffect(() => {
    if (user && location.pathname) {
      localStorage.setItem("fantasy_last_path", location.pathname);
    }
  }, [user, location.pathname]);

  const handleAuth = (data) => {
    localStorage.setItem("fantasy_auth", JSON.stringify(data));
    setUser(data.user);
    setAuthToken(data.token);
    navigate("/leaderboard");
  };

  const handleLogout = () => {
    localStorage.removeItem("fantasy_auth");
    setUser(null);
    setAuthToken(null);
    navigate("/");
  };

  const context = useMemo(() => ({ user }), [user]);

  return (
    <div className="app">
      <Navbar user={user} onLogout={handleLogout} />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/players" element={<Players />} />
          <Route path="/fixtures" element={<Fixtures />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route
            path="/team"
            element={user ? <TeamBuilder context={context} /> : <Navigate to="/auth" />}
          />
          <Route
            path="/league"
            element={user ? <LeagueCreate /> : <Navigate to="/auth" />}
          />
          <Route
            path="/league/:id"
            element={user ? <LeagueDashboard /> : <Navigate to="/auth" />}
          />
          <Route
            path="/auth"
            element={user ? <Navigate to="/leaderboard" /> : <Auth onAuth={handleAuth} />}
          />
        </Routes>
      </main>
      <footer className="footer">
        <div>
          Built for ICC World Cup 2026 Fantasy. Local demo only.
        </div>
      </footer>
    </div>
  );
}
