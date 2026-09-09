"use client";

import { useState } from "react";
import Image from "next/image";
import QRScanner from "./QRScanner";
import CardDetailModal from "./CardDetailModal";
import ListingModal from "./ListingModal";
import SellButton from "./SellButton";

const RARITY_COLORS = [
  "var(--rarity-common)",
  "var(--rarity-rare)",
  "var(--rarity-epic)",
  "var(--rarity-legendary)",
];
const RARITY_GLOW = ["", "glow-rare", "glow-epic", "glow-legendary"];
const RARITY_LABELS = ["Common", "Rare", "Epic", "Legendary"];

interface CardItemProps {
  cardId?: string | null;
  tokenId: number | null;
  templateId: string;
  templateName?: string;
  rarity: number;
  artworkUrl: string;
  status: string;
  requestedAt?: string | null;
  deliveredAt?: string | null;
  claimId?: string | null;
  userId: string;
  isNew?: boolean;
  isListed?: boolean;
  listingId?: string | null;
  listingPrice?: number | null;
  onStatusChange?: (tokenId: number, newStatus: string) => void;
}

interface ShippingForm {
  recipientName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  phone: string;
}

const EMPTY_FORM: ShippingForm = {
  recipientName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postalCode: "",
  phone: "",
};

export default function CardItem({
  cardId,
  tokenId,
  templateId,
  templateName,
  rarity,
  artworkUrl,
  status,
  requestedAt,
  deliveredAt,
  claimId,
  userId,
  isNew,
  isListed: initialIsListed,
  listingId: initialListingId,
  listingPrice: initialListingPrice,
  onStatusChange,
}: CardItemProps) {
  const [printing, setPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ShippingForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [showClaimScanner, setShowClaimScanner] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [showDetail, setShowDetail] = useState(false);
  const [isListed, setIsListed] = useState(initialIsListed || false);
  const [listingId, setListingId] = useState(initialListingId || null);
  const [listingPrice, setListingPrice] = useState<number | null>(initialListingPrice || null);
  const [showListingModal, setShowListingModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const canPrint = currentStatus === "Digital" && tokenId !== null && !isListed;
  const canList = currentStatus === "Digital" && !isListed && tokenId !== null;
  const isInProgress = currentStatus === "In Progress";
  const isShipping = currentStatus === "Shipping";
  const isPhysical = currentStatus === "Physical";

  const isFormValid =
    form.recipientName.trim() &&
    form.addressLine1.trim() &&
    form.city.trim() &&
    form.postalCode.trim() &&
    form.phone.trim();

  const handleFormChange = (field: keyof ShippingForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  };

  const handleClaimScan = async (scannedClaimId: string) => {
    setShowClaimScanner(false);
    if (scannedClaimId !== claimId) {
      setClaimError("QR code does not match this card. Please scan the correct Claim Shipping QR.");
      return;
    }
    setClaiming(true);
    setClaimError(null);
    try {
      const res = await fetch("/api/claim-shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ claimId: scannedClaimId }),
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentStatus("Physical");
        if (tokenId) onStatusChange?.(tokenId, "Physical");
      } else {
        setClaimError(data.error || "Claim failed");
      }
    } catch {
      setClaimError("Network error");
    } finally {
      setClaiming(false);
    }
  };

  const handleRequestPrint = async () => {
    if (!tokenId) return;
    if (!isFormValid) {
      setFormError("Please fill in all required fields.");
      return;
    }

    setPrinting(true);
    setPrintStatus(null);
    setFormError(null);
    try {
      // Step 1: Checkout with shipping address
      const checkoutRes = await fetch("/api/print/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tokenId,
          shippingAddress: {
            recipientName: form.recipientName.trim(),
            addressLine1: form.addressLine1.trim(),
            addressLine2: form.addressLine2.trim(),
            city: form.city.trim(),
            postalCode: form.postalCode.trim(),
            phone: form.phone.trim(),
          },
        }),
      });
      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) {
        setPrintStatus(checkoutData.error || "Checkout failed");
        return;
      }

      // Step 2: Request print
      const printRes = await fetch("/api/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tokenId, paymentId: checkoutData.paymentId }),
      });
      const printData = await printRes.json();
      if (printRes.ok) {
        setPrintStatus("Print confirmed!");
        setShowForm(false);
        setCurrentStatus("In Progress");
        if (tokenId) onStatusChange?.(tokenId, "In Progress");
      } else {
        setPrintStatus(printData.error || "Print failed");
      }
    } catch {
      setPrintStatus("Network error");
    } finally {
      setPrinting(false);
    }
  };

  const handleCancelListing = async () => {
    if (!listingId) return;
    setShowCancelConfirm(true);
  };

  const confirmCancelListing = async () => {
    setShowCancelConfirm(false);
    setCancelling(true);
    try {
      const res = await fetch(`/api/marketplace/listings/${listingId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setIsListed(false);
        setListingId(null);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to cancel listing");
      }
    } catch {
      alert("Network error");
    }
    setCancelling(false);
  };

  const rarityLevel = Math.max(0, Math.min(3, rarity)) as 0 | 1 | 2 | 3;

  return (
    <>
      <div
        className={`glass glass-hover overflow-hidden p-2 sm:p-2.5 ${RARITY_GLOW[rarityLevel]}`}
        style={{ borderColor: RARITY_COLORS[rarityLevel] }}
        data-testid={`card-item-${tokenId ?? templateId}`}
      >
        <button
          type="button"
          onClick={() => setShowDetail(true)}
          className="relative w-full rounded-xl overflow-hidden mb-2 bg-white/5 cursor-pointer group"
          style={{ aspectRatio: "5/7" }}
          data-testid={`card-visual-${tokenId ?? templateId}`}
        >
          {isNew && (
            <span
              className="absolute top-2 right-2 z-10 text-[0.55rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{
                background: "linear-gradient(135deg, rgba(255,107,186,0.9), rgba(184,172,255,0.9))",
                color: "#fff",
                boxShadow: "0 0 12px rgba(255,107,186,0.5)",
              }}
              data-testid="card-new-badge"
            >
              New
            </span>
          )}
          {artworkUrl ? (
            <Image
              src={artworkUrl}
              alt={templateId}
              fill
              sizes="(max-width:768px) 40vw, 20vw"
              className="object-contain transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-3xl text-white/30">◆</span>
            </div>
          )}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.35)" }}
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-white">
              View Details
            </span>
          </div>
        </button>

        <div className="px-1 pb-1">
          <p className="text-xs font-medium text-white truncate">
            {cardId ? `Card ID: #${cardId}` : tokenId !== null ? `Card #${tokenId}` : templateId}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-1 mt-1">
            <span
              className={`tag tag-${RARITY_LABELS[rarityLevel].toLowerCase()} text-[0.55rem]`}
            >
              {RARITY_LABELS[rarityLevel]}
            </span>
            <span
              className="text-[0.55rem] uppercase tracking-widest px-1.5 py-0.5 rounded whitespace-nowrap"
              style={{
                background: isListed
                  ? "rgba(255,196,102,0.15)"
                  : isPhysical
                  ? "rgba(0,255,136,0.15)"
                  : isShipping
                  ? "rgba(138,92,255,0.15)"
                  : isInProgress
                  ? "rgba(255,196,102,0.15)"
                  : "rgba(0,204,255,0.15)",
                color: isListed
                  ? "var(--aurora-gold)"
                  : isPhysical
                  ? "#00ff88"
                  : isShipping
                  ? "var(--cosmic-violet)"
                  : isInProgress
                  ? "var(--aurora-gold)"
                  : "#00ccff",
              }}
            >
              {isListed ? "Listed" : currentStatus}
            </span>
          </div>

          {/* Action buttons */}
          <div className="mt-2">
            {isListed && (
              <>
                {listingPrice && (
                  <div
                    className="text-center py-1.5 px-2 rounded-lg mb-1.5"
                    style={{
                      background: "rgba(125,249,255,0.06)",
                      border: "1px solid rgba(125,249,255,0.15)",
                    }}
                  >
                    <span className="text-[0.7rem] font-semibold uppercase tracking-wider" style={{ color: "var(--crystal)" }}>
                      {listingPrice} Crystal
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={cancelling}
                  className="btn-ghost !py-2 !px-3 !text-[0.65rem] disabled:opacity-50 w-full"
                >
                  {cancelling ? "…" : "Cancel Listing"}
                </button>
              </>
            )}
            {!isListed && canList && (
              <SellButton onClick={() => setShowListingModal(true)} />
            )}
            {!isListed && status === "Digital" && (
              tokenId !== null ? (
                <button
                  onClick={() => setShowForm(true)}
                  disabled={printing}
                  className="btn-ghost !py-2 !px-3 !text-[0.65rem] disabled:opacity-50 w-full"
                  data-testid={`request-print-${tokenId}`}
                >
                  {printing ? "…" : "Print"}
                </button>
              ) : (
                <div
                  className="text-center text-[0.6rem] uppercase tracking-widest py-1.5 rounded-lg"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    color: "rgba(255,255,255,0.25)",
                  }}
                >
                  Pending…
                </div>
              )
            )}
            {isInProgress && requestedAt && (
              <div
                className="text-center text-[0.6rem] py-1.5 rounded-lg"
                style={{
                  background: "rgba(255,196,102,0.06)",
                  border: "1px solid rgba(255,196,102,0.15)",
                  color: "var(--aurora-gold)",
                }}
                data-testid={`requested-at-${tokenId}`}
              >
                Requested {new Date(requestedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
            {isShipping && (
              <div className="space-y-1.5">
                {showClaimScanner && (
                  <QRScanner onScan={handleClaimScan} onClose={() => setShowClaimScanner(false)} />
                )}
                <button
                  onClick={() => setShowClaimScanner(true)}
                  disabled={claiming}
                  className="w-full py-2 rounded-lg text-[0.65rem] font-medium uppercase tracking-widest transition-all disabled:opacity-50 active:scale-95 active:brightness-125 hover:brightness-110"
                  style={{
                    background: "linear-gradient(135deg, rgba(138,92,255,0.2), rgba(0,204,255,0.15))",
                    border: "1px solid rgba(138,92,255,0.4)",
                    color: "var(--cosmic-violet)",
                  }}
                  data-testid={`claim-shipping-${tokenId}`}
                >
                  {claiming ? "Claiming…" : "Claim Shipping"}
                </button>
                {claimError && (
                  <p className="text-[0.6rem] text-center" style={{ color: "var(--aurora-pink)" }}>
                    {claimError}
                  </p>
                )}
              </div>
            )}
            {isPhysical && deliveredAt && (
              <div
                className="text-center text-[0.6rem] py-1.5 rounded-lg"
                style={{
                  background: "rgba(0,255,136,0.06)",
                  border: "1px solid rgba(0,255,136,0.15)",
                  color: "#00ff88",
                }}
                data-testid={`physical-card-${tokenId}`}
              >
                {new Date(deliveredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
          </div>

          {printStatus && (
            <p className="mt-2 text-[0.7rem] text-white/60 leading-relaxed">
              {printStatus}
            </p>
          )}
        </div>
      </div>

      {/* Card Detail Modal */}
      {showDetail && (
        <CardDetailModal
          cardId={cardId}
          tokenId={tokenId}
          onClose={() => setShowDetail(false)}
        />
      )}

      {/* Listing Modal */}
      {showListingModal && cardId && (
        <ListingModal
          cardId={cardId}
          templateId={templateId}
          userId={userId}
          onClose={() => setShowListingModal(false)}
          onListed={(newListingId, price) => {
            setIsListed(true);
            setListingId(newListingId);
            setListingPrice(price);
            onStatusChange?.(tokenId!, "Digital");
          }}
        />
      )}

      {/* Cancel Listing Confirm Modal */}
      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowCancelConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{
              background: "rgba(15,19,36,0.95)",
              border: "1px solid rgba(255,107,186,0.3)",
              boxShadow: "0 0 40px rgba(255,107,186,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-2" style={{ color: "var(--silver-mist)" }}>
              Cancel Listing?
            </h3>
            <p className="text-sm mb-5" style={{ color: "var(--silver-mist-dim)" }}>
              Your card will be removed from the marketplace. You can list it again anytime.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="btn-ghost flex-1 !py-2.5"
              >
                Keep Listed
              </button>
              <button
                onClick={confirmCancelListing}
                className="flex-1 !py-2.5 font-semibold rounded-full transition-transform hover:-translate-y-px cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, rgba(255,107,186,0.9), rgba(184,172,255,0.9))",
                  color: "#fff",
                  border: "none",
                  boxShadow: "0 8px 26px -8px rgba(255,107,186,0.55)",
                }}
              >
                Cancel Listing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shipping Address Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
          onClick={() => setShowForm(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl overflow-hidden"
            style={{
              background: "rgba(15,19,36,0.95)",
              border: "1px solid rgba(184,172,255,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <p className="text-[0.72rem] uppercase tracking-[0.22em]" style={{ color: "var(--cosmic-violet)" }}>
                  Shipping Address
                </p>
                <p className="text-sm text-white/60 mt-1">
                  Print + Shipping — $14.99
                </p>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <div className="p-5 space-y-4">
              <FormField label="Recipient Name *" value={form.recipientName} onChange={(v) => handleFormChange("recipientName", v)} placeholder="Full name" />
              <FormField label="Address Line 1 *" value={form.addressLine1} onChange={(v) => handleFormChange("addressLine1", v)} placeholder="Street address" />
              <FormField label="Address Line 2" value={form.addressLine2} onChange={(v) => handleFormChange("addressLine2", v)} placeholder="Apt, suite, unit (optional)" />
              <div className="grid grid-cols-2 gap-3">
                <FormField label="City *" value={form.city} onChange={(v) => handleFormChange("city", v)} placeholder="City" />
                <FormField label="Postal Code *" value={form.postalCode} onChange={(v) => handleFormChange("postalCode", v)} placeholder="Postal code" />
              </div>
              <FormField label="Phone *" value={form.phone} onChange={(v) => handleFormChange("phone", v)} placeholder="Phone number" type="tel" />

              {formError && (
                <p className="text-xs" style={{ color: "var(--aurora-pink)" }}>{formError}</p>
              )}

              <button
                onClick={handleRequestPrint}
                disabled={printing || !isFormValid}
                className="btn-primary w-full disabled:opacity-50"
              >
                {printing ? "Processing..." : "Pay $14.99 & Print"}
              </button>

              <p className="text-[0.6rem] text-white/40 text-center">
                Flat rate includes printing and worldwide shipping.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-[0.65rem] uppercase tracking-widest text-white/40 mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30"
      />
    </div>
  );
}
