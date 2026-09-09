"use client";

import { useState } from "react";

export default function SupportForm({
  count,
  onSubmit,
  isLoading,
  error,
}: {
  count: number;
  onSubmit: (email: string, message: string, honeypot: string) => void;
  isLoading: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailError(null);
    onSubmit(trimmed, message, honeypot);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "12px",
    border: "1px solid rgba(230, 232, 240, 0.12)",
    background: "rgba(255, 255, 255, 0.04)",
    color: "#fff",
    fontSize: "0.88rem",
    fontFamily: "var(--font-body)",
    outline: "none",
    transition: "border-color 200ms ease",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "0.72rem",
    textTransform: "uppercase",
    letterSpacing: "0.15em",
    color: "var(--silver-mist-dim)",
    marginBottom: "6px",
    display: "block",
  };

  return (
    <form onSubmit={handleSubmit}>
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.2rem",
          fontWeight: 700,
          color: "#fff",
          marginBottom: "8px",
        }}
      >
        Love this project? 💜
      </h3>
      <p
        style={{
          fontSize: "0.82rem",
          color: "var(--silver-mist-dim)",
          marginBottom: "6px",
          lineHeight: 1.5,
        }}
      >
        Help us prove there&apos;s a community waiting for Gachard.
      </p>
      {count > 0 && (
        <p
          style={{
            fontSize: "0.78rem",
            color: "var(--cosmic-violet)",
            marginBottom: "16px",
          }}
        >
          Join {count.toLocaleString("en-US")}+ early collectors who want to see
          Gachard built.
        </p>
      )}
      <p
        style={{
          fontSize: "0.78rem",
          color: "var(--silver-mist-dim)",
          marginBottom: "20px",
          lineHeight: 1.5,
        }}
      >
        Leave your email and tell us what you think. Your feedback helps us
        validate demand and prioritize what we build next.
      </p>

      {/* Honeypot — hidden from users, visible to bots */}
      <div
        style={{
          position: "absolute",
          left: "-9999px",
          opacity: 0,
          height: 0,
          overflow: "hidden",
        }}
        aria-hidden="true"
      >
        <label htmlFor="support-website">Website</label>
        <input
          id="support-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {/* Email field */}
      <div style={{ marginBottom: "16px" }}>
        <label htmlFor="support-email" style={labelStyle}>
          Email
        </label>
        <input
          id="support-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError(null);
          }}
          placeholder="Enter your email"
          required
          style={inputStyle}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(184, 172, 255, 0.4)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "rgba(230, 232, 240, 0.12)";
          }}
        />
        {emailError && (
          <p
            style={{ fontSize: "0.72rem", color: "#ff6bba", marginTop: "6px" }}
            role="alert"
          >
            {emailError}
          </p>
        )}
      </div>

      {/* Message field */}
      <div style={{ marginBottom: "20px" }}>
        <label htmlFor="support-message" style={labelStyle}>
          Your thoughts <span style={{ opacity: 0.5 }}>(Optional)</span>
        </label>
        <textarea
          id="support-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What do you think about Gachard? What would you love to see next?"
          rows={3}
          maxLength={500}
          style={{ ...inputStyle, resize: "vertical", minHeight: "80px" }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(184, 172, 255, 0.4)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "rgba(230, 232, 240, 0.12)";
          }}
        />
        <p
          style={{
            fontSize: "0.68rem",
            color: "var(--silver-mist-dim)",
            textAlign: "right",
            marginTop: "4px",
            opacity: 0.6,
          }}
        >
          {message.length}/500
        </p>
      </div>

      {/* Error */}
      {error && (
        <p
          style={{
            fontSize: "0.78rem",
            color: "#ff6bba",
            marginBottom: "12px",
          }}
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        style={{
          width: "100%",
          padding: "14px 24px",
          borderRadius: "999px",
          border: "none",
          background: isLoading
            ? "rgba(138, 92, 255, 0.3)"
            : "linear-gradient(135deg, #FF6BBA, #8A5CFF 55%, #00CCFF)",
          color: "#fff",
          fontSize: "0.88rem",
          fontWeight: 600,
          fontFamily: "var(--font-body)",
          cursor: isLoading ? "not-allowed" : "pointer",
          transition: "all 250ms ease",
          boxShadow: isLoading
            ? "none"
            : "0 4px 20px rgba(138, 92, 255, 0.3)",
          letterSpacing: "0.02em",
        }}
      >
        {isLoading ? "Joining..." : "I Support Gachard →"}
      </button>

      <p
        style={{
          fontSize: "0.68rem",
          color: "var(--silver-mist-dim)",
          textAlign: "center",
          marginTop: "12px",
          opacity: 0.6,
        }}
      >
        Be part of the early community.
      </p>
    </form>
  );
}
