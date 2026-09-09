"use client";

import { useEffect, useRef } from "react";

export default function SupportPanel({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    setTimeout(() => {
      const firstInput = panelRef.current?.querySelector("input, textarea");
      if (firstInput instanceof HTMLElement) firstInput.focus();
    }, 100);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Support Gachard"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-end",
        padding:
          "0 clamp(16px, 2vw, 24px) max(clamp(140px, 12vh, 180px), env(safe-area-inset-bottom, 0px) + 140px)",
        background: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(420px, calc(100vw - 32px))",
          maxHeight: "min(520px, calc(100vh - 200px))",
          overflowY: "auto",
          borderRadius: "20px",
          border: "1px solid rgba(184, 172, 255, 0.2)",
          background:
            "linear-gradient(180deg, rgba(15, 19, 36, 0.97), rgba(11, 14, 26, 0.98))",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow:
            "0 16px 64px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) inset",
          padding: "28px",
          animation: "supportPanelIn 250ms ease-out",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            background: "rgba(255, 255, 255, 0.05)",
            color: "var(--silver-mist-dim)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
            transition: "all 200ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
            e.currentTarget.style.color = "var(--silver-mist-dim)";
          }}
        >
          ✕
        </button>
        {children}
      </div>
      <style>{`
        @keyframes supportPanelIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes supportPanelIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        }
        @media (max-width: 640px) {
          div[role="dialog"] {
            align-items: center !important;
            justify-content: center !important;
            padding: 16px !important;
          }
        }
      `}</style>
    </div>
  );
}
