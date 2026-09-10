import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getEntropySeed, getEntropyRarityHash, getProvider } from "@/lib/blockchain";
import { buildPackRaritiesFromSeed } from "@/lib/odds";
import { ethers } from "ethers";

const CARD_MINTED_TOPIC = ethers.id("CardMinted(uint256,address,uint8,uint8)");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ txHash: string }> }
) {
  try {
    const { txHash } = await params;

    if (!txHash) {
      return NextResponse.json({ error: "txHash required" }, { status: 400 });
    }

    // Find transaction in MongoDB
    const txCollection = await getCollection("transactions");
    const tx = await txCollection.findOne({ txHash });
    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Check if this is an entropy-based mint
    if (!tx.entropySequenceNumber && tx.entropySequenceNumber !== 0) {
      return NextResponse.json({
        verified: false,
        reason: "Not an entropy-based mint (legacy Math.random flow)",
        entropy: false,
      });
    }

    const sequenceNumber = tx.entropySequenceNumber;

    // Read seed and rarityHash from on-chain
    const seed = await getEntropySeed(sequenceNumber);
    const onChainRarityHash = await getEntropyRarityHash(sequenceNumber);

    if (!seed || seed === "0x0000000000000000000000000000000000000000000000000000000000000000") {
      return NextResponse.json({
        verified: false,
        reason: "Seed not yet available on-chain (entropy callback pending)",
        entropy: true,
        sequenceNumber,
      });
    }

    // Read actual rarities from minted cards
    const cardsCollection = await getCollection("cards");
    const cards = await cardsCollection
      .find({ txId: tx._id.toString() })
      .sort({ pickIndex: 1 })
      .toArray();
    const actualRarities = cards.map((c) => c.rarity);

    // Re-run deterministic algorithm
    const pack = tx.rarities?.length || 5;
    const guaranteed = cards.filter((c) => c.rarity >= 1).length >= 2 ? 2 : 1;
    const expectedRarities = buildPackRaritiesFromSeed(seed, pack, guaranteed);

    // Compute expected hash
    const expectedHash = keccak256Rarities(seed, actualRarities);

    // Compare
    const hashMatch = expectedHash.toLowerCase() === onChainRarityHash.toLowerCase();
    const raritiesMatch =
      actualRarities.length === expectedRarities.length &&
      actualRarities.every((r: number, i: number) => r === expectedRarities[i]);

    return NextResponse.json({
      verified: hashMatch && raritiesMatch,
      entropy: true,
      sequenceNumber,
      seed,
      onChainRarityHash,
      expectedHash,
      hashMatch,
      expectedRarities,
      actualRarities,
      raritiesMatch,
    });
  } catch (error) {
    console.error("[verify] Error:", error);
    return NextResponse.json(
      { error: "Verification failed", details: String(error) },
      { status: 500 }
    );
  }
}

function keccak256Rarities(seed: string, rarities: number[]): string {
  // Solidity: keccak256(abi.encodePacked(seed, rarities))
  // abi.encodePacked concatenates the raw bytes
  const seedBytes = ethers.getBytes(seed);
  const rarityBytes = new Uint8Array(rarities);
  const packed = new Uint8Array(seedBytes.length + rarityBytes.length);
  packed.set(seedBytes, 0);
  packed.set(rarityBytes, seedBytes.length);
  return ethers.keccak256(packed);
}
