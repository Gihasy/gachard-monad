/**
 * Independent on-chain validation of Pyth Entropy fairness.
 * Reads seed + rarityHash from chain, recomputes rarities off-chain,
 * and checks the keccak256 commitment matches. Read-only.
 */
import { MongoClient } from "mongodb";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { buildPackRaritiesFromSeed } from "../lib/odds";

const envContent = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const ENTROPY_ABI = [
  "function getSeed(uint64 sequenceNumber) external view returns (bytes32)",
  "function getRarityHash(uint64 sequenceNumber) external view returns (bytes32)",
  "function requests(uint64) external view returns (address userAddr, uint8 packSize, uint8 guaranteed, bool fulfilled)",
];
const CARD_ABI = [
  "function cardRarity(uint256 tokenId) external view returns (uint8)",
];
const NAMES = ["Common", "Rare", "Epic", "Legendary"];

(async () => {
  const client = new MongoClient(env.MONGODB_URL);
  await client.connect();
  const db = client.db(env.DATABASE_NAME);

  const txs = await db
    .collection("transactions")
    .find({ entropySequenceNumber: { $exists: true, $ne: null } })
    .toArray();

  console.log("Transaksi dengan sequenceNumber:", txs.length);

  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  const entropy = new ethers.Contract(env.ENTROPY_CONTRACT_ADDRESS, ENTROPY_ABI, provider);
  const card = new ethers.Contract(env.CONTRACT_ADDRESS, CARD_ABI, provider);

  let pass = 0;
  let fail = 0;

  for (const t of txs as any[]) {
    const seq = Number(t.entropySequenceNumber);
    console.log("");
    console.log("=".repeat(62));
    console.log(`sequenceNumber ${seq}   (txHash ${t.txHash || t.rawTxId || "-"})`);

    const req = await entropy.requests(seq);
    const packSize = Number(req[1]);
    const guaranteed = Number(req[2]);
    const fulfilled = Boolean(req[3]);
    const seed = await entropy.getSeed(seq);
    const onchainHash = await entropy.getRarityHash(seq);

    console.log(`  packSize=${packSize} guaranteed=${guaranteed} fulfilled=${fulfilled}`);
    console.log(`  seed on-chain     : ${seed}`);

    if (!fulfilled || seed === ethers.ZeroHash) {
      console.log("  -> belum fulfilled, dilewati");
      continue;
    }

    // STEP 1: recompute rarities purely from the on-chain seed
    const recomputed = buildPackRaritiesFromSeed(seed, packSize, guaranteed);
    console.log(`  rarities dihitung : [${recomputed.map((r) => NAMES[r]).join(", ")}]`);

    // STEP 2: recompute the commitment hash exactly as the contract does
    const computedHash = ethers.keccak256(
      ethers.solidityPacked(["bytes32", "uint8[]"], [seed, recomputed])
    );
    console.log(`  hash on-chain     : ${onchainHash}`);
    console.log(`  hash dihitung     : ${computedHash}`);

    const hashMatch = computedHash.toLowerCase() === onchainHash.toLowerCase();
    console.log(`  COMMITMENT        : ${hashMatch ? "MATCH ✅" : "MISMATCH ❌"}`);

    // STEP 3: compare against the rarity actually stored per minted token
    const tokenIds: number[] = (t.tokenIds || []).map(Number);
    let tokenMatch = true;
    if (tokenIds.length) {
      const actual: number[] = [];
      for (const id of tokenIds) actual.push(Number(await card.cardRarity(id)));
      tokenMatch = JSON.stringify(actual) === JSON.stringify(recomputed);
      console.log(`  rarity token NFT  : [${actual.map((r) => NAMES[r]).join(", ")}]`);
      console.log(`  TOKEN RARITY      : ${tokenMatch ? "MATCH ✅" : "MISMATCH ❌"}`);
    }

    // STEP 4: guarantee actually honoured
    const rarePlus = recomputed.filter((r) => r >= 1).length;
    console.log(`  Rare+ = ${rarePlus} (dijanjikan >= ${guaranteed}) : ${rarePlus >= guaranteed ? "OK ✅" : "GAGAL ❌"}`);

    if (hashMatch && tokenMatch && rarePlus >= guaranteed) pass++;
    else fail++;
  }

  console.log("");
  console.log("=".repeat(62));
  console.log(`HASIL: ${pass} lolos, ${fail} gagal`);
  await client.close();
})();
