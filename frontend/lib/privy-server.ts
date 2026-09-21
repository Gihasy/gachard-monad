/**
 * Server-side Privy client for gas-sponsored transactions (ADR-031).
 *
 * This module is the ONLY place that sets `sponsor: true`. The flag must never
 * reach client code: NEXT_PUBLIC_PRIVY_APP_ID is inlined into the browser
 * bundle by definition, so a client-side sponsor flag would let anyone spend
 * the sponsorship balance on any transaction to any contract. The Privy
 * Dashboard option "Allow transactions from the client" stays off to enforce
 * the same rule on Privy's side.
 *
 * Two behaviours here are not obvious and were found by testing, not by
 * reading the docs. Both are load-bearing:
 *
 * 1. Sponsorship is ASYNCHRONOUS. The send call returns an empty `hash`
 *    alongside a `transaction_id`. The real hash only exists after polling.
 *    Storing the first response's hash writes an empty string and fails
 *    silently, which is the same failure shape as the `tokenId: null` bug
 *    fixed in 4658e4e. sendSponsored() therefore does not return a hash at
 *    all, so callers cannot make that mistake.
 *
 * 2. Writes are NEVER retried automatically. The Monad RPC returns
 *    "could not coalesce error" on responses whose transaction actually
 *    landed, so a blind retry executes twice. Check on-chain state (or
 *    getSponsoredStatus) before deciding to resend.
 */
import { PrivyClient } from "@privy-io/node";
import { ethers } from "ethers";
import { checkDailyLimit } from "./rate-limit";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
const APP_SECRET = process.env.PRIVY_APP_SECRET?.trim();
const RPC_URL = process.env.RPC_URL?.trim()!;

/** CAIP-2 identifier for Monad Testnet (chain ID 10143). */
export const MONAD_CAIP2 = "eip155:10143";

/** Sponsored transactions allowed per user per day (ADR-031). */
export const DAILY_SPONSORED_LIMIT = 20;

let client: PrivyClient | null = null;

/**
 * Lazily construct the Privy client.
 *
 * Throws rather than returning a half-configured client: unlike the AI
 * features in ADR-030, a missing key here must fail loudly. A silent failure
 * would leave a card mid-transfer, which is worse than refusing to start.
 */
export function getPrivyClient(): PrivyClient {
  if (!APP_ID || !APP_SECRET) {
    throw new Error(
      "[privy] NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET must both be set"
    );
  }
  if (!client) {
    client = new PrivyClient({ appId: APP_ID, appSecret: APP_SECRET });
  }
  return client;
}

/** True when the server is configured to send sponsored transactions. */
export function isSponsorshipConfigured(): boolean {
  return Boolean(APP_ID && APP_SECRET);
}

/**
 * Resolve a Privy wallet id from its address.
 *
 * Needed because the pinned client SDK's `Wallet` type exposes only `address`,
 * with no id, so the browser cannot tell us which wallet to send from. The
 * server has to look it up. Cheap enough to call per request, and the result
 * is stored on the user document after the first resolution.
 */
export async function resolveWalletId(address: string): Promise<string | null> {
  const privy = getPrivyClient();
  const res = await privy.wallets().list({ address: ethers.getAddress(address) });
  const items = res?.data ?? [];
  return items[0]?.id ?? null;
}

export interface SponsoredSend {
  /** Poll this with getSponsoredStatus(). The source of truth. */
  transactionId: string;
  userOperationHash: string | null;
}

export interface SponsoredStatus {
  status: string;
  /** Null until Privy has broadcast and the transaction is confirmed. */
  hash: string | null;
  confirmed: boolean;
  failed: boolean;
}

interface SponsoredTxInput {
  to: string;
  /** Encoded call data, or omitted for a plain value transfer. */
  data?: string;
  /** Hex wei. Defaults to "0x0". */
  value?: string;
}

/**
 * Send a gas-sponsored transaction from a user's Privy wallet.
 *
 * Deliberately returns no transaction hash; see note 1 in the file header.
 * Deliberately performs no retry; see note 2.
 */
export async function sendSponsored(
  walletId: string,
  tx: SponsoredTxInput
): Promise<SponsoredSend> {
  const privy = getPrivyClient();

  const res = await privy.wallets().rpc(walletId, {
    method: "eth_sendTransaction",
    caip2: MONAD_CAIP2,
    sponsor: true,
    params: {
      transaction: {
        to: ethers.getAddress(tx.to),
        value: tx.value ?? "0x0",
        ...(tx.data ? { data: tx.data } : {}),
      },
    },
  });

  const transactionId = res.data?.transaction_id;
  if (!transactionId) {
    throw new Error(
      `[privy] sponsored send returned no transaction_id: ${JSON.stringify(res.data)}`
    );
  }

  return {
    transactionId,
    userOperationHash: res.data?.user_operation_hash ?? null,
  };
}

/**
 * Read the current state of a sponsored transaction.
 *
 * One call, no internal loop: routes run under maxDuration = 10 (ADR-018),
 * so polling belongs on the client, the same shape as the pack fulfil flow.
 */
export async function getSponsoredStatus(
  transactionId: string
): Promise<SponsoredStatus> {
  const privy = getPrivyClient();
  const t = await privy.transactions().get(transactionId);
  const status = String(t.status ?? "unknown");

  return {
    status,
    hash: t.transaction_hash ?? null,
    confirmed: status === "confirmed" && Boolean(t.transaction_hash),
    failed: /fail|error|revert/i.test(status),
  };
}

/**
 * Block number a confirmed transaction landed in.
 *
 * Stored at export time so the import-side event scan has an anchor to search
 * forward from. Monad blocks are ~0.3s, so scanning back from the chain head
 * loses the trail within minutes; this is the same anchoring fix as 4658e4e.
 */
export async function getBlockNumberForTx(hash: string): Promise<number | null> {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const receipt = await provider.getTransactionReceipt(hash);
  return receipt?.blockNumber ?? null;
}

/**
 * Consume one unit of a user's daily sponsorship budget.
 *
 * Every import is one sponsored transaction, so an export/import loop drains
 * the balance unless bounded. Privy caps total spend only; per-user limits are
 * ours to enforce (ADR-031).
 */
export async function consumeSponsorshipBudget(
  userId: string
): Promise<{ allowed: boolean; remaining: number }> {
  return checkDailyLimit(userId, "privy_sponsored", DAILY_SPONSORED_LIMIT);
}
