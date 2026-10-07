/**
 * Emergency: move contract ownership out of a compromised key (ADR-036).
 *
 * This is the first action in `docs/INCIDENT-RUNBOOK.md`, and the only one
 * with a time limit. Whoever calls `transferOwnership` first wins permanently,
 * and the attacker holds the same key.
 *
 * It does one thing and prints what it did. No prompts to read, no flags to
 * remember, no cleverness — the person running this is under pressure and
 * should not have to think about the tool.
 *
 *   npx tsx scripts/emergency-transfer-ownership.ts
 *
 * The destination comes from EMERGENCY_OWNER in .env.local. It must be a cold
 * wallet or multisig whose keys have never been on a server; a second hot key
 * is the same problem with a different address.
 */
import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";

for (const line of fs
  .readFileSync(path.resolve(__dirname, "../.env.local"), "utf-8")
  .split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) {
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[t.slice(0, i).trim()] = v;
  }
}

const ABI = [
  "function owner() view returns (address)",
  "function transferOwnership(address newOwner)",
];

async function main() {
  const destination = (process.env.EMERGENCY_OWNER || "").trim();
  const contractAddress = (process.env.CONTRACT_ADDRESS || "").trim();
  const key = (process.env.ADMIN_PRIVATE_KEY || "").trim();
  const rpc = (process.env.RPC_URL || "").trim();

  // Refuse loudly rather than fail at 3am. A runbook whose critical value is
  // blank should break during the drill, which is the whole reason there is
  // a drill.
  if (!destination) {
    console.error("EMERGENCY_OWNER is not set in .env.local.");
    console.error("Set it to a cold wallet or multisig address, then run the drill");
    console.error("in docs/INCIDENT-RUNBOOK.md section 6. Do not discover this is");
    console.error("missing during an incident.");
    process.exit(1);
  }
  if (!ethers.isAddress(destination)) {
    console.error(`EMERGENCY_OWNER is not a valid address: ${destination}`);
    process.exit(1);
  }
  if (!contractAddress || !key || !rpc) {
    console.error("CONTRACT_ADDRESS, ADMIN_PRIVATE_KEY and RPC_URL must all be set.");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(key, provider);
  const contract = new ethers.Contract(contractAddress, ABI, wallet);

  const current: string = await contract.owner();
  console.log("contract    :", contractAddress);
  console.log("owner now   :", current);
  console.log("signing as  :", wallet.address);
  console.log("moving to   :", ethers.getAddress(destination));

  if (current.toLowerCase() === destination.toLowerCase()) {
    console.log("\nAlready owned by the emergency address. Nothing to do.");
    return;
  }
  if (current.toLowerCase() !== wallet.address.toLowerCase()) {
    // Either the drill already moved it, or the attacker was faster. Either
    // way this key cannot transfer it, and saying so is more useful than a
    // revert trace.
    console.error("\nThis key is NOT the current owner, so it cannot transfer ownership.");
    console.error("If you did not expect that, assume the attacker won the race and");
    console.error("read section 3 of docs/INCIDENT-RUNBOOK.md.");
    process.exit(1);
  }

  console.log("\nsending transferOwnership…");
  const tx = await contract.transferOwnership(ethers.getAddress(destination));
  console.log("tx hash     :", tx.hash);
  const receipt = await tx.wait();
  console.log("status      :", receipt?.status === 1 ? "confirmed" : "FAILED");
  console.log("owner now   :", await contract.owner());

  console.log(
    "\nThe old key can no longer call any onlyOwner function. Print, redeem,"
  );
  console.log(
    "marketplace purchases and dismantle will fail until ownership is handed"
  );
  console.log("to a fresh hot key. That is expected — see section 3.");
}

main().catch((e) => {
  console.error("\nFAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
