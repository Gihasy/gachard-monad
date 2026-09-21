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
  useDelegatedActions,
  usePrivy,
  useSignTypedData,
  useWallets,
} from "@privy-io/react-auth";
import {
  buildExportIntentDomain,
  EXPORT_INTENT_SIGNING_TYPES,
} from "@/lib/export-intent";
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
  | "delegate"
  | "delegating"
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
  // v1.93.0 ships this hook with an empty interface, but the implementation is
  // there (see the evaluation, 1.4). Cast rather than upgrade the SDK.
  const { delegateWallet } = useDelegatedActions() as unknown as {
    delegateWallet: (args: { address: string; chainType: "ethereum" }) => Promise<void>;
  };

  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const embedded = wallets.find((w) => w.walletClientType === "privy");
  // Only the embedded wallet counts. user.wallet.address was a fallback here
  // and it is wrong: it can resolve to a linked external wallet, which
  // useSignTypedData cannot sign with and the server could never send from.
  const walletAddress = embedded?.address ?? null;

  // Delegation is what lets Gachard send the return transfer later. Without it
  // a card can leave and never come back, because the wallet belongs to the
  // user and the server cannot sign for it. ADR-031 called for this; the first
  // build skipped it because the test wallet was app-owned and needed no
  // permission at all.
  const delegated = (user?.linkedAccounts ?? []).some((a) => {
    const w = a as { type?: string; walletClientType?: string; delegated?: boolean };
    return w.type === "wallet" && w.walletClientType === "privy" && w.delegated === true;
  });

  const runDelegate = useCallback(async () => {
    if (!walletAddress) return;
    try {
      setPhase("delegating");
      setMessage(null);
      await delegateWallet({ address: walletAddress, chainType: "ethereum" });
      setPhase("idle");
    } catch (e) {
      console.error("[privy] delegation failed:", e);
      setPhase("error");
      setMessage(e instanceof Error ? e.message : "Could not set up your wallet.");
    }
  }, [walletAddress, delegateWallet]);

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

      // Build the domain with the same helper the server verifies against, so
      // the two can never drift. (Address casing turned out NOT to matter:
      // ethers normalises it before hashing and viem accepts either form.)
      //
      // uint256 values are sent as strings because that is the exact shape
      // already proven to work against Privy eth_signTypedData_v4. The digest
      // is identical either way, so this costs nothing and removes one
      // difference between the path that works and the path that failed.
      const signature = await signTypedData({
        domain: buildExportIntentDomain(),
        types: EXPORT_INTENT_SIGNING_TYPES as unknown as Record<
          string,
          { name: string; type: string }[]
        >,
        primaryType: "ExportIntent",
        message: {
          tokenId: String(card.tokenId),
          to: walletAddress!,
          userId,
          nonce,
          deadline: String(deadline),
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
    else if (!delegated && (phase === "connect" || phase === "idle")) setPhase("delegate");
    else if (phase === "connect") setPhase("idle");
  }, [mode, ready, authenticated, walletAddress, delegated, phase]);

  const busy = ["signing", "moving", "claiming", "returning", "delegating"].includes(phase);

  const label: Record<Phase, string> = {
    idle: "",
    connect: "Set up your wallet first",
    delegate:
      "One-time step: allow Gachard to send this card back to your collection later.",
    delegating: "Setting up…",
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

      {(phase === "delegate" || phase === "delegating") && (
        <button
          onClick={runDelegate}
          disabled={phase === "delegating"}
          className="btn-primary w-full !py-2 !text-xs disabled:opacity-50"
          data-testid="privy-delegate"
        >
          {phase === "delegating" ? "…" : "Allow"}
        </button>
      )}

      {phase !== "connect" && phase !== "delegate" && phase !== "delegating" && phase !== "done" && (
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
