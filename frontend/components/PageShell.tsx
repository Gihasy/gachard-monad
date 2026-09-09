"use client";

import { ReactNode } from "react";

interface PageShellProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
  /** Center hero text instead of left-aligned */
  center?: boolean;
  /** Constrain content column (e.g. auth/topup) */
  contentClassName?: string;
}

export default function PageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
  testId,
  center = false,
  contentClassName = "",
}: PageShellProps) {
  return (
    <div data-testid={testId}>
      {/* Section header */}
      <section className="relative overflow-hidden">
        <div className="grid-lines" />
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10 pt-14 pb-10 lg:pt-20 lg:pb-14">
          <div
            className={
              center
                ? "text-center max-w-3xl mx-auto"
                : "flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8"
            }
          >
            <div className={center ? "" : "max-w-3xl"}>
              {eyebrow && (
                <p
                  className="text-[0.72rem] uppercase tracking-[0.22em] mb-3"
                  style={{ color: "var(--cosmic-violet)" }}
                  data-testid="page-eyebrow"
                >
                  {eyebrow}
                </p>
              )}
              <h1
                className="font-display uppercase leading-[0.95] text-[clamp(2.25rem,5vw,3.75rem)] text-white"
                style={{ letterSpacing: "-0.035em" }}
                data-testid="page-title"
              >
                {title}
              </h1>
              {description && (
                <p
                  className="mt-5 text-base sm:text-lg text-white/65 max-w-2xl leading-relaxed"
                  data-testid="page-description"
                >
                  {description}
                </p>
              )}
            </div>
            {actions && (
              <div className="flex flex-wrap items-center gap-3">{actions}</div>
            )}
          </div>
        </div>
        <div className="hr-glow" />
      </section>

      {/* Body */}
      <section
        className={`mx-auto max-w-7xl px-5 sm:px-8 lg:px-10 py-12 lg:py-16 ${contentClassName}`}
      >
        {children}
      </section>
    </div>
  );
}
