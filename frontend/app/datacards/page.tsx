"use client";

import PageShell from "@/components/PageShell";

export default function DatacardsPage() {
  return (
    <PageShell
      testId="datacards-page"
      eyebrow="Datacards"
      title={
        <>
          <span className="text-gradient-aurora">Datacards</span>
        </>
      }
      description="Browse all available card templates and stats."
    >
      <div className="glass p-8 text-center">
        <p className="text-white/60">Coming soon.</p>
      </div>
    </PageShell>
  );
}
