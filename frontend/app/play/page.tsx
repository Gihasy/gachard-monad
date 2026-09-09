"use client";

import Link from "next/link";
import Image from "next/image";
import PageShell from "@/components/PageShell";

export default function PlayTradePage() {
  return (
    <PageShell
      testId="play-trade-page"
      title={
        <>
          <span className="text-gradient-aurora">Play</span>
        </>
      }
      description="Two worlds. One ecosystem. Play for fun or play to win."
    >
      {/* Hero Image */}
      <div
        className="relative w-full max-w-6xl mx-auto mb-10 rounded-2xl overflow-hidden"
        style={{
          border: "1px solid rgba(184,172,255,0.4)",
          boxShadow: "0 0 30px rgba(184,172,255,0.2), 0 0 60px rgba(138,92,255,0.1), inset 0 0 30px rgba(184,172,255,0.05)",
        }}
      >
        <Image
          src="/images/play-hero.png"
          alt="Gachard Game Arena"
          width={1920}
          height={1080}
          priority
          className="w-full h-auto"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1280px"
        />
      </div>

      {/* Coming Soon Banner */}
      <div
        className="relative overflow-hidden rounded-3xl p-8 sm:p-10 mb-16"
        style={{
          background:
            "linear-gradient(135deg, rgba(138,92,255,0.15), rgba(255,107,186,0.10) 50%, rgba(0,204,255,0.12))",
          border: "1px solid rgba(184,172,255,0.28)",
        }}
      >
        <div className="relative z-10 text-center">
          <div className="chip mx-auto mb-5 w-fit">
            <span className="chip-dot" />
            <span>Coming Soon</span>
          </div>
          <h2 className="font-display uppercase text-3xl sm:text-4xl text-white mb-4">
            The arena is{" "}
            <span className="text-gradient-gold">almost ready.</span>
          </h2>
          <p className="text-white/70 max-w-2xl mx-auto leading-relaxed">
            We're building something special — a place where your cards come
            alive through gameplay and your collection becomes a living,
            evolving asset. Stay tuned.
          </p>
        </div>
      </div>

      {/* PLAY Section */}
      <section className="mb-20" data-testid="play-section">
        <div className="flex items-center gap-4 mb-10">
          <SectionIcon />
          <h3 className="font-display uppercase text-2xl sm:text-3xl text-white">
            Play
          </h3>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Free to Play */}
          <div
            className="glass p-8 relative overflow-hidden"
            style={{ borderColor: "rgba(0,204,255,0.2)" }}
          >
            <div
              className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-15"
              style={{ background: "var(--electric-blue)" }}
            />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="text-[0.65rem] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full"
                  style={{
                    background: "rgba(0,204,255,0.15)",
                    color: "var(--electric-blue)",
                    border: "1px solid rgba(0,204,255,0.3)",
                  }}
                >
                  Free to Play
                </span>
              </div>
              <h4 className="font-display uppercase text-xl text-white mb-3">
                Jump in. No strings attached.
              </h4>
              <p className="text-white/70 leading-relaxed mb-5">
                Every player gets access to <strong className="text-white">Play Cards</strong> — 
                a dedicated set of cards designed purely for in-game battles. No purchase 
                required. No setup, no hassle. Just pick up and play with anyone, 
                anywhere in the world.
              </p>
              <ul className="space-y-3">
                <FeatureItem text="Instant access once battles go live — no purchase needed" />
                <FeatureItem text="Play Cards are free and unlimited — no pay-to-win" />
                <FeatureItem text="Battle friends or match with players globally" />
                <FeatureItem text="Casual fun or ranked competitive — your choice" />
              </ul>
            </div>
          </div>

          {/* Competitive / Collect Cards */}
          <div
            className="glass p-8 relative overflow-hidden"
            style={{ borderColor: "rgba(255,196,102,0.2)" }}
          >
            <div
              className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-15"
              style={{ background: "var(--aurora-gold)" }}
            />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="text-[0.65rem] uppercase tracking-widest font-bold px-2.5 py-1 rounded-full"
                  style={{
                    background: "rgba(255,196,102,0.15)",
                    color: "var(--aurora-gold)",
                    border: "1px solid rgba(255,196,102,0.3)",
                  }}
                >
                  Competitive Edge
                </span>
              </div>
              <h4 className="font-display uppercase text-xl text-white mb-3">
                Own it. Evolve it. Dominate.
              </h4>
              <p className="text-white/70 leading-relaxed mb-5">
                Got a <strong className="text-white">Collect Card</strong> from 
                a Card Pack? That's where things get serious. Whether it's a 
                Digital card in your collection or a physical card you've 
                redeemed — you can <strong className="text-white">level up</strong> and{" "}
                <strong className="text-white">evolve</strong> it to unlock 
                devastating new abilities and bring it into competitive play.
              </p>
              <ul className="space-y-3">
                <FeatureItem text="Collect Cards from Card Packs — Digital or Physical" />
                <FeatureItem text="Level up your cards through gameplay and achievements" />
                <FeatureItem text="Evolve cards to unlock exclusive abilities and art" />
                <FeatureItem text="Your evolved cards become your competitive arsenal" />
              </ul>
            </div>
          </div>
        </div>
      </section>


    </PageShell>
  );
}

function SectionIcon() {
  const cfg = {
    grad: "linear-gradient(150deg, var(--electric-blue), var(--cosmic-violet))",
    glow: "rgba(0,204,255,0.55)",
    ring: "rgba(0,204,255,0.5)",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="6 3 20 12 6 21 6 3" fill="rgba(255,255,255,0.15)" />
      </svg>
    ),
  };

  return (
    <div className="relative shrink-0 floaty" aria-hidden>
      <div
        className="absolute -inset-2 rounded-[1.4rem] blur-lg opacity-70"
        style={{ background: cfg.grad }}
      />
      <div
        className="relative w-16 h-16 rounded-2xl p-[1.5px]"
        style={{ background: `linear-gradient(150deg, ${cfg.ring}, rgba(255,255,255,0.15))` }}
      >
        <div
          className="relative w-full h-full rounded-2xl flex items-center justify-center overflow-hidden"
          style={{
            background: cfg.grad,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 14px 34px -10px ${cfg.glow}`,
          }}
        >
          <span
            className="absolute inset-y-0 w-1/2 pointer-events-none"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
              animation: "packSheen 3.2s ease-in-out infinite",
            }}
          />
          <span className="relative z-10 drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)]">{cfg.icon}</span>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-1 w-5 h-5 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: "rgba(0,255,136,0.15)",
          border: "1px solid rgba(0,255,136,0.3)",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00ff88" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span className="text-sm text-white/70 leading-relaxed">{text}</span>
    </li>
  );
}


