import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";

export default function LeagueCreate() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState(null);
  const [created, setCreated] = useState(null);
  const [joined, setJoined] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setStatus(null);
    setJoined(null);
    try {
      const res = await api.post("/leagues", { name });
      setCreated(res.data);
      setStatus("League created successfully.");
      setName("");
      if (res.data?.id) {
        navigate(`/league/${res.data.id}`);
      }
    } catch (err) {
      setStatus(err.response?.data?.error || "Failed to create league");
    }
  };

  const join = async (e) => {
    e.preventDefault();
    setStatus(null);
    setCreated(null);
    try {
      const res = await api.post("/leagues/join", { code });
      setJoined(res.data);
      setStatus("Joined league successfully.");
      setCode("");
      if (res.data?.id) {
        navigate(`/league/${res.data.id}`);
      }
    } catch (err) {
      setStatus(err.response?.data?.error || "Failed to join league");
    }
  };

  return (
    <section className="page">
      <div className="page__header">
        <h2>Leagues</h2>
        <p>Create a private league or join one with an invite code.</p>
      </div>

      <div className="grid">
        <div className="auth__card">
          <form className="auth__form" onSubmit={submit}>
            <div>
              <label className="label">League Name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Mumbai Legends"
              />
            </div>
            <button className="btn btn--primary" type="submit">
              Create League
            </button>
          </form>

          {created && (
            <div className="card">
              <strong>{created.name}</strong>
              <div className="muted">Invite Code</div>
              <div className="pill">{created.code}</div>
            </div>
          )}
        </div>

        <div className="auth__card">
          <form className="auth__form" onSubmit={join}>
            <div>
              <label className="label">Invite Code</label>
              <input
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g., 6X2QF9"
              />
            </div>
            <button className="btn btn--primary" type="submit">
              Join League
            </button>
          </form>

          {joined && (
            <div className="card">
              <strong>{joined.name}</strong>
              <div className="muted">League Code</div>
              <div className="pill">{joined.code}</div>
            </div>
          )}
        </div>
      </div>

      {status && <div className="notice">{status}</div>}
    </section>
  );
}
