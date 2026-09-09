interface Feature {
  key: string;
  title: string;
  desc: string;
  color: string;
}

const FEATURES: readonly Feature[] = [
  { key: "ownership",  title: "Verified Ownership",  desc: "Your card is permanently recorded and cannot be counterfeited.", color: "#B8ACFF" },
  { key: "play",       title: "Collect & Compete",   desc: "Build the ultimate collection. Battle system coming soon.",      color: "#FF6BBA" },
  { key: "market",     title: "Open Market",         desc: "An open marketplace for free trading between collectors.",       color: "#00CCFF" },
  { key: "community",  title: "Built for Community", desc: "Together we grow the Gachard universe.",                        color: "#FFC466" },
] as const;

function Icon({ index, color }: { index: number; color: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style={{ color }}>
      <defs>
        <linearGradient id={`g-icon-${index}`} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>
      <g stroke={`url(#g-icon-${index})`} strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {index === 0 && (
          <>
            <path d="M12 3l7.5 3.5v5.5c0 4.5-3.2 8.5-7.5 9.5-4.3-1-7.5-5-7.5-9.5V6.5L12 3z" />
            <path d="M9 12l2 2 4-4" />
          </>
        )}
        {index === 1 && (
          <>
            <path d="M14.5 5.5L20 11l-9 9-5.5-5.5L14.5 5.5z" />
            <path d="M5.5 14.5L11 20" />
            <circle cx="17" cy="8.5" r="1.4" />
          </>
        )}
        {index === 2 && (
          <>
            <path d="M4 9h16l-1.4 9.5a2 2 0 0 1-2 1.7H7.4a2 2 0 0 1-2-1.7L4 9z" />
            <path d="M8 9V6a4 4 0 0 1 8 0v3" />
          </>
        )}
        {index === 3 && (
          <>
            <circle cx="9" cy="9" r="3" />
            <circle cx="17" cy="10" r="2.4" />
            <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
            <path d="M15.5 20c0.2-2.2 1.9-4 4.5-4" />
          </>
        )}
      </g>
    </svg>
  );
}

export default function HomeWhyGachard() {
  return (
    <section
      className="relative py-20"
      data-testid="why-section"
      style={{
        background:
          "linear-gradient(180deg, transparent 0%, rgba(15,19,36,0.6) 50%, transparent 100%)",
      }}
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="text-center mb-14">
          <p className="text-[0.72rem] uppercase tracking-[0.22em] mb-3" style={{ color: "var(--cosmic-violet)" }}>
            Why Gachard?
          </p>
          <h2 className="font-display text-3xl sm:text-5xl uppercase text-white max-w-3xl mx-auto">
            Built for players. <span className="text-gradient-aurora">Owned by you.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f, i) => (
            <div key={f.key} className="glass glass-hover p-7" data-testid={`why-card-${i}`}>
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 relative"
                style={{
                  background: "linear-gradient(135deg, rgba(184,172,255,0.15), rgba(255,107,186,0.08))",
                  border: `1px solid ${f.color}55`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 24px -6px ${f.color}40`,
                }}
              >
                <Icon index={i} color={f.color} />
              </div>
              <h3 className="font-display uppercase text-white text-[0.95rem] tracking-wider mb-2">{f.title}</h3>
              <p className="text-sm text-white/60 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
