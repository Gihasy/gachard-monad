import Image from "next/image";
import Link from "next/link";

const HERO_CARDS = [
  { img: "/cards/epic-1.webp", name: "PYRAX", tier: "EPIC", stat: "ATK 620 · DEF 410", rot: -14, x: -180, y: 30, z: 1 },
  { img: "/cards/legendary-1.webp", name: "LUMORA", tier: "MYTHIC", stat: "ATK 860 · DEF 620", rot: 0, x: 0, y: 0, z: 3 },
  { img: "/cards/rare-1.webp", name: "NOXEL", tier: "RARE", stat: "ATK 540 · DEF 360", rot: 14, x: 180, y: 30, z: 1 },
] as const;

const TIER_COLOR: Record<string, string> = {
  MYTHIC: "var(--aurora-gold)",
  EPIC: "var(--cosmic-violet)",
  RARE: "var(--electric-blue)",
};

interface HomeHeroProps {
  isAuthenticated: boolean;
}

export default function HomeHero({
  isAuthenticated,
}: HomeHeroProps) {
  return (
    <section className="relative overflow-hidden" data-testid="hero-section">
      <div className="grid-lines" />
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10 pt-14 pb-20 lg:pt-20 lg:pb-28">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-14 lg:gap-8 items-center">
          {/* Copy column */}
          <div className="relative z-10">
            <h1
              className="font-display uppercase leading-[0.92] text-[clamp(3rem,7vw,6.25rem)] mb-6"
              style={{ letterSpacing: "-0.045em" }}
              data-testid="hero-headline"
            >
              <span className="block reveal reveal-1" style={{ color: "var(--cosmic-violet)" }}>Collect.</span>
              <span className="block reveal reveal-2" style={{ color: "var(--electric-blue)" }}>Play.</span>
              <span className="block reveal reveal-3" style={{ color: "var(--aurora-gold)" }}>Trade.</span>
            </h1>

            <p className="reveal reveal-4 text-lg sm:text-xl text-white/85 mb-3 font-medium" data-testid="hero-tagline">
              One Card. Two Worlds. Always Yours.
            </p>
            <p className="reveal reveal-4 text-base text-white/60 max-w-[520px] mb-9 leading-relaxed">
              Every Gachard card starts digital-native — collect it, play it, and bring it into the real world anytime, with authenticity you can always verify.
            </p>

            <div className="reveal reveal-5 flex flex-wrap items-center gap-4 mb-12" data-testid="hero-cta-row">
              <Link
                href="/collect"
                className="btn-primary"
                data-testid="hero-collect-cards-btn"
              >
                Collect Now
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Visual */}
          <div className="relative h-[300px] sm:h-[520px] lg:h-[560px]" data-testid="hero-visual">
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] sm:w-[420px] sm:h-[420px] rounded-full pulse-glow"
              aria-hidden
              style={{
                background:
                  "radial-gradient(circle, rgba(184,172,255,0.35) 0%, rgba(255,107,186,0.18) 40%, transparent 70%)",
                filter: "blur(20px)",
              }}
            />
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[260px] h-[260px] sm:w-[380px] sm:h-[380px] rounded-full"
              aria-hidden
              style={{
                border: "1px dashed rgba(184,172,255,0.25)",
                animation: "spin 40s linear infinite",
              }}
            />
            <style>{`@keyframes spin { to { transform: translate(-50%, -50%) rotate(360deg); } }`}</style>

            <div className="absolute inset-0 origin-center scale-[0.58] min-[480px]:scale-75 sm:scale-100">
              {HERO_CARDS.map((c, i) => (
                <div
                  key={c.name}
                  className="absolute left-1/2 top-1/2"
                  style={{
                    transform: `translate(calc(-50% + ${c.x}px), calc(-50% + ${c.y}px))`,
                    zIndex: c.z,
                  }}
                >
                  <div
                    className="floaty"
                    style={{
                      // @ts-expect-error CSS variable
                      "--r": `${c.rot}deg`,
                      animationDelay: i === 0 ? "-1.5s" : i === 2 ? "-3s" : "0s",
                    }}
                  >
                    <div
                      className="relative overflow-hidden rounded-[18px]"
                      style={{
                        width: i === 1 ? 220 : 190,
                        aspectRatio: "5/7",
                        boxShadow:
                          i === 1
                            ? "0 30px 80px -20px rgba(255,107,186,0.55), 0 0 0 1px rgba(255,255,255,0.15)"
                            : "0 20px 55px -18px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)",
                      }}
                      data-testid={`hero-card-${c.name.toLowerCase()}`}
                    >
                      <Image src={c.img} alt={c.name} fill sizes="220px" className="object-contain" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="hr-glow" />
    </section>
  );
}
