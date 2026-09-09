import Image from "next/image";

export default function HomeCoreLoop() {
  return (
    <section
      className="relative py-6 sm:py-10"
      data-testid="coreloop-section"
    >
      <div
        className="relative mx-auto max-w-7xl px-5 sm:px-8 lg:px-10"
      >
        <div
          className="relative rounded-[20px] py-10 sm:py-14 lg:py-16 px-6 sm:px-10 lg:px-14"
          style={{
            background: "linear-gradient(135deg, #171f35 0%, #111827 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* Warm glow top-left */}
          <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden
            style={{
              background: "radial-gradient(ellipse at 10% 10%, rgba(200,150,50,0.12) 0%, rgba(200,150,50,0.04) 30%, transparent 60%)",
            }}
          />
        {/* Text content */}
        <div className="mb-8 sm:mb-12">
          <p
            className="text-[0.72rem] uppercase tracking-[0.25em] mb-3 font-semibold"
            style={{ color: "#C9A84C" }}
          >
            The Core Loop
          </p>
          <h2 className="font-display text-3xl sm:text-5xl lg:text-[3.5rem] uppercase leading-[0.95] mb-5">
            <span className="text-white">One Card. </span>
            <span
              style={{
                background: "linear-gradient(135deg, #D4A843, #E8C24A)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Two Worlds.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-white/55 max-w-[560px] leading-relaxed">
            Every Gachard card starts digital. Print it into a real, holographic collectible — or redeem your physical card back into your digital collection, anytime.
          </p>
        </div>

        {/* Cards showcase */}
        <div className="flex flex-col items-center">
          <div className="relative flex items-center justify-center gap-4 sm:gap-8 lg:gap-12">
            {/* Digital card */}
            <div className="relative" style={{ transform: "rotate(-6deg)" }}>
              <div
                className="relative overflow-hidden rounded-[16px]"
                style={{
                  width: "clamp(140px, 28vw, 380px)",
                  aspectRatio: "5/7",
                }}
              >
                <Image
                  src="/cards/digital-card.webp"
                  alt="Digital Gachard card"
                  fill
                  sizes="(max-width: 640px) 140px, (max-width: 1024px) 280px, 380px"
                  className="object-cover"
                />
              </div>
            </div>

            {/* Arrow center icon */}
            <div className="flex flex-col items-center shrink-0">
              <span
                className="text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.2em] font-semibold mb-1.5"
                style={{ color: "#B89F5A" }}
              >
                Print
              </span>
              <div
                className="relative flex items-center justify-center rounded-full"
                style={{
                  width: "clamp(56px, 6vw, 80px)",
                  height: "clamp(56px, 6vw, 80px)",
                  border: "1.5px solid rgba(201,168,76,0.5)",
                  background: "rgba(12,15,25,0.6)",
                }}
              >
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 32 32"
                  fill="none"
                  className="hidden sm:block"
                >
                  {/* Right arrow (Print) */}
                  <line x1="6" y1="11" x2="22" y2="11" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" />
                  <polyline points="18,7 23,11 18,15" stroke="#C9A84C" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  {/* Left arrow (Redeem) */}
                  <line x1="10" y1="21" x2="26" y2="21" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" />
                  <polyline points="14,17 9,21 14,25" stroke="#C9A84C" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 32 32"
                  fill="none"
                  className="sm:hidden"
                >
                  <line x1="6" y1="11" x2="22" y2="11" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" />
                  <polyline points="18,7 23,11 18,15" stroke="#C9A84C" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="10" y1="21" x2="26" y2="21" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" />
                  <polyline points="14,17 9,21 14,25" stroke="#C9A84C" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span
                className="text-[0.6rem] sm:text-[0.65rem] uppercase tracking-[0.2em] font-semibold mt-1.5"
                style={{ color: "#B89F5A" }}
              >
                Redeem
              </span>
            </div>

            {/* Physical card */}
            <div className="relative" style={{ transform: "rotate(6deg)" }}>
              <div
                className="relative overflow-hidden rounded-[16px]"
                style={{
                  width: "clamp(140px, 28vw, 380px)",
                  aspectRatio: "5/7",
                }}
              >
                <Image
                  src="/cards/real-card.webp"
                  alt="Physical Gachard card"
                  fill
                  sizes="(max-width: 640px) 140px, (max-width: 1024px) 280px, 380px"
                  className="object-cover"
                />
              </div>
            </div>
          </div>

        </div>
        </div>
      </div>
    </section>
  );
}
