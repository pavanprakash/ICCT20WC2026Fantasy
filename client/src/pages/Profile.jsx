import React, { useEffect, useMemo, useState } from "react";
import api from "../api.js";

const getUser = () => {
  const raw = localStorage.getItem("fantasy_auth");
  if (!raw) return null;
  try {
    return JSON.parse(raw).user || null;
  } catch {
    return null;
  }
};

export default function Profile() {
  const user = useMemo(() => getUser(), []);
  const [myLeagues, setMyLeagues] = useState([]);
  const [leaguesLoading, setLeaguesLoading] = useState(true);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState(null);
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadLeagues = async () => {
      try {
        const res = await api.get("/leagues/mine");
        if (!mounted) return;
        const all = Array.isArray(res.data) ? res.data : [];
        const owned = all.filter((l) => String(l.owner) === String(user?.id));
        setMyLeagues(owned);
      } catch {
        if (!mounted) return;
        setMyLeagues([]);
      } finally {
        if (mounted) setLeaguesLoading(false);
      }
    };
    loadLeagues();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const validate = () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      return "All fields are required.";
    }
    if (newPassword !== confirmPassword) {
      return "New password and retype password must match.";
    }
    if (newPassword === oldPassword) {
      return "New password must be different from old password.";
    }
    return null;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);
    setIsError(false);

    const error = validate();
    if (error) {
      setStatus(error);
      setIsError(true);
      return;
    }

    try {
      setSaving(true);
      await api.post("/auth/change-password", {
        oldPassword,
        newPassword
      });
      setStatus("Password updated successfully.");
      setIsError(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setIsError(true);
      setStatus(err?.response?.data?.error || "Failed to update password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page">
      <div className="page__header">
        <h2>My Profile</h2>
        <p>Manage your account details and update your password.</p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div className="auth__card">
          <div className="auth__header">
            <h3>Account</h3>
            <p>Your profile details.</p>
          </div>
          <div className="auth__form">
            <div>
              <label className="label">Name</label>
              <div className="input" style={{ display: "flex", alignItems: "center" }}>
                {user?.name || "—"}
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <div className="input" style={{ display: "flex", alignItems: "center" }}>
                {user?.email || "—"}
              </div>
            </div>
          </div>
        </div>

        <div className="auth__card">
          <div className="auth__header">
            <h3>Change Password</h3>
            <p>Use a strong password you haven’t used before.</p>
          </div>
          <form className="auth__form" onSubmit={onSubmit}>
            <div>
              <label className="label">Old Password</label>
              <input
                className="input"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label">New Password</label>
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Retype Password</label>
              <input
                className="input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {status && (
              <div className={isError ? "notice" : "notice notice--success"}>
                {status}
              </div>
            )}
            <button className="btn btn--primary" type="submit" disabled={saving}>
              {saving ? "Updating..." : "Update Password"}
            </button>
          </form>
        </div>

        <div className="auth__card">
          <div className="auth__header">
            <h3>My Leagues</h3>
            <p>Leagues you created.</p>
          </div>
          <div className="auth__form">
            {leaguesLoading ? (
              <div className="muted">Loading leagues...</div>
            ) : myLeagues.length === 0 ? (
              <div className="muted">No leagues created yet.</div>
            ) : (
              myLeagues.map((league) => (
                <div key={league._id} className="panel-block">
                  <div>
                    <label className="label">Name</label>
                    <div className="input" style={{ display: "flex", alignItems: "center" }}>
                      {league.name}
                    </div>
                  </div>
                  <div>
                    <label className="label">League Code</label>
                    <div className="input" style={{ display: "flex", alignItems: "center" }}>
                      {league.code}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
