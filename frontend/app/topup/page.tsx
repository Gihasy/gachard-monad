"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";

type SessionUser = { user_id: string; username: string };

const PRESETS = [
  { credits: 500, price: "$5", bonus: null, popular: false },
  { credits: 1000, price: "$10", bonus: "+50", popular: true },
  { credits: 2000, price: "$18", bonus: "+150", popular: false },
  { credits: 5000, price: "$40", bonus: "+500", popular: false },
];

export default function TopUp() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [amount, setAmount] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // Mount-only: hydrate session. Setters from useState are stable.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("user");
    if (!stored) {
      window.location.replace("/login");
      return;
    }
    try {
      setUser(JSON.parse(stored));
      setReady(true);
    } catch {
      window.location.replace("/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    fetch("/api/credits", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { balance?: number }) => {
        if (!cancelled) setBalance(d.balance ?? null);
      })
      .catch(() => {
        /* balance is optional — silently ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  const handleTopUp = async () => {
    if (!user) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/credits/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amountCents: amount }),
      });
      const data = await res.json();
      if (res.ok) {
        setBalance(data.newBalance);
        setMessage({ text: `Top-up successful! Balance: ${data.newBalance} Credit`, ok: true });
        window.dispatchEvent(new Event("balance-change"));
      } else {
        setMessage({ text: data.error || "Top-up failed", ok: false });
      }
    } finally {
      setLoading(false);
    }
  };

  if (!ready || !user) return null;

  return (
    <PageShell
      testId="topup-page"
      eyebrow="Credit Wallet"
      title={
        <>
          Top up <span className="text-gradient-gold">credit</span>
        </>
      }
      description="Instant top-ups. Credits are used to buy card packs, request prints, and settle trades."
    >
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] max-w-5xl mx-auto lg:mx-0">
        {/* Left: presets + CTA */}
        <div>
          {/* Balance card */}
          {balance !== null && (
            <div
              className="glass p-6 mb-6 flex items-center justify-between"
              data-testid="topup-balance-card"
            >
              <div>
                <p className="text-[0.7rem] uppercase tracking-[0.22em] text-white/50 mb-1.5">
                  Current Balance
                </p>
                <p
                  className="font-display text-3xl"
                  style={{ color: "var(--aurora-gold)" }}
                >
                  {balance.toLocaleString()}{" "}
                  <span className="text-lg text-white/70">Credit</span>
                </p>
              </div>
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,196,102,0.2), rgba(255,107,186,0.1))",
                  border: "1px solid rgba(255,196,102,0.35)",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="var(--aurora-gold)" strokeWidth="1.6" />
                  <path
                    d="M12 7v10M9 10h4a2 2 0 010 4H9m6 0h-2"
                    stroke="var(--aurora-gold)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          )}

          {/* Presets */}
          <p className="text-[0.72rem] uppercase tracking-[0.22em] mb-3" style={{ color: "var(--cosmic-violet)" }}>
            Choose an amount
          </p>
          <div className="grid grid-cols-2 gap-3 mb-6" data-testid="topup-presets">
            {PRESETS.map((p) => {
              const active = amount === p.credits;
              return (
                <button
                  key={p.credits}
                  onClick={() => setAmount(p.credits)}
                  className="relative text-left p-3 sm:p-5 rounded-2xl transition-all"
                  style={{
                    background: active
                      ? "linear-gradient(135deg, rgba(184,172,255,0.15), rgba(255,107,186,0.08))"
                      : "rgba(255,255,255,0.03)",
                    border: active
                      ? "1px solid rgba(184,172,255,0.55)"
                      : "1px solid rgba(255,255,255,0.08)",
                    boxShadow: active
                      ? "0 10px 30px -12px rgba(184,172,255,0.35)"
                      : "none",
                  }}
                  data-testid={`preset-${p.credits}`}
                >
                  {p.popular && (
                    <span
                      className="absolute -top-2 right-4 text-[0.6rem] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                      style={{
                        background: "var(--aurora-gold)",
                        color: "var(--deep-navy)",
                      }}
                    >
                      Popular
                    </span>
                  )}
                  <div
                    className="font-display text-xl sm:text-2xl mb-1"
                    style={{ color: active ? "#FFFFFF" : "rgba(255,255,255,0.85)" }}
                  >
                    {p.credits.toLocaleString()}
                    {p.bonus && (
                      <span
                        className="ml-2 text-sm font-semibold"
                        style={{ color: "var(--aurora-gold)" }}
                      >
                        {p.bonus}
                      </span>
                    )}
                  </div>
                  <div className="text-xs uppercase tracking-widest text-white/50">
                    {p.price} · Credit pack
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleTopUp}
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50"
            data-testid="topup-submit-btn"
          >
            {loading ? "Processing…" : `Top Up ${amount.toLocaleString()} Credit`}
          </button>

          {message && (
            <div
              className="mt-4 p-4 rounded-2xl text-sm"
              style={{
                background: message.ok ? "rgba(0,204,255,0.08)" : "rgba(255,107,186,0.08)",
                border: message.ok
                  ? "1px solid rgba(0,204,255,0.3)"
                  : "1px solid rgba(255,107,186,0.3)",
                color: message.ok ? "var(--electric-blue)" : "var(--aurora-pink)",
              }}
              data-testid="topup-message"
            >
              {message.text}
            </div>
          )}
        </div>

        {/* Right: info panel */}
        <div className="space-y-4">
          <div className="glass p-6" data-testid="topup-info-card">
            <p className="text-[0.72rem] uppercase tracking-[0.22em] mb-4" style={{ color: "var(--cosmic-violet)" }}>
              What can credits do?
            </p>
            <ul className="space-y-3">
              <InfoItem
                title="Buy Card Packs"
                desc="Open packs to discover rare cards and build your collection."
              />
              <InfoItem
                title="Request a physical print"
                desc="Turn digital cards into premium foil prints delivered to your door."
              />
              <InfoItem
                title="Trade in the Marketplace"
                desc="Buy, sell, and auction your cards."
              />
            </ul>
          </div>

          <div
            className="glass p-6"
            style={{ borderColor: "rgba(255,196,102,0.25)" }}
          >
            <p className="text-[0.72rem] uppercase tracking-[0.22em] mb-2" style={{ color: "var(--aurora-gold)" }}>
              Payment
            </p>
            <p className="text-sm text-white/70 leading-relaxed">
              This is a demo top-up. In production, payments are settled via Stripe. Your credit balance updates instantly.
            </p>
          </div>

          <Link
            href="/collection"
            className="btn-ghost w-full !justify-center"
            data-testid="topup-view-collection"
          >
            View My Collection
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

function InfoItem({ title, desc }: { title: string; desc: string }) {
  return (
    <li className="flex gap-3">
      <span
        className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: "var(--cosmic-violet)" }}
      />
      <div>
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="text-xs text-white/60 leading-relaxed mt-0.5">{desc}</p>
      </div>
    </li>
  );
}
