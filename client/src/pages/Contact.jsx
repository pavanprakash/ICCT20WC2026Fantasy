import React, { useState } from "react";

const SUPPORT_EMAIL = "support@fantasycrickethub.com.com";

export default function Contact() {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState(null);

  const onSubmit = (e) => {
    e.preventDefault();
    setStatus(null);
    if (!email || !subject || !description) {
      setStatus("Please fill in all fields.");
      return;
    }
    const body = `From: ${email}\n\n${description}`;
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setStatus("Opening your email client to send the message.");
  };

  return (
    <section className="page">
      <div className="page__header">
        <h2>Contact Us</h2>
        <p>Send a message to support and we’ll get back to you.</p>
      </div>

      <div className="auth__card" style={{ maxWidth: 560 }}>
        <form className="auth__form" onSubmit={onSubmit}>
          <div>
            <label className="label">Your email address</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="label">Subject</label>
            <input
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What can we help with?"
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input"
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your issue or question."
            />
          </div>
          {status && <div className="notice">{status}</div>}
          <button className="btn btn--primary" type="submit">Send</button>
        </form>
      </div>
    </section>
  );
}
