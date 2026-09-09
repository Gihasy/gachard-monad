"use client";

import { forwardRef } from "react";

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

const SupportFloatingButton = forwardRef<
  HTMLButtonElement,
  { count: number; countLoaded: boolean; onClick: () => void }
>(function SupportFloatingButton({ count, countLoaded, onClick }, ref) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      aria-label="Support Gachard"
      className="group"
      style={{
        position: "fixed",
        right: "clamp(16px, 2vw, 24px)",
        bottom:
          "max(clamp(80px, 8vh, 110px), env(safe-area-inset-bottom, 0px) + 80px)",
        zIndex: 45,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "6px",
        padding: "14px 22px",
        borderRadius: "999px",
        border: "1px solid rgba(184, 172, 255, 0.25)",
        background:
          "linear-gradient(135deg, rgba(138, 92, 255, 0.2), rgba(255, 107, 186, 0.15), rgba(0, 204, 255, 0.1))",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        boxShadow:
          "0 4px 24px rgba(138, 92, 255, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05) inset",
        cursor: "pointer",
        transition: "all 250ms ease",
        color: "var(--silver-mist)",
        fontFamily: "var(--font-body)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px) scale(1.03)";
        e.currentTarget.style.boxShadow =
          "0 8px 32px rgba(138, 92, 255, 0.35), 0 0 20px rgba(184, 172, 255, 0.15) inset";
        e.currentTarget.style.borderColor = "rgba(184, 172, 255, 0.45)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0) scale(1)";
        e.currentTarget.style.boxShadow =
          "0 4px 24px rgba(138, 92, 255, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.05) inset";
        e.currentTarget.style.borderColor = "rgba(184, 172, 255, 0.25)";
      }}
    >
      <span
        style={{
          fontSize: "0.88rem",
          fontWeight: 600,
          letterSpacing: "-0.01em",
        }}
      >
        💜 Support Gachard
      </span>
      {countLoaded && count > 0 && (
        <span
          style={{
            fontSize: "0.68rem",
            color: "var(--silver-mist-dim)",
            letterSpacing: "0.02em",
          }}
        >
          {formatCount(count)} collectors are already in
        </span>
      )}
    </button>
  );
});

export default SupportFloatingButton;
