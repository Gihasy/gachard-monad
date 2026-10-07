/**
 * Emergency: move contract ownership out of a compromised key (ADR-036).
 *
 * This is the first action in `docs/INCIDENT-RUNBOOK.md`, and the only one
 * with a time limit. Whoever calls `transferOwnership` first wins permanently,
 * and the attacker holds the same key.
 *
 * **Both contracts, not just the cards.** GachardCard is the one that holds
 * value, but PackEntropy is `Ownable` too, and its `requestPack` is
 * `onlyOwner` — a compromised key that cannot touch cards any more can still
 * call it in a loop and burn the entropy budget. Freezing one and leaving the
 * other is a half-measure that looks complete.
 *
 * PackEntropy's balance itself cannot be stolen: it has no withdraw function
 * at all. It can only be spent on entropy fees, which is exactly what the
 * loop above would do.
 *
 * Each contract is transferred independently. If one fails the other is still
 * attempted, because they protect different things and a failure on one is no
 * reason to leave the other open.
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

const OWNABLE_ABI = [
  "function owner() view returns (address)",
  "function transferOwnership(address newOwner)",
];

const MINTER_ABI = ["function authorizedMinters(address) view returns (bool)"];

type Target = { label: string; address: string };

async function transferOne(
  target: Target,
  destination: string,
  wallet: ethers.Wallet
): Promise<"moved" | "already" | "not-owner" | "failed"> {
  console.log(`\n── ${target.label}  ${target.address}`);
  const contract = new ethers.Contract(target.address, OWNABLE_ABI, wallet);

  let current: string;
  try {
    current = await contract.owner();
  } catch (e) {
    console.log("   could not read owner():", e instanceof Error ? e.message : e);
    return "failed";
  }
  console.log("   owner now :", current);

  if (current.toLowerCase() === destination.toLowerCase()) {
    console.log("   already owned by the emergency address — nothing to do");
    return "already";
  }
  if (current.toLowerCase() !== wallet.address.toLowerCase()) {
    console.log("   THIS KEY IS NOT THE OWNER — it cannot transfer this contract.");
    console.log("   If you did not expect that, assume the attacker was faster here.");
    return "not-owner";
  }

  try {
    const tx = await contract.transferOwnership(destination);
    console.log("   tx        :", tx.hash);
    const receipt = await tx.wait();
    if (receipt?.status !== 1) {
      console.log("   FAILED — transaction reverted");
      return "failed";
    }
    console.log("   owner now :", await contract.owner(), " ✓ moved");
    return "moved";
  } catch (e) {
    console.log("   FAILED:", e instanceof Error ? e.message : e);
    return "failed";
  }
}

async function main() {
  const destinationRaw = (process.env.EMERGENCY_OWNER || "").trim();
  const card = (process.env.CONTRACT_ADDRESS || "").trim();
  const entropy = (process.env.ENTROPY_CONTRACT_ADDRESS || "").trim();
  const key = (process.env.ADMIN_PRIVATE_KEY || "").trim();
  const rpc = (process.env.RPC_URL || "").trim();

  // Refuse loudly rather than fail at 3am. A runbook whose critical value is
  // blank should break during the drill, which is the whole reason for one.
  if (!destinationRaw) {
    console.error("EMERGENCY_OWNER is not set in .env.local.");
    console.error("Set it to a cold wallet or multisig address, then run the drill");
    console.error("in docs/INCIDENT-RUNBOOK.md. Do not discover this is missing");
    console.error("during an incident.");
    process.exit(1);
  }
  if (!ethers.isAddress(destinationRaw)) {
    console.error(`EMERGENCY_OWNER is not a valid address: ${destinationRaw}`);
    process.exit(1);
  }
  if (!key || !rpc || !card) {
    console.error("CONTRACT_ADDRESS, ADMIN_PRIVATE_KEY and RPC_URL must all be set.");
    process.exit(1);
  }

  const destination = ethers.getAddress(destinationRaw);
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(key, provider);

  // A destination that is the compromised key, or a wallet this platform
  // controls, protects nothing. Better to refuse than to look protected.
  if (destination.toLowerCase() === wallet.address.toLowerCase()) {
    console.error("EMERGENCY_OWNER is the same key that is signing. That protects nothing.");
    process.exit(1);
  }

  console.log("signing as :", wallet.address);
  console.log("moving to  :", destination);

  const targets: Target[] = [{ label: "GachardCard", address: card }];
  if (entropy && ethers.isAddress(entropy)) {
    targets.push({ label: "PackEntropy", address: entropy });
  } else {
    console.log("\nNOTE: ENTROPY_CONTRACT_ADDRESS is not set, so PackEntropy is skipped.");
    console.log("Its requestPack is onlyOwner — an attacker could still burn its fee budget.");
  }

  const results: Record<string, string> = {};
  for (const t of targets) {
    results[t.label] = await transferOne(t, destination, wallet);
  }

  // Ownership does not revoke minting rights. An address added as a minter
  // before the freeze keeps that right afterwards, because the two are
  // separate in this contract.
  console.log("\n── minting rights (ownership does not revoke these)");
  try {
    const c = new ethers.Contract(card, MINTER_ABI, provider);
    if (entropy && ethers.isAddress(entropy)) {
      console.log("   PackEntropy authorized :", await c.authorizedMinters(entropy), "(expected: true)");
    }
    console.log("   admin wallet authorized:", await c.authorizedMinters(wallet.address), "(expected: false)");
  } catch {
    console.log("   could not read authorizedMinters");
  }
  console.log("   Any OTHER address added before the freeze still holds the right, and");
  console.log("   cannot be listed cheaply — this RPC caps eth_getLogs at 100 blocks.");
  console.log("   Revoke known addresses with setAuthorizedMinter(addr, false) from the");
  console.log("   new owner. See docs/INCIDENT-RUNBOOK.md section 3.");

  console.log("\n── result");
  for (const [label, r] of Object.entries(results)) console.log(`   ${label.padEnd(12)} ${r}`);

  const anyMoved = Object.values(results).includes("moved");
  if (anyMoved) {
    console.log("\nThe old key can no longer call onlyOwner functions on what moved.");
    console.log("Print, redeem, marketplace purchases and dismantle will fail until");
    console.log("ownership is handed to a NEW hot key — not the compromised one.");
    console.log("Recovery steps: docs/INCIDENT-RUNBOOK.md section 3.");
  }
}

main().catch((e) => {
  console.error("\nFAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
