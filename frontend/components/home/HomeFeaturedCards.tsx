import Image from "next/image";
import Link from "next/link";

const FEATURED_CARDS = [
  { id: "lumora-001", name: "Lumora", tier: "MYTHIC", img: "/cards/legendary-1.webp", color: "var(--aurora-gold)" },
  { id: "pyrax-002",  name: "Pyrax",  tier: "EPIC",   img: "/cards/epic-1.webp",      color: "var(--cosmic-violet)" },
  { id: "noxel-003",  name: "Noxel",  tier: "RARE",   img: "/cards/rare-1.webp",      color: "var(--electric-blue)" },
  { id: "auren-004",  name: "Auren",  tier: "LEGENDARY", img: "/cards/legendary-2.webp", color: "var(--aurora-gold)" },
] as const;

export default function HomeFeaturedCards() {
  return (
    <section className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10 py-20" data-testid="featured-section">
      <div className="flex items-end justify-between mb-10">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.22em] mb-3" style={{ color: "var(--cosmic-violet)" }}>
            Featured Cards
          </p>
          <h2 className="font-display text-3xl sm:text-4xl uppercase text-white">The Legends Await</h2>
        </div>
        <Link
          href="/collection"
          className="hidden sm:inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/70 hover:text-white transition-colors"
          data-testid="featured-view-all"
        >
          View All
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {FEATURED_CARDS.map((c) => (
          <div
            key={c.id}
            className="group relative rounded-2xl overflow-hidden transition-shadow duration-500 hover:shadow-[0_0_30px_-5px_var(--glow)]"
            style={{ "--glow": c.color } as React.CSSProperties}
            data-testid={`featured-card-${c.name.toLowerCase()}`}
          >
            <div className="relative w-full" style={{ aspectRatio: "5/7", background: "rgba(255,255,255,0.02)" }}>
              <Image
                src={c.img}
                alt={c.name}
                fill
                sizes="(max-width: 1024px) 45vw, 25vw"
                className="object-contain"
              />
            </div>
            {/* Glow border on hover */}
            <div
              className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
              style={{ border: `1.5px solid ${c.color}`, boxShadow: `inset 0 0 20px rgba(255,255,255,0.05)` }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
