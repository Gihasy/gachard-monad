/**
 * EIP-712 export intent (ADR-031).
 *
 * The user signs this with their own Privy wallet BEFORE any card is moved,
 * not after. An ERC-1155 transfer cannot be undone, so proving the user
 * controls the destination has to happen while the cards are still
 * recoverable. Signing after the fact would prove the same thing too late to
 * act on.
 *
 * Typed data rather than a plain message so the modal shows the user what they
 * are agreeing to, and so `verifyingContract` binds the signature to this
 * chain and this contract.
 *
 * One signature covers a batch. It used to be one per card, which meant a
 * Privy signing dialog for every card in a selection -- five cards, five
 * modals. The intent is the same either way: "move these cards of mine to this
 * address of mine, before this time". `tokenIds` is part of the signed struct,
 * so the set is fixed at signing time and the server refuses any card that is
 * not in it.
 *
 * The transfers still happen one request per card. That is not a property of
 * the signature but of ADR-018's 10-second function limit: several sponsored
 * transfers in one request would not finish. What the batch removes is the
 * repeated dialog, which was the part the user felt.
 */
import { ethers } from "ethers";
import { monadTestnet } from "./monad-testnet";

export const EXPORT_INTENT_TTL_MS = 10 * 60 * 1000;

/**
 * A signature authorises this many cards at most.
 *
 * Not a technical limit — a blast radius. One signature is one act of consent,
 * and consent to move an unbounded number of cards is not something a person
 * can meaningfully give from a dialog listing token ids.
 */
export const MAX_EXPORT_BATCH = 20;

export interface ExportBatchIntent {
  tokenIds: number[];
  to: string;
  userId: string;
  nonce: string;
  deadline: number;
}

export function buildExportIntentDomain() {
  return {
    name: "Gachard",
    version: "1",
    // Single source of truth, and it must resolve identically on client and
    // server: a mismatched chainId silently changes the digest, and the
    // signature would fail verification with no clue why.
    chainId: monadTestnet.id,
    verifyingContract: ethers.getAddress(
      (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? process.env.CONTRACT_ADDRESS)!.trim()
    ),
  };
}

export const EXPORT_BATCH_TYPES = {
  ExportBatch: [
    { name: "tokenIds", type: "uint256[]" },
    { name: "to", type: "address" },
    { name: "userId", type: "string" },
    { name: "nonce", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/**
 * Types for CLIENT-SIDE signing, which must include EIP712Domain.
 *
 * Verification does not need it (ethers derives it from the domain), but the
 * signing payload does. Kept beside the verification types so the two cannot
 * drift apart.
 */
export const EXPORT_BATCH_SIGNING_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  ...EXPORT_BATCH_TYPES,
} as const;

/**
 * Recover the signer, or null if the signature is malformed.
 *
 * Returns null instead of throwing so callers answer with one generic
 * rejection for both "bad signature" and "wrong signer", rather than telling
 * a caller which of the two it was.
 *
 * Order matters: `tokenIds` is hashed as an ordered array, so the server must
 * verify against the exact array the client sent. It does not have to trust
 * that array — a reordered or extended one simply produces a different digest
 * and fails here.
 */
export function recoverExportBatchSigner(
  intent: ExportBatchIntent,
  signature: string
): string | null {
  try {
    return ethers.verifyTypedData(
      buildExportIntentDomain(),
      EXPORT_BATCH_TYPES as unknown as Record<string, ethers.TypedDataField[]>,
      intent,
      signature
    );
  } catch {
    return null;
  }
}

/**
 * The replay key for one card within a batch.
 *
 * The signed nonce covers the whole batch, but replay protection has to be per
 * card: otherwise the first card would consume the nonce and the rest of the
 * batch would be rejected as a replay. Scoping the stored key by token id
 * keeps the existing unique index on `nonce` doing the work, with no migration.
 */
export function batchNonceKey(nonce: string, tokenId: number): string {
  return `${nonce}:${tokenId}`;
}
