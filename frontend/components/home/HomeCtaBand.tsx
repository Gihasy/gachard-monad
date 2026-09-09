import Link from "next/link";

export default function HomeCtaBand() {
  return (
    <section className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10 py-16">
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-10 lg:p-14"
        style={{
          background:
            "linear-gradient(135deg, rgba(138,92,255,0.18), rgba(255,107,186,0.12) 45%, rgba(0,204,255,0.15))",
          border: "1px solid rgba(184,172,255,0.28)",
        }}
        data-testid="cta-band"
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 20% 30%, rgba(184,172,255,0.25), transparent 60%), radial-gradient(ellipse at 80% 70%, rgba(255,196,102,0.18), transparent 60%)",
          }}
        />
        <div className="relative z-10 grid gap-8 lg:grid-cols-[1.4fr_1fr] items-center">
          <div>
            <h3 className="font-display uppercase text-3xl sm:text-4xl text-white mb-3 leading-tight">
              Your first pack is <span className="text-gradient-gold">waiting for you.</span>
            </h3>
            <p className="text-white/70 max-w-xl">
              Sign up in seconds. Open your first pack and start building your collection.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 justify-start lg:justify-end">
            <Link
              href="/collect"
              className="btn-gold"
              data-testid="cta-collect-cards-btn"
            >
              Collect Now
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
