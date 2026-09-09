"use client";

export default function SupportSuccess({
  count,
  isDuplicate,
  onDone,
}: {
  count: number;
  isDuplicate: boolean;
  onDone: () => void;
}) {
  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.2rem",
          fontWeight: 700,
          color: "#fff",
          marginBottom: "8px",
        }}
      >
        {isDuplicate ? "You're already on the list! 💜" : "You're in! 💜"}
      </h3>
      <p
        style={{
          fontSize: "0.85rem",
          color: "var(--silver-mist-dim)",
          marginBottom: "16px",
          lineHeight: 1.5,
        }}
      >
        {isDuplicate
          ? "You've already joined the Gachard early community."
          : "Thanks for supporting Gachard. We'll keep you posted."}
      </p>
      {count > 0 && (
        <p
          style={{
            fontSize: "0.82rem",
            color: "var(--cosmic-violet)",
            marginBottom: "24px",
          }}
        >
          You are now part of {count.toLocaleString("en-US")} early collectors.
        </p>
      )}
      <button
        onClick={onDone}
        style={{
          padding: "12px 32px",
          borderRadius: "999px",
          border: "1px solid rgba(184, 172, 255, 0.3)",
          background: "rgba(184, 172, 255, 0.1)",
          color: "var(--cosmic-violet)",
          fontSize: "0.85rem",
          fontWeight: 600,
          fontFamily: "var(--font-body)",
          cursor: "pointer",
          transition: "all 200ms ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(184, 172, 255, 0.2)";
          e.currentTarget.style.borderColor = "rgba(184, 172, 255, 0.5)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(184, 172, 255, 0.1)";
          e.currentTarget.style.borderColor = "rgba(184, 172, 255, 0.3)";
        }}
      >
        Done
      </button>
    </div>
  );
}
