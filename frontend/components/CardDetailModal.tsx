"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
  price?: number | null;
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
  fvm: number | null;
  fvmSource?: string;
}

export default function CardDetailModal({
  cardId,
  tokenId,
  onClose,
}: {
  cardId?: string | null;
  tokenId: number | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = cardId || tokenId;
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/scan?cardId=${id}`, { credentials: "include" })
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
  }, [cardId, tokenId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
      data-testid="card-detail-modal"
    >
      <div
        className="w-full max-w-lg rounded-3xl flex flex-col overflow-hidden"
        style={{
          background: "rgba(15,19,36,0.97)",
          border: "1px solid rgba(184,172,255,0.2)",
          maxHeight: "min(88vh, 600px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <p className="text-[0.72rem] uppercase tracking-[0.22em]" style={{ color: "var(--cosmic-violet)" }}>
              Card Details
            </p>
            {data && (data.cardId || data.tokenId) && (
              <a
                href={`/scan?cardId=${data.cardId ?? data.tokenId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-6 h-6 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
                style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                title="View full details"
                data-testid="modal-scan-link"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:brightness-125"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
            data-testid="card-detail-close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable if needed */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="py-12 text-center">
              <div
                className="w-8 h-8 mx-auto rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: "var(--cosmic-violet)", borderTopColor: "transparent" }}
              />
              <p className="mt-4 text-white/70 uppercase tracking-widest text-xs">Loading…</p>
            </div>
          )}

          {error && (
            <div className="py-12 text-center">
              <p style={{ color: "var(--aurora-pink)" }} className="uppercase tracking-widest text-sm mb-2">Error</p>
              <p className="text-white/70 text-sm">{error}</p>
            </div>
          )}

          {data && (
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Card artwork — fixed width on desktop */}
              <div
                className={`glass overflow-hidden shrink-0 self-start mx-auto sm:mx-0 ${RARITY_GLOW[data.onChain.rarityCode]}`}
                style={{ borderColor: RARITY_COLORS[data.onChain.rarityCode], width: 150 }}
              >
                <div className="relative w-full bg-white/5" style={{ aspectRatio: "5/7" }}>
                  {data.metadata.artworkUrl ? (
                    <Image
                      src={data.metadata.artworkUrl}
                      alt={data.metadata.templateName || "Card"}
                      fill
                      sizes="150px"
                      className="object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-3xl text-white/30">◆</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Meta — fills remaining space */}
              <div className="flex-1 min-w-0 space-y-2.5">
                {/* Verification */}
                <div
                  className="flex items-center gap-2.5 p-2.5 rounded-xl"
                  style={{
                    background: data.verification.flag === "verified" ? "rgba(0,204,255,0.08)" : "rgba(255,196,102,0.08)",
                    border: data.verification.flag === "verified" ? "1px solid rgba(0,204,255,0.35)" : "1px solid rgba(255,196,102,0.35)",
                  }}
                  data-testid="modal-verification"
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[0.7rem] font-semibold uppercase tracking-wide"
                      style={{ color: data.verification.flag === "verified" ? "var(--electric-blue)" : "var(--aurora-gold)" }}
                    >
                      {data.verification.flag === "verified" ? "Verified authentic" : "Warning — data mismatch"}
                    </p>
                    <p className="text-[0.55rem] text-white/60">Signature validated against verified record.</p>
                  </div>
                  {data.tokenId !== null && (
                    <a
                      href={`/scan?cardId=${data.cardId ?? data.tokenId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0"
                      title="View on Scan page"
                    >
                      <img
                        src={`/api/cards/${data.tokenId}/qr`}
                        alt={`QR for #${data.cardId ?? data.tokenId}`}
                        className="w-14 h-14 rounded-lg"
                      />
                    </a>
                  )}
                </div>

                {/* Metadata */}
                <div className="glass p-3">
                  <MetaRow label="Card ID" value={`#${data.cardId || data.tokenId}`} mono />
                  <MetaRow label="Name" value={data.metadata.templateName || "Unknown"} />
                  <MetaRow
                    label="Rarity"
                    value={
                      <span className={`tag tag-${RARITY_LABELS[data.onChain.rarityCode].toLowerCase()} text-[0.55rem]`}>
                        {data.onChain.rarity}
                      </span>
                    }
                  />
                  <MetaRow
                    label="Status"
                    value={
                      <span
                        className="text-[0.55rem] uppercase tracking-widest px-1.5 py-0.5 rounded"
                        style={{
                          background: data.onChain.status === "Print Requested" ? "rgba(255,107,186,0.15)" : "rgba(0,204,255,0.15)",
                          color: data.onChain.status === "Print Requested" ? "var(--aurora-pink)" : "var(--electric-blue)",
                          border: `1px solid ${data.onChain.status === "Print Requested" ? "rgba(255,107,186,0.35)" : "rgba(0,204,255,0.35)"}`,
                        }}
                      >
                        {data.onChain.status}
                      </span>
                    }
                  />
                  <MetaRow label="Last Owner" value={<span className="text-[0.65rem] text-white/70">{data.onChain.lastOwner || "—"}</span>} />
                  {data.purchasePrice !== null && (
                    <MetaRow
                      label="Purchase Price"
                      value={<span className="font-semibold text-[0.65rem]" style={{ color: "var(--crystal)" }}>{data.purchasePrice} Crystal</span>}
                    />
                  )}
                  <MetaRow
                    label="Fair Value Market"
                    value={
                      data.fvm !== null
                        ? <span className="font-semibold text-[0.65rem]" style={{ color: "var(--crystal)" }}>{data.fvm} Crystal</span>
                        : <span className="text-[0.65rem] text-white/40">—</span>
                    }
                    last
                  />
                </div>

                {/* History */}
                {data.history && data.history.length > 0 && (
                  <div className="glass p-3" data-testid="modal-history">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[0.6rem] uppercase tracking-[0.22em]" style={{ color: "var(--cosmic-violet)" }}>
                        Transaction History
                      </p>
                    </div>
                    <div className="space-y-1 max-h-[calc(3*3rem)] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}>
                      {data.history.map((tx, i) => (
                        <div
                          key={`${tx.type}-${tx.timestamp}-${i}`}
                          className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[0.65rem] font-medium text-white shrink-0">
                              {friendlyTxType(tx.type)}
                            </span>
                            {tx.price && tx.price > 0 && tx.type !== "mint" && (
                              <span className="text-[0.55rem] font-semibold shrink-0" style={{ color: "var(--crystal)" }}>
                                {tx.price} Crystal
                              </span>
                            )}
                          </div>
                          <span className="text-[0.55rem] text-white/40 shrink-0 ml-2">
                            {new Date(tx.timestamp).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
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
    <div className={`flex justify-between items-center py-1.5 ${!last ? "border-b border-white/[0.06]" : ""}`}>
      <span className="text-[0.55rem] uppercase tracking-widest text-white/50">{label}</span>
      <span className={`text-[0.65rem] text-white ${mono ? "font-mono font-bold" : "font-medium"}`}>{value}</span>
    </div>
  );
}
