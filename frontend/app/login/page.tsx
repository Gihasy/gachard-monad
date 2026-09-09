"use client";

import { useState, Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (element: HTMLElement, config: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

function safeNext(raw: string | null): string {
  if (!raw) return "/";
  // Only allow relative paths — block protocol-relative URLs and absolute URLs
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

function LoginInner() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [demoEnabled, setDemoEnabled] = useState(false);

  useEffect(() => {
    const flag = document.querySelector('meta[name="demo-login-enabled"]')?.getAttribute("content");
    setDemoEnabled(flag === "true");
  }, []);

  const handleDemoLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/demo", { method: "POST", credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not generate demo account");
      }
      const result = await res.json();
      localStorage.setItem("user", JSON.stringify(result));
      document.cookie = `gachard_uid=${encodeURIComponent(result.user_id)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      window.location.href = next;
    } catch (err) {
      setError((err as Error).message || "Could not generate demo account");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const clientId = document.querySelector('meta[name="google-client-id"]')?.getAttribute("content");

    if (!clientId || clientId === "your-google-client-id") {
      setError("Google OAuth not configured. Please set GOOGLE_CLIENT_ID.");
      return;
    }

    // Load Google Identity Services script
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    script.onload = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: { credential: string }) => {
            setLoading(true);
            setError(null);
            try {
              const res = await fetch("/api/auth/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ token: response.credential }),
              });

              if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Login failed");
              }

              const result = await res.json();
              localStorage.setItem("user", JSON.stringify(result));
              document.cookie = `gachard_uid=${encodeURIComponent(result.user_id)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
              window.location.href = next;
            } catch (err) {
              setError((err as Error).message || "Login failed");
            } finally {
              setLoading(false);
            }
          },
        });

        if (googleButtonRef.current) {
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: "filled_black",
            size: "large",
            width: "100%",
            text: "continue_with",
          });
        }
      }
    };
  }, [next]);

  return (
    <div className="relative flex-1 flex items-center justify-center px-5 py-16 lg:py-24" data-testid="login-page">
      <div className="grid-lines" />

      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 60% 45% at 50% 40%, rgba(184,172,255,0.22), transparent 60%)",
        }}
      />

      <div
        className="relative z-10 w-full max-w-md glass p-8 sm:p-10"
        data-testid="login-card"
        style={{
          boxShadow: "0 30px 80px -20px rgba(138,92,255,0.35), 0 0 0 1px rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex justify-center mb-6">
          <div
            className="relative w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{
              background: "rgba(184,172,255,0.08)",
              border: "1px solid rgba(184,172,255,0.25)",
              boxShadow: "0 0 40px -8px rgba(184,172,255,0.45)",
            }}
          >
            <Logo size={64} priority className="drop-shadow-[0_0_18px_rgba(184,172,255,0.6)]" />
          </div>
        </div>

        <div className="text-center mb-8">
          <p className="text-[0.72rem] uppercase tracking-[0.22em] mb-3" style={{ color: "var(--cosmic-violet)" }}>
            Welcome to Gachard
          </p>
          <h1
            className="font-display uppercase text-3xl sm:text-4xl leading-[0.98] mb-3"
            style={{ letterSpacing: "-0.03em" }}
            data-testid="login-title"
          >
            <span className="text-white">Enter the </span>
            <span className="text-gradient-aurora">universe</span>
          </h1>
          <p className="text-sm text-white/60 leading-relaxed">
            Sign in to start collecting, playing and trading in the Gachard ecosystem.
          </p>
        </div>

        {error && (
          <div
            className="mb-5 p-3.5 rounded-2xl text-sm"
            style={{
              background: "rgba(255,107,186,0.08)",
              border: "1px solid rgba(255,107,186,0.3)",
              color: "var(--aurora-pink)",
            }}
            data-testid="login-error"
          >
            {error}
          </div>
        )}

        {/* Google Sign-In button rendered by Google SDK */}
        <div ref={googleButtonRef} className="flex justify-center mb-4" data-testid="login-google-btn" />

        {/* Fallback if Google SDK fails to load */}
        {loading && (
          <div className="text-center text-sm text-white/60">Signing in…</div>
        )}

        <div className="my-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[0.65rem] uppercase tracking-widest text-white/40">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Demo account — lets anyone try the full app without Google */}
        {demoEnabled ? (
          <button
            onClick={handleDemoLogin}
            disabled={loading}
            className="btn-primary w-full !justify-center disabled:opacity-50"
            data-testid="login-demo-btn"
          >
            {loading ? "Preparing…" : "Demo Account"}
          </button>
        ) : (
          <Link href="/" className="btn-ghost w-full !justify-center" data-testid="login-explore-guest">
            Explore as guest
          </Link>
        )}

        {demoEnabled && (
          <p className="mt-3 text-center text-[0.68rem] text-white/45">
            Creates a demo account instantly — try packs, cards, and the full experience.
          </p>
        )}

        <p className="mt-6 text-center text-[0.7rem] text-white/45 leading-relaxed">
          By continuing you agree to Gachard&apos;s Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center py-24">
          <div className="glass p-8 text-white/60">Loading…</div>
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
