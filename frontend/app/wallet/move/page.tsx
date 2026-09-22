"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";

// ssr:false and lazy, so the Privy SDK is fetched only when this page is
// opened and never ships with the consumer pages (ADR-028, ADR-031).
const MoveCardsWorkspace = dynamic(() => import("@/components/wallet/MoveCardsWorkspace"), {
  ssr: false,
  loading: () => <p className="text-sm text-white/40">Loading…</p>,
});

export default function MoveCardsPage() {
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
          MOVE <span style={{ color: "var(--electric-blue)" }}>CARDS</span>
        </>
      }
      description="Pick the cards you want to hold yourself. They leave Gachard's custody and land in your wallet, and you can bring them back whenever you like."
      testId="move-cards-page"
      actions={
        <Link href="/wallet" className="btn-ghost !py-2 !px-4 !text-xs">
          Back to wallet
        </Link>
      }
    >
      <MoveCardsWorkspace />
    </PageShell>
  );
}
