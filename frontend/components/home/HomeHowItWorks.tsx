const STEPS = [
  { n: "01", title: "Register", desc: "Create your account and enter the universe." },
  { n: "02", title: "Collect",  desc: "Open packs and collect rare cards." },
  { n: "03", title: "Play",     desc: "Build your deck and battle in arenas." },
  { n: "04", title: "Trade",    desc: "Buy, sell, and auction your cards." },
  { n: "05", title: "Grow",     desc: "Level up your bond and unlock more." },
] as const;

export default function HomeHowItWorks() {
  return (
    <section className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10 py-20" data-testid="how-section">
      <div className="mb-12">
        <p className="text-[0.72rem] uppercase tracking-[0.22em] mb-3" style={{ color: "var(--cosmic-violet)" }}>
          How It Works
        </p>
        <h2 className="font-display text-3xl sm:text-5xl uppercase text-white max-w-2xl">
          From <span className="text-gradient-gold">zero to legend</span> in five steps.
        </h2>
      </div>

      <div className="relative grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {STEPS.map((s, i) => (
          <div key={s.n} className="relative" data-testid={`step-${s.n}`}>
            <div className="glass p-3 sm:p-5 h-full transition-all duration-300 hover:border-white/25" style={{ minHeight: "140px" }}>
              <div
                className="font-display text-2xl sm:text-3xl mb-2 sm:mb-3"
                style={{
                  background: "linear-gradient(135deg, var(--cosmic-violet), var(--aurora-pink), var(--electric-blue))",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {s.n}
              </div>
              <h3 className="font-display uppercase text-white text-xs sm:text-sm tracking-wider mb-1.5 sm:mb-2">{s.title}</h3>
              <p className="text-[0.65rem] sm:text-xs text-white/60 leading-relaxed">{s.desc}</p>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="hidden lg:flex absolute top-1/2 -right-3 z-10 w-6 h-6 items-center justify-center rounded-full"
                style={{
                  background: "rgba(11,14,26,0.9)",
                  border: "1px solid rgba(184,172,255,0.4)",
                  color: "var(--cosmic-violet)",
                  transform: "translateY(-50%)",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
