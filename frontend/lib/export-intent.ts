/**
 * EIP-712 export intent (ADR-031).
 *
 * The user signs this with their own Privy wallet BEFORE the card is moved,
 * not after. An ERC-1155 transfer cannot be undone, so proving the user
 * controls the destination has to happen while the card is still recoverable.
 * Signing after the fact would prove the same thing too late to act on.
 *
 * Typed data rather than a plain message so the modal shows the user what
 * they are agreeing to, and so `verifyingContract` binds the signature to this
 * chain and this contract.
 */
import { ethers } from "ethers";
import { monadTestnet } from "./monad-testnet";

export const EXPORT_INTENT_TTL_MS = 10 * 60 * 1000;

export interface ExportIntent {
  tokenId: number;
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

export const EXPORT_INTENT_TYPES = {
  ExportIntent: [
    { name: "tokenId", type: "uint256" },
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
export const EXPORT_INTENT_SIGNING_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  ...EXPORT_INTENT_TYPES,
} as const;

/**
 * Recover the signer, or null if the signature is malformed.
 *
 * Returns null instead of throwing so callers answer with one generic
 * rejection for both "bad signature" and "wrong signer", rather than telling
 * a caller which of the two it was.
 */
export function recoverExportIntentSigner(
  intent: ExportIntent,
  signature: string
): string | null {
  try {
    return ethers.verifyTypedData(
      buildExportIntentDomain(),
      EXPORT_INTENT_TYPES as unknown as Record<string, ethers.TypedDataField[]>,
      intent,
      signature
    );
  } catch {
    return null;
  }
}
