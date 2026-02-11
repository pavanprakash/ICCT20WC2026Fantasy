import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import ViewPoints from "./pages/ViewPoints.jsx";
import ViewSubmission from "./pages/ViewSubmission.jsx";
import Profile from "./pages/Profile.jsx";
import LeagueMemberPoints from "./pages/LeagueMemberPoints.jsx";
import Contact from "./pages/Contact.jsx";
import Downtime from "./pages/Downtime.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import t20Logo from "./assets/t20-logo.png";

function Navbar({ user, onLogout }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <header className="nav">
      <button
        className="nav__burger"
        type="button"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        <span />
        <span />
        <span />
      </button>
      <div className="brand">
        <span className="brand__tag">
          <img src={t20Logo} alt="ICC Men's T20 World Cup 2026" className="brand__logo" />
        </span>
        <Link to="/" className="brand__title">
          Fantasy League
        </Link>
      </div>
      <nav className="nav__links">
        <Link to="/fixtures">Fixtures</Link>
        <Link to="/rules">Rules</Link>
        <Link to="/team">Create Team</Link>
        <Link to="/points">View Points</Link>
        <Link to="/leaderboard">Leaderboard</Link>
        <Link to="/league">Create League</Link>
        <Link to="/profile">My Profile</Link>
        <Link to="/contact">Contact Us</Link>
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
      <div className={`nav-drawer ${menuOpen ? "nav-drawer--open" : ""}`} role="dialog">
        <div
          className={`nav-drawer__overlay ${menuOpen ? "nav-drawer__overlay--show" : ""}`}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
        <div className="nav-drawer__panel">
          <div className="nav-drawer__header">
            <div className="brand">
              <span className="brand__tag">
                <img src={t20Logo} alt="ICC Men's T20 World Cup 2026" className="brand__logo" />
              </span>
              <span className="brand__title">Menu</span>
            </div>
            <button
              className="nav-drawer__close"
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            >
              ×
            </button>
          </div>
          <nav className="nav-drawer__links">
            <Link to="/fixtures">Fixtures</Link>
            <Link to="/rules">Rules</Link>
            <Link to="/team">Create Team</Link>
            <Link to="/points">View Points</Link>
            <Link to="/leaderboard">Leaderboard</Link>
            <Link to="/league">Create League</Link>
            <Link to="/profile">My Profile</Link>
            <Link to="/contact">Contact Us</Link>
          </nav>
          <div className="nav-drawer__auth">
            {user ? (
              <>
                <div className="nav__user">{user.name}</div>
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
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [serverDown, setServerDown] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(true);

  const checkHealth = useCallback(async () => {
    setCheckingHealth(true);
    try {
      await api.get("/health", { timeout: 5000 });
      setServerDown(false);
    } catch (err) {
      setServerDown(true);
    } finally {
      setCheckingHealth(false);
    }
  }, []);

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
    checkHealth();
  }, [checkHealth]);

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

  if (serverDown) {
    return (
      <Downtime
        title="The server is taking a breather"
        message="We cannot reach the scoreboard service right now."
        detail="We will be back shortly. You can retry to see if the service is available again."
        onRetry={checkHealth}
      />
    );
  }

  return (
    <ErrorBoundary
      FallbackComponent={({ onReset }) => (
        <Downtime
          title="The app had a hiccup"
          message="We hit a client-side issue while rendering this page."
          detail="Refresh or try again in a moment."
          onRetry={onReset}
        />
      )}
      onReset={() => window.location.reload()}
    >
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
              path="/points"
              element={user ? <ViewPoints /> : <Navigate to="/auth" />}
            />
            <Route
              path="/points/:id"
              element={user ? <ViewSubmission /> : <Navigate to="/auth" />}
            />
            <Route
              path="/team"
              element={user ? <TeamBuilder context={context} /> : <Navigate to="/auth" />}
            />
            <Route
              path="/profile"
              element={user ? <Profile /> : <Navigate to="/auth" />}
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
              path="/league/:id/points/:userId"
              element={user ? <LeagueMemberPoints /> : <Navigate to="/auth" />}
            />
            <Route path="/contact" element={<Contact />} />
            <Route
              path="/auth"
              element={user ? <Navigate to="/leaderboard" /> : <Auth onAuth={handleAuth} />}
            />
          </Routes>
        </main>
        <footer className="footer">
          <div>
            Built for ICC World Cup 2026 Fantasy.
          </div>
        </footer>
      </div>
      {checkingHealth ? (
        <div className="healthcheck" aria-live="polite">
          Checking server status…
        </div>
      ) : null}
    </ErrorBoundary>
  );
}
