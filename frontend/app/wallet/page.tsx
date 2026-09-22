"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";

// ssr:false and lazy, so the Privy SDK is fetched only when this page is
// opened and never ships with the consumer pages (ADR-028, ADR-031).
const WalletWorkspace = dynamic(() => import("@/components/wallet/WalletWorkspace"), {
  ssr: false,
  loading: () => <p className="text-sm text-white/40">Loading…</p>,
});

export default function WalletPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem("user")) {
      window.location.replace("/login");
      return;
    }
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <PageShell
      eyebrow="Advanced"
      title={
        <>
          YOUR <span style={{ color: "var(--electric-blue)" }}>WALLET</span>
        </>
      }
      description="Hold your cards yourself. Move them out of Gachard, bring them back, or take them anywhere you like."
      testId="wallet-page"
      actions={
        <Link href="/collection" className="btn-ghost !py-2 !px-4 !text-xs">
          Back to collection
        </Link>
      }
    >
      <div className="max-w-2xl">
        <WalletWorkspace />
      </div>
    </PageShell>
  );
}
