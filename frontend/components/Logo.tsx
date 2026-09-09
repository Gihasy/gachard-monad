"use client";

import Image from "next/image";

/** Logogram-only icon (no baked-in text). */
const MARK_SRC = "/icons/icon-512.png";

interface LogoProps {
  /** Rendered height of the logogram in px. */
  size?: number;
  /** Extra class on the outer wrapper. */
  className?: string;
  /** Show the "GACHARD" wordmark next to the logogram. */
  showWordmark?: boolean;
  /** Priority hint for Next/Image (above-the-fold). */
  priority?: boolean;
}

export default function Logo({
  size = 40,
  className = "",
  showWordmark = false,
  priority = false,
}: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className="relative shrink-0"
        style={{ width: size, height: size }}
      >
        <Image
          src={MARK_SRC}
          alt="Gachard"
          fill
          className="object-contain"
          sizes={`${size}px`}
          priority={priority}
        />
      </span>
      {showWordmark && (
        <span
          className="text-white uppercase"
          style={{
            fontFamily: "var(--font-poppins), Poppins, sans-serif",
            fontWeight: 600,
            fontSize: size * 0.48,
            letterSpacing: "0.2em",
          }}
        >
          GACHARD
        </span>
      )}
    </span>
  );
}
