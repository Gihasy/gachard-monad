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
import {
  generateAuthorizationSignature,
  PrivyClient,
  verifyAuthToken,
} from "@privy-io/node";
import { ethers } from "ethers";
import { checkDailyLimit } from "./rate-limit";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
const APP_SECRET = process.env.PRIVY_APP_SECRET?.trim();
const RPC_URL = process.env.RPC_URL?.trim()!;
/**
 * Private half of the key quorum the user grants signing rights to.
 * Server-only. Requests against a delegated user wallet are rejected without
 * a signature from this key; app-owned wallets do not need one.
 */
const AUTHORIZATION_KEY = process.env.PRIVY_AUTHORIZATION_KEY?.trim();

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
 * Resolve a Privy wallet id.
 *
 * Needed because the pinned client SDK's `Wallet` type exposes only `address`,
 * with no id, so the browser cannot tell us which wallet to send from.
 *
 * Two lookups, because they cover different kinds of wallet and the
 * difference is easy to get wrong:
 *
 * - `users()._get(did)` finds a USER-OWNED embedded wallet, which is what
 *   every real user has.
 * - `wallets().list({address})` only ever returns APP-OWNED wallets, the ones
 *   created server-side (owner_id: null).
 *
 * Relying on the second alone is a trap: it silently works for a wallet you
 * created through the API during testing and finds nothing at all for a real
 * user, because their wallet belongs to them and not to the app.
 */
export interface ResolvedWallet {
  /**
   * Null when Privy knows the wallet but has not exposed an id for it, which
   * is what an undelegated user wallet looks like. Observed directly: a real
   * embedded wallet came back with connector_type "embedded", delegated
   * false, and id null. Treating that as "unknown wallet" tells the user the
   * wrong thing, so the two cases are kept apart.
   */
  id: string | null;
  /**
   * Whether the user has delegated this wallet to the app.
   *
   * Decisive for export: without delegation the server cannot send the return
   * transfer, so the card would leave and be unable to come back. App-owned
   * wallets need no delegation, since the app already controls them.
   */
  delegated: boolean;
  appOwned: boolean;
}

export async function resolveWallet(
  address: string,
  privyUserId?: string | null
): Promise<ResolvedWallet | null> {
  const privy = getPrivyClient();
  const target = ethers.getAddress(address).toLowerCase();

  if (privyUserId && privyUserId.startsWith("did:privy:")) {
    try {
      const user = await privy.users()._get(privyUserId);
      for (const acct of user?.linked_accounts ?? []) {
        const a = acct as { address?: string; id?: string | null; delegated?: boolean };
        if (a.address && a.address.toLowerCase() === target) {
          return { id: a.id ?? null, delegated: a.delegated === true, appOwned: false };
        }
      }
    } catch (e) {
      console.warn("[privy] user lookup failed:", e instanceof Error ? e.message : e);
    }
  }

  const res = await privy.wallets().list({ address: ethers.getAddress(address) });
  const appWallet = (res?.data ?? [])[0];
  return appWallet?.id ? { id: appWallet.id, delegated: true, appOwned: true } : null;
}

/** Back-compat helper for callers that only need the id. */
export async function resolveWalletId(
  address: string,
  privyUserId?: string | null
): Promise<string | null> {
  return (await resolveWallet(address, privyUserId))?.id ?? null;
}

/** True when the wallet exists but the app has no signing rights on it yet. */
export function needsDelegation(w: ResolvedWallet | null): boolean {
  return Boolean(w && !w.appOwned && (!w.delegated || !w.id));
}

/**
 * Verify a Privy access token and return the DID it was issued for.
 *
 * The point is that the caller cannot choose the answer. Binding a Privy
 * account to a Gachard account used to trust whatever the browser posted,
 * so anyone holding a Gachard session could name their own wallet as the
 * destination and walk the cards out. The identity now comes from a token
 * Privy signed, not from the request body.
 *
 * Returns null on any failure rather than throwing, so callers answer with
 * one generic rejection instead of describing which check failed.
 */
export async function verifyPrivyToken(authToken: string): Promise<string | null> {
  if (!authToken || !APP_ID) return null;
  try {
    const key = await getVerificationKey();
    if (!key) return null;
    const payload = await verifyAuthToken({
      auth_token: authToken,
      app_id: APP_ID,
      verification_key: key,
    });
    return payload?.user_id ?? null;
  } catch (e) {
    console.warn("[privy] token verification failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * The app's public verification key, fetched once and kept.
 *
 * It is public and changes only if the app is reconfigured, so re-fetching
 * it on every sign-in would be a round trip for nothing.
 */
let verificationKey: string | null = null;
async function getVerificationKey(): Promise<string | null> {
  if (verificationKey) return verificationKey;
  try {
    const settings = await getPrivyClient().apps().getSettings();
    verificationKey = (settings as { verification_key?: string })?.verification_key ?? null;
    return verificationKey;
  } catch (e) {
    console.warn("[privy] could not read the verification key:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * The embedded wallet Privy holds for a user, looked up by DID.
 *
 * Used when binding, so the stored address comes from Privy rather than from
 * whatever the browser claimed.
 */
export async function getEmbeddedWalletForUser(
  privyUserId: string
): Promise<{ address: string; id: string | null; delegated: boolean } | null> {
  try {
    const user = await getPrivyClient().users()._get(privyUserId);
    for (const acct of user?.linked_accounts ?? []) {
      const a = acct as {
        address?: string;
        id?: string | null;
        delegated?: boolean;
        connector_type?: string;
        type?: string;
      };
      if (a.type === "wallet" && a.connector_type === "embedded" && a.address) {
        return { address: a.address, id: a.id ?? null, delegated: a.delegated === true };
      }
    }
    return null;
  } catch (e) {
    console.warn("[privy] user lookup failed:", e instanceof Error ? e.message : e);
    return null;
  }
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
  const url = `https://api.privy.io/v1/wallets/${walletId}/rpc`;

  const body = {
    method: "eth_sendTransaction" as const,
    caip2: MONAD_CAIP2,
    sponsor: true,
    params: {
      transaction: {
        to: ethers.getAddress(tx.to),
        value: tx.value ?? "0x0",
        ...(tx.data ? { data: tx.data } : {}),
      },
    },
  };

  // The signature covers this exact body, so the two are built once and not
  // reassembled. Anything added after signing invalidates it.
  const authorization = AUTHORIZATION_KEY
    ? generateAuthorizationSignature({
        authorizationPrivateKey: AUTHORIZATION_KEY,
        input: {
          version: 1,
          method: "POST",
          url,
          body,
          headers: { "privy-app-id": APP_ID! },
        },
      })
    : undefined;

  // Sent with fetch rather than wallets().rpc() because the SDK gives no way
  // to set this header. Putting it in the params object leaves it in the
  // body; passing it through request options does not reach the wire either.
  // Both return 401 "Missing privy-authorization-signature", while the same
  // request sent directly returns 200 — the signature was always valid and
  // only its delivery was broken.
  if (!APP_ID || !APP_SECRET) {
    throw new Error("[privy] app credentials are not configured");
  }

  const httpRes = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " + Buffer.from(`${APP_ID}:${APP_SECRET}`).toString("base64"),
      "privy-app-id": APP_ID,
      ...(authorization ? { "privy-authorization-signature": authorization } : {}),
    },
    body: JSON.stringify(body),
  });

  const res = (await httpRes.json().catch(() => null)) as {
    data?: { transaction_id?: string; user_operation_hash?: string };
    error?: string;
  } | null;

  if (!httpRes.ok) {
    throw new Error(
      `[privy] sponsored send failed (${httpRes.status}): ${res?.error ?? "unknown error"}`
    );
  }

  const transactionId = res?.data?.transaction_id;
  if (!transactionId) {
    throw new Error(
      `[privy] sponsored send returned no transaction_id: ${JSON.stringify(res?.data)}`
    );
  }

  return {
    transactionId,
    userOperationHash: res?.data?.user_operation_hash ?? null,
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
