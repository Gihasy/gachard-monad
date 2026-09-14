"use client";

/**
 * Indeterminate progress indicator with label.
 * Used for pending card states and pack reveal "finalizing" phase.
 * Reuses existing pulse-glow animation pattern for consistency.
 */

interface ProgressIndicatorProps {
  label: string;
  className?: string;
}

export default function ProgressIndicator({ label, className = "" }: ProgressIndicatorProps) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`} data-testid="progress-indicator">
      {/* Indeterminate progress bar */}
      <div
        className="w-full max-w-[120px] h-1 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.08)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            background: "linear-gradient(90deg, transparent, var(--cosmic-violet), var(--electric-blue), transparent)",
            animation: "indeterminateSlide 1.8s ease-in-out infinite",
            width: "40%",
          }}
        />
      </div>

      {/* Label */}
      <span
        className="text-[0.6rem] uppercase tracking-widest pulse-glow"
        style={{ color: "var(--cosmic-violet)" }}
      >
        {label}
      </span>

      {/* Keyframes injected once */}
      <style jsx global>{`
        @keyframes indeterminateSlide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}
