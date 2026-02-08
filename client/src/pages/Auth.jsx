import React, { useState } from "react";
import api from "../api.js";

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const payload =
        mode === "login"
          ? { email: form.email, password: form.password }
          : form;
      const res = await api.post(endpoint, payload);
      onAuth(res.data);
    } catch (err) {
      setError(err.response?.data?.error || "Authentication failed");
    }
  };

  return (
    <section className="page auth">
      <div className="auth__card">
        <div className="auth__header">
          <h2>{mode === "login" ? "Welcome back" : "Create account"}</h2>
          <p>{mode === "login" ? "Login to build your team" : "Join the fantasy league"}</p>
        </div>
        <form onSubmit={submit} className="auth__form">
          {mode === "register" && (
            <div>
              <label className="label">Name</label>
              <input className="input" name="name" value={form.name} onChange={handleChange} />
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input className="input" name="email" value={form.email} onChange={handleChange} />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" name="password" value={form.password} onChange={handleChange} />
          </div>
          {error && <div className="notice">{error}</div>}
          <button className="btn btn--primary" type="submit">
            {mode === "login" ? "Login" : "Create account"}
          </button>
        </form>
        <button
          className="btn btn--ghost"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Need an account? Register" : "Already have an account? Login"}
        </button>
      </div>
    </section>
  );
}
