"use client";

/**
 * Move a card to the user's own wallet, and bring it back (ADR-031, stage 5).
 *
 * Mounts its own PrivyProvider rather than relying on a global one. ADR-028
 * kept Privy scoped to /profile so the core flow carried no added risk, and a
 * Privy hooks bug did take production down once (523e55f). An island here
 * keeps that property: the SDK never loads on /collect or anywhere else, and
 * a failure in it cannot reach the pack-opening flow.
 *
 * Copy stays in plain language per the project's UI rule. The user is told
 * their card is moving to their own wallet, not that they are signing an
 * EIP-712 payload. Privy's own modal supplies the technical detail for anyone
 * who wants it.
 */
import { useCallback, useEffect, useState } from "react";
import {
  PrivyProvider,
  usePrivy,
  useSignTypedData,
  useWallets,
} from "@privy-io/react-auth";
import { monadTestnet } from "@/lib/monad-testnet";

type Card = {
  cardId?: string | null;
  tokenId: number | null;
  templateName?: string;
};

type Mode = "export" | "import";

type Phase =
  | "idle"
  | "connect"
  | "signing"
  | "moving"
  | "claiming"
  | "returning"
  | "done"
  | "error";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20;

function Content({
  card,
  mode,
  userId,
  onClose,
  onDone,
}: {
  card: Card;
  mode: Mode;
  userId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { ready, authenticated, login, user } = usePrivy();
  const { wallets } = useWallets();
  const { signTypedData } = useSignTypedData();

  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const embedded = wallets.find((w) => w.walletClientType === "privy");
  const walletAddress = embedded?.address ?? user?.wallet?.address ?? null;

  const poll = useCallback(async (cardId: string) => {
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      const res = await fetch(`/api/privy/status/${cardId}`);
      const body = await res.json().catch(() => null);
      if (body?.settled) return body;
      if (body?.claimStatus === "failed" || body?.importStatus === "failed") {
        throw new Error("That did not go through. Please try again.");
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    // Not a failure: the work may still land. Saying so beats implying loss.
    return null;
  }, []);

  const runExport = useCallback(async () => {
    if (!card.cardId || card.tokenId === null) return;
    try {
      setPhase("signing");
      setMessage(null);

      const nonce = crypto.randomUUID();
      const deadline = Math.floor(Date.now() / 1000) + 600;
      if (!userId) throw new Error("Please sign in again.");

      const signature = await signTypedData({
        domain: {
          name: "Gachard",
          version: "1",
          chainId: monadTestnet.id,
          verifyingContract: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
        },
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          ExportIntent: [
            { name: "tokenId", type: "uint256" },
            { name: "to", type: "address" },
            { name: "userId", type: "string" },
            { name: "nonce", type: "string" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "ExportIntent",
        message: {
          tokenId: card.tokenId,
          to: walletAddress!,
          userId,
          nonce,
          deadline,
        },
      });

      setPhase("moving");
      const prep = await fetch("/api/privy/export/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.cardId, signature, nonce, deadline }),
      });
      const prepBody = await prep.json().catch(() => null);
      if (!prep.ok) throw new Error(prepBody?.error ?? "Could not move the card.");

      setPhase("claiming");
      const claim = await fetch("/api/privy/export/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.cardId }),
      });
      const claimBody = await claim.json().catch(() => null);
      if (!claim.ok) throw new Error(claimBody?.error ?? "Could not finish the handover.");

      await poll(card.cardId);
      setPhase("done");
      onDone();
    } catch (e) {
      setPhase("error");
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    }
  }, [card, userId, walletAddress, signTypedData, poll, onDone]);

  const runImport = useCallback(async () => {
    if (!card.cardId) return;
    try {
      setPhase("returning");
      setMessage(null);
      const res = await fetch("/api/privy/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.cardId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not bring the card back.");
      await poll(card.cardId);
      setPhase("done");
      onDone();
    } catch (e) {
      setPhase("error");
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    }
  }, [card, poll, onDone]);

  // Only export needs the wallet in the browser, because only export asks the
  // user to sign. Import is executed entirely server-side from the stored
  // wallet id, so gating it on a Privy session would strand a card for anyone
  // who exported on one device and came back on another.
  useEffect(() => {
    if (mode !== "export") return;
    if (!ready) return;
    if (!authenticated || !walletAddress) setPhase("connect");
    else if (phase === "connect") setPhase("idle");
  }, [mode, ready, authenticated, walletAddress, phase]);

  const busy = ["signing", "moving", "claiming", "returning"].includes(phase);

  const label: Record<Phase, string> = {
    idle: "",
    connect: "Set up your wallet first",
    signing: "Waiting for you to confirm…",
    moving: "Moving your card…",
    claiming: "Finishing the handover…",
    returning: "Bringing your card back…",
    done: mode === "export" ? "Your card is in your wallet." : "Your card is back.",
    error: message ?? "Something went wrong.",
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">
          {mode === "export" ? "Move to your wallet" : "Return to Gachard"}
        </h3>
        <p className="text-xs text-white/50 mt-1">
          {card.templateName ?? "This card"}
          {mode === "export"
            ? " will be held by you directly. You can bring it back any time."
            : " will come back to your collection, ready to trade or print."}
        </p>
      </div>

      {phase !== "idle" && (
        <p
          className="text-xs"
          style={{ color: phase === "error" ? "var(--aurora-pink)" : "var(--electric-blue)" }}
          data-testid="privy-transfer-status"
        >
          {label[phase]}
        </p>
      )}

      {phase === "connect" && (
        <button onClick={login} className="btn-primary w-full !py-2 !text-xs">
          Set up
        </button>
      )}

      {phase !== "connect" && phase !== "done" && (
        <div className="flex gap-2">
          <button
            onClick={mode === "export" ? runExport : runImport}
            disabled={busy || (mode === "export" && !ready)}
            className="btn-primary flex-1 !py-2 !text-xs disabled:opacity-50"
            data-testid="privy-transfer-confirm"
          >
            {busy ? "…" : mode === "export" ? "Move it" : "Bring it back"}
          </button>
          <button onClick={onClose} disabled={busy} className="btn-ghost !py-2 !px-3 !text-xs disabled:opacity-50">
            Cancel
          </button>
        </div>
      )}

      {phase === "done" && (
        <button onClick={onClose} className="btn-ghost w-full !py-2 !text-xs">
          Close
        </button>
      )}
    </div>
  );
}

export default function PrivyCardTransferModal(props: {
  card: Card;
  mode: Mode;
  userId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={props.onClose}
    >
      <div
        className="glass rounded-2xl p-5 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <PrivyProvider
          appId={appId}
          config={{
            defaultChain: monadTestnet,
            supportedChains: [monadTestnet],
            loginMethods: ["google", "email"],
            embeddedWallets: { createOnLogin: "users-without-wallets" },
          }}
        >
          <Content {...props} />
        </PrivyProvider>
      </div>
    </div>
  );
}
