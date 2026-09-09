"use client";

interface SellButtonProps {
  onClick: () => void;
}

export default function SellButton({ onClick }: SellButtonProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      style={{
        display: "block",
        width: "100%",
        boxSizing: "border-box",
        padding: "8px 12px",
        marginTop: "8px",
        background: "linear-gradient(135deg, #FFD68A 0%, #FFC466 100%)",
        color: "#0B0E1A",
        border: "0",
        borderRadius: "999px",
        fontWeight: 700,
        fontSize: "10.4px",
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        textAlign: "center",
        cursor: "pointer",
        boxShadow: "0 8px 26px -8px rgba(255,196,102,0.55)",
        lineHeight: 1.4,
        userSelect: "none",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 14px 34px -10px rgba(255,196,102,0.75)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 8px 26px -8px rgba(255,196,102,0.55)";
      }}
    >
      List for Sale
    </div>
  );
}
