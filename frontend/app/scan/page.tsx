"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import PageShell from "@/components/PageShell";
import QRScanner from "@/components/QRScanner";
import { friendlyTxType } from "@/lib/status-map";

const RARITY_COLORS = [
  "var(--rarity-common)",
  "var(--rarity-rare)",
  "var(--rarity-epic)",
  "var(--rarity-legendary)",
];
const RARITY_GLOW = ["", "glow-rare", "glow-epic", "glow-legendary"];
const RARITY_LABELS = ["Common", "Rare", "Epic", "Legendary"];

interface ScanTx {
  invoiceId?: string;
  type: string;
  status: string;
  timestamp: string | number;
  from?: string;
  to?: string;
}

interface ScanData {
  cardId?: string | null;
  tokenId: string | number | null;
  onChain: {
    rarityCode: number;
    rarity: string;
    status: string;
    lastOwner?: string;
  };
  metadata: {
    templateName?: string;
    artworkUrl?: string;
  };
  verification: { flag: "verified" | "warning" | string };
  history?: ScanTx[];
  purchasePrice: number | null;
}

function ScanContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const cardId = searchParams.get("cardId");
  const claimId = searchParams.get("claimId");
  const [data, setData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [retryLoading, setRetryLoading] = useState(false);
  const [claimResult, setClaimResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleScan = useCallback(
    (scannedId: string) => {
      setShowScanner(false);
      // If the scanned content is a URL, extract the cardId from it
      try {
        if (scannedId.startsWith("http")) {
          const url = new URL(scannedId);
          const cid = url.searchParams.get("cardId");
          if (cid) {
            router.push(`/scan?cardId=${cid}`);
            return;
          }
        }
      } catch {
        // Not a URL, continue with hex check
      }
      // Check if it's a claim QR (short hex) or card QR (5-char hex)
      if (scannedId.length <= 8 && /^[a-f0-9]+$/i.test(scannedId)) {
        router.push(`/scan?claimId=${scannedId}`);
      } else {
        router.push(`/scan?cardId=${scannedId}`);
      }
    },
    [router]
  );

  // Handle claim shipping
  useEffect(() => {
    if (!claimId) return;
    const user = localStorage.getItem("user");
    if (!user) {
      setClaimResult({ success: false, message: "Please login first to claim your card." });
      return;
    }

    setLoading(true);
    fetch("/api/claim-shipping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ claimId }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setClaimResult({ success: true, message: `Card #${d.cardId || d.tokenId} claimed successfully! Status: Physical` });
        } else {
          setClaimResult({ success: false, message: d.error || "Claim failed" });
        }
      })
      .catch(() => setClaimResult({ success: false, message: "Network error" }))
      .finally(() => setLoading(false));
  }, [claimId]);

  useEffect(() => {
    if (!cardId || claimId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setRetryLoading(false);
    fetch(`/api/scan?cardId=${cardId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) setError(d.error);
        else setData(d as ScanData);
      })
      .catch(() => {
        if (!cancelled) setError("Network error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cardId, claimId]);

  // Claim result state
  if (claimId && claimResult) {
    return (
      <PageShell
        testId="claim-result-page"
        eyebrow="Claim Shipping"
        title={
          <>
            Claim <span className="text-gradient-aurora">Result</span>
          </>
        }
      >
        <div
          className="glass p-10 text-center max-w-xl mx-auto"
          style={{ borderColor: claimResult.success ? "rgba(0,255,136,0.35)" : "rgba(255,107,186,0.35)" }}
        >
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{
              background: claimResult.success ? "rgba(0,255,136,0.15)" : "rgba(255,107,186,0.15)",
            }}
          >
            {claimResult.success ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00ff88" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l4 4 10-10" />
              </svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff6bba" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            )}
          </div>
          <p
            className="text-lg font-display uppercase mb-2"
            style={{ color: claimResult.success ? "#00ff88" : "#ff6bba" }}
          >
            {claimResult.success ? "Claimed!" : "Claim Failed"}
          </p>
          <p className="text-white/70">{claimResult.message}</p>
          {claimResult.success && (
            <Link href="/profile" className="btn-primary mt-6 inline-block">
              View Collection
            </Link>
          )}
          {!claimResult.success && (
            <Link href="/scan" className="btn-ghost mt-6 inline-block">
              Back to Scan
            </Link>
          )}
        </div>
      </PageShell>
    );
  }

  // Loading state for claim
  if (claimId && loading) {
    return (
      <PageShell
        testId="claim-loading-page"
        eyebrow="Claim Shipping"
        title={
          <>
            Claiming <span className="text-gradient-aurora">Card…</span>
          </>
        }
      >
        <div className="glass p-8 sm:p-10 lg:p-14 text-center max-w-xl mx-auto">
          <div
            className="w-10 h-10 mx-auto rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--cosmic-violet)", borderTopColor: "transparent" }}
          />
          <p className="mt-5 text-white/70 uppercase tracking-widest text-xs">
            Verifying claim…
          </p>
        </div>
      </PageShell>
    );
  }

  // Landing state — no card or claim
  if (!cardId && !claimId) {
    return (
      <>
        {showScanner && (
          <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
        )}
        <PageShell
          testId="scan-page"
          title={
            <>
              <span className="text-gradient-aurora">Scan a Card</span>
            </>
          }
          description="Every Gachard card carries a unique verified signature. Scan its QR code with your camera or enter the Card ID below to verify ownership, rarity, and history."
        >
          <div className="grid gap-8 md:gap-10 md:grid-cols-[1.1fr_1fr] items-start">
            <ScanInstructions onOpenCamera={() => setShowScanner(true)} />
            <ManualInput />
          </div>
        </PageShell>
      </>
    );
  }

  return (
    <PageShell
      testId="scan-result-page"
      eyebrow={`Card ID: #${cardId}`}
      title={
        <>
          Scan <span className="text-gradient-aurora">Result</span>
        </>
      }
    >
      {loading && (
        <div
          className="glass p-8 sm:p-10 lg:p-14 text-center"
          data-testid="scan-loading"
        >
          <div
            className="w-10 h-10 mx-auto rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "var(--cosmic-violet)", borderTopColor: "transparent" }}
          />
          <p className="mt-5 text-white/70 uppercase tracking-widest text-xs">
            Scanning…
          </p>
        </div>
      )}

      {error && !loading && (
        <>
          {showScanner && (
            <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
          )}
          <div
            className="glass p-6 sm:p-10 text-center max-w-xl mx-auto"
            data-testid="scan-error"
            style={{ borderColor: "rgba(255,107,186,0.35)" }}
          >
            <p style={{ color: "var(--aurora-pink)" }} className="uppercase tracking-widest text-sm mb-2">
              Error
            </p>
            <p className="text-white/70 mb-2">{error}</p>
            <p className="text-xs text-white/40 mb-6">Card ID: #{cardId}</p>
            <div className="flex gap-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = (e.currentTarget.elements.namedItem("retryCardId") as HTMLInputElement).value.trim();
                  if (input) {
                    setRetryLoading(true);
                    router.push(`/scan?cardId=${input}`);
                  }
                }}
                className="flex-1 flex items-center min-w-0"
              >
                <div
                  className="flex-1 flex items-center bg-white/[0.04] border border-white/[0.1] rounded-2xl px-3 sm:px-4 py-2.5 min-w-0"
                >
                  <span className="text-sm text-white/40 mr-1 font-mono">#</span>
                  <input
                    type="text"
                    name="retryCardId"
                    placeholder="Enter Card ID…"
                    className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none min-w-0"
                    data-testid="scan-retry-input"
                  />
                </div>
              </form>
              <button
                onClick={() => setShowScanner(true)}
                className="btn-primary !p-2.5 shrink-0"
                data-testid="scan-retry-camera"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </button>
              <button
                onClick={() => {
                  const form = document.querySelector('[data-testid="scan-error"] form') as HTMLFormElement;
                  if (form) form.requestSubmit();
                }}
                disabled={retryLoading}
                className="btn-primary disabled:opacity-50 shrink-0"
                data-testid="scan-retry-submit"
              >
                {retryLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Scanning…
                  </span>
                ) : (
                  "Scan"
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {data && !loading && (
        <>
          {showScanner && (
            <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
          )}
          {/* Scan Another Card — top bar */}
          <div className="mb-6 flex gap-2" data-testid="scan-again-bar">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const input = (e.currentTarget.elements.namedItem("topCardId") as HTMLInputElement).value.trim();
                if (input) router.push(`/scan?cardId=${input}`);
              }}
              className="flex-1 flex items-center min-w-0"
            >
              <div
                className="flex-1 flex items-center bg-white/[0.04] border border-white/[0.1] rounded-2xl px-3 sm:px-4 py-2.5 min-w-0"
              >
                <span className="text-sm text-white/40 mr-1 font-mono">#</span>
                <input
                  type="text"
                  name="topCardId"
                  placeholder="Enter Card ID…"
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none min-w-0"
                  data-testid="scan-top-input"
                />
              </div>
            </form>
            <button
              onClick={() => setShowScanner(true)}
              className="btn-primary !p-2.5 shrink-0"
              data-testid="scan-top-camera"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
            <button
              onClick={() => {
                const form = document.querySelector('[data-testid="scan-again-bar"] form') as HTMLFormElement;
                if (form) form.requestSubmit();
              }}
              className="btn-primary shrink-0"
              data-testid="scan-top-submit"
            >
              Scan
            </button>
          </div>

          <div className="grid gap-6 md:gap-8 md:grid-cols-[1fr_1.2fr]" data-testid="scan-result">
            {/* Card artwork */}
            <div
              className={`glass overflow-hidden ${RARITY_GLOW[data.onChain.rarityCode]}`}
              style={{ borderColor: RARITY_COLORS[data.onChain.rarityCode] }}
            >
              <div className="relative w-full bg-white/5" style={{ aspectRatio: "5/7" }}>
                {data.metadata.artworkUrl ? (
                  <Image
                    src={data.metadata.artworkUrl}
                    alt={data.metadata.templateName || "Card"}
                    fill
                    sizes="(max-width:1024px) 100vw, 40vw"
                    className="object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-5xl text-white/30">◆</span>
                  </div>
                )}
              </div>
            </div>

            {/* Meta */}
            <div className="space-y-4">
              {/* Verification */}
              <div
                className="flex items-start sm:items-center gap-3 p-4 rounded-2xl"
                style={{
                  background:
                    data.verification.flag === "verified"
                      ? "rgba(0,204,255,0.08)"
                      : "rgba(255,196,102,0.08)",
                  border:
                    data.verification.flag === "verified"
                      ? "1px solid rgba(0,204,255,0.35)"
                      : "1px solid rgba(255,196,102,0.35)",
                }}
                data-testid="scan-verification"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background:
                      data.verification.flag === "verified"
                        ? "rgba(0,204,255,0.18)"
                        : "rgba(255,196,102,0.18)",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    {data.verification.flag === "verified" ? (
                      <path
                        d="M5 12l4 4 10-10"
                        stroke="var(--electric-blue)"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : (
                      <path
                        d="M12 3l10 18H2L12 3zm0 6v5m0 3v.5"
                        stroke="var(--aurora-gold)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </svg>
                </div>
                <div className="min-w-0">
                  <p
                    className="text-sm font-semibold uppercase tracking-wide"
                    style={{
                      color:
                        data.verification.flag === "verified"
                          ? "var(--electric-blue)"
                          : "var(--aurora-gold)",
                    }}
                  >
                    {data.verification.flag === "verified"
                      ? "Verified authentic"
                      : "Warning — data mismatch"}
                  </p>
                  <p className="text-xs text-white/60 mt-0.5">
                    Signature validated against verified record.
                  </p>
                </div>
              </div>

              {/* Metadata */}
              <div className="glass p-5">
                <MetaRow label="Card ID" value={`#${data.cardId || data.tokenId}`} mono />
                <MetaRow
                  label="Name"
                  value={data.metadata.templateName || "Unknown"}
                />
                <MetaRow
                  label="Rarity"
                  value={
                    <span className={`tag tag-${RARITY_LABELS[data.onChain.rarityCode].toLowerCase()}`}>
                      {data.onChain.rarity}
                    </span>
                  }
                />
                <MetaRow
                  label="Status"
                  value={
                    <span
                      className="text-[0.65rem] uppercase tracking-widest px-2 py-0.5 rounded"
                      style={{
                        background:
                          data.onChain.status === "Print Requested"
                            ? "rgba(255,107,186,0.15)"
                            : "rgba(0,204,255,0.15)",
                        color:
                          data.onChain.status === "Print Requested"
                            ? "var(--aurora-pink)"
                            : "var(--electric-blue)",
                        border: `1px solid ${
                          data.onChain.status === "Print Requested"
                            ? "rgba(255,107,186,0.35)"
                            : "rgba(0,204,255,0.35)"
                        }`,
                      }}
                    >
                      {data.onChain.status}
                    </span>
                  }
                />
                <MetaRow
                  label="Last Owner"
                  value={
                    <span className="text-sm text-white/70">
                      {data.onChain.lastOwner || "—"}
                    </span>
                  }
                />
                {data.purchasePrice !== null && (
                  <MetaRow
                    label="Purchase Price"
                    value={
                      <span
                        className="font-semibold"
                        style={{ color: "var(--aurora-gold)" }}
                      >
                        {data.purchasePrice} Credit
                      </span>
                    }
                    last
                  />
                )}
              </div>

              {/* History */}
              {data.history && data.history.length > 0 && (
                <div className="glass p-5" data-testid="scan-history">
                  <p className="text-[0.72rem] uppercase tracking-[0.22em] mb-4" style={{ color: "var(--cosmic-violet)" }}>
                    Transaction History
                  </p>
                  <div className="space-y-2 max-h-[calc(3*5.5rem)] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}>
                    {data.history.map((tx, i) => (
                      <div
                        key={`${tx.type}-${tx.timestamp}-${i}`}
                        className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            {tx.invoiceId && (
                              <span className="text-[0.6rem] font-mono text-white/40 shrink-0">
                                {tx.invoiceId}
                              </span>
                            )}
                            <span className="text-sm font-medium capitalize text-white shrink-0">
                              {friendlyTxType(tx.type)}
                            </span>
                            <span
                              className="text-[0.6rem] uppercase tracking-widest px-2 py-0.5 rounded shrink-0"
                              style={{
                                background:
                                  tx.status === "Success"
                                    ? "rgba(0,204,255,0.15)"
                                    : "rgba(255,196,102,0.15)",
                                color:
                                  tx.status === "Success"
                                    ? "var(--electric-blue)"
                                    : "var(--aurora-gold)",
                              }}
                            >
                              {tx.status}
                            </span>
                          </div>
                          <span className="text-xs text-white/50 shrink-0 ml-3">
                            {new Date(tx.timestamp).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} WIB
                          </span>
                        </div>
                        {tx.from && tx.to && (
                          <p className="text-[0.65rem] text-white/40 mt-1.5">
                            {tx.from} → {tx.to}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}

function MetaRow({
  label,
  value,
  mono = false,
  last = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-center py-3 ${
        !last ? "border-b border-white/[0.06]" : ""
      }`}
    >
      <span className="text-xs uppercase tracking-widest text-white/50">
        {label}
      </span>
      <span
        className={`text-sm text-white ${mono ? "font-mono font-bold" : "font-medium"}`}
      >
        {value}
      </span>
    </div>
  );
}

function ScanInstructions({ onOpenCamera }: { onOpenCamera: () => void }) {
  const steps = [
    {
      t: "Locate the QR",
      d: "Every Gachard card has a QR code on the bottom-right corner.",
    },
    {
      t: "Scan with your camera",
      d: "Tap the button below to open your device camera and scan instantly.",
    },
    {
      t: "Get instant proof",
      d: "You'll see ownership, rarity, and full transaction history.",
    },
  ];
  return (
    <div className="glass p-8" data-testid="scan-instructions">
      <p className="text-[0.72rem] uppercase tracking-[0.22em] mb-4" style={{ color: "var(--cosmic-violet)" }}>
        How to scan
      </p>
      <div className="space-y-5 mb-6">
        {steps.map((s, i) => (
          <div key={s.t} className="flex gap-4">
            <span
              className="font-display text-2xl leading-none shrink-0 w-9"
              style={{ color: "var(--cosmic-violet)" }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="font-medium text-white text-sm mb-0.5">{s.t}</p>
              <p className="text-xs text-white/60 leading-relaxed">{s.d}</p>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={onOpenCamera}
        className="btn-primary w-full"
        data-testid="scan-camera-btn"
      >
        <span className="flex items-center justify-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Open Camera
        </span>
      </button>
    </div>
  );
}

function ManualInput() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) router.push(`/scan?cardId=${input.trim()}`);
  };
  return (
    <form
      onSubmit={submit}
      className="glass p-8"
      data-testid="scan-manual-form"
    >
      <p className="text-[0.72rem] uppercase tracking-[0.22em] mb-4" style={{ color: "var(--cosmic-violet)" }}>
        Or enter manually
      </p>
      <label className="block text-sm text-white/70 mb-2">Card ID</label>
      <div
        className="flex items-center gap-2 p-1 pl-4 rounded-full mb-4"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <span className="text-sm text-white/40 font-mono">#</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="a1b2c3"
          className="flex-1 bg-transparent outline-none text-white text-sm placeholder:text-white/40"
          data-testid="scan-token-input"
        />
      </div>
      <button
        type="submit"
        disabled={!input.trim()}
        className="btn-primary w-full disabled:opacity-50"
        data-testid="scan-submit-btn"
      >
        Scan Card
      </button>
      <p className="mt-4 text-xs text-white/50 leading-relaxed">
        Enter the 5-character Card ID shown on your card. Scan a card's QR with
        your camera to jump straight to the result.
      </p>
    </form>
  );
}

export default function Scan() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10 py-20">
          <div className="glass p-12 text-center text-white/60">Loading…</div>
        </div>
      }
    >
      <ScanContent />
    </Suspense>
  );
}
