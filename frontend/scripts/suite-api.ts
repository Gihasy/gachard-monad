/**
 * Whole-suite API and logic checks. Throwaway fixture, cleaned up at the end.
 * Run: npx tsx scripts/suite-api.ts   (needs a server on BASE)
 */
import { MongoClient, ObjectId } from "mongodb";
import { createHmac } from "crypto";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { encrypt } from "../lib/crypto";

for (const l of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf-8").split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i > 0) {
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[t.slice(0, i).trim()] = v;
  }
}

/** Every transaction a suite run can create: fixture tokens live in 970000-970999. */
const SUITE_TOKENS = { $gte: 970000, $lt: 971000 };
const SUITE_TX = {
  $or: [{ tokenId: SUITE_TOKENS }, { tokenIds: { $elemMatch: SUITE_TOKENS } }, { privyTxId: { $regex: "^suite-" } }],
};

const BASE = process.env.SUITE_BASE ?? "http://localhost:3100";
const EMAIL = "suite@gachard.test";
// A real address shape. An earlier version used a readable placeholder with
// non-hex characters in it, which made ethers try to resolve it as an ENS name
// and throw before any balance was read — the reconcile tests failed for that
// and not for anything the code did.
const OWNER = ethers.Wallet.createRandom().address;

let pass = 0, fail = 0;
const results: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; results.push(`  PASS  ${name}`); }
  else { fail++; results.push(`  FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
function group(title: string) { results.push(`\n${title}`); }

(async () => {
  const { buildExportIntentDomain, EXPORT_BATCH_TYPES, recoverExportBatchSigner } =
    await import("../lib/export-intent");
  const { checkRateLimit } = await import("../lib/rate-limit");
  const { reconcileExportedCards, reconcileStuckTransfers } = await import("../lib/privy-reconcile");
  const { parseScannedCode } = await import("../lib/scan-code");
  const { settleMarketplacePurchase, unwindMarketplacePurchase } =
    await import("../lib/transactions");
  const { getCrystalBalance } = await import("../lib/crystal");
  const { checkSupplyIntegrity, recordMintedUpTo } = await import("../lib/supply-integrity");
  const { checkDisplayName } = await import("../lib/display-name");

  const client = new MongoClient(process.env.MONGODB_URL!);
  await client.connect();
  const db = client.db(process.env.DATABASE_NAME || "gachard");

  // ---- fixture ----
  const privyWallet = ethers.Wallet.createRandom();

  // Clear by cardId, not only by ownerAddress. OWNER is random per run, so a
  // run that crashed before its cleanup leaves fixtures that no later run can
  // match — and because cardId is uniquely indexed, every subsequent run then
  // dies on a duplicate key before the first check. Found exactly that way.
  await db.collection("cards").deleteMany({ cardId: { $regex: "^suite-" } });
  await db.collection("cards").deleteMany({ ownerAddress: OWNER });
  await db.collection("listings").deleteMany({ listingId: { $regex: "^suite-" } });
  await db.collection("users").deleteMany({ email: EMAIL });
  // Transactions too, by the fixture token range. They are cleaned by userId
  // at the end, and the userId is new every run, so a run that crashed midway
  // left its rows for every later run to count: group N then saw 16 history
  // rows instead of 8. Real tokens are numbered from 0 and nowhere near this.
  await db.collection("transactions").deleteMany(SUITE_TX);

  const userId = new ObjectId();
  const uid = userId.toString();
  await db.collection("users").insertOne({
    _id: userId, email: EMAIL, username: "suite", walletAddress: OWNER,
    privyUserId: "did:privy:suite", privyWalletAddress: privyWallet.address,
    crystalBalance: 0, createdAt: new Date().toISOString(),
  });

  const tpl = await db.collection("card_templates").find({}).limit(4).toArray();
  const now = new Date().toISOString();
  await db.collection("cards").insertMany([
    { cardId: "suite-0", tokenId: 970000, templateId: tpl[0].templateId, rarity: 0, ownerAddress: OWNER, status: "Digital", fulfillmentStatus: null, isListed: false, viewed: true, createdAt: now },
    { cardId: "suite-1", tokenId: 970001, templateId: tpl[1].templateId, rarity: 1, ownerAddress: OWNER, status: "Digital", fulfillmentStatus: null, isListed: false, viewed: true, createdAt: now },
    { cardId: "suite-2", tokenId: 970002, templateId: tpl[2].templateId, rarity: 2, ownerAddress: OWNER, status: "Digital", fulfillmentStatus: null, isListed: true, listingId: "suite-l1", viewed: true, createdAt: now },
    { cardId: "suite-4", tokenId: 970004, templateId: tpl[0].templateId, rarity: 0, ownerAddress: OWNER, status: "Digital", fulfillmentStatus: null, isListed: false, viewed: true, createdAt: now },
    { cardId: "suite-3", tokenId: 970003, templateId: tpl[3].templateId, rarity: 3, ownerAddress: OWNER, status: "Exported", privyWalletAddress: privyWallet.address, fulfillmentStatus: null, isListed: false, viewed: true, createdAt: now },
    // Sent to an address outside Gachard. It has no fulfillmentStatus, which
    // is exactly the shape that used to fall through getDisplayStatus to
    // "Digital" and offer List, Print and Dismantle on a card the platform no
    // longer holds.
    { cardId: "suite-5", tokenId: 970005, templateId: tpl[0].templateId, rarity: 0, ownerAddress: OWNER, status: "Released", releasedTo: "0x000000000000000000000000000000000000dead", releaseTxId: "suite-release", fulfillmentStatus: null, isListed: false, viewed: true, createdAt: now },
  ]);

  const ts = Math.floor(Date.now() / 1000);
  const payload = `${uid}.${ts}`;
  const token = `${payload}.${createHmac("sha256", Buffer.from(process.env.ENCRYPTION_SECRET_KEY!, "utf8")).update(payload).digest("hex")}`;
  const session = `gachard_session=${token}`;

  const get = async (p: string, cookie?: string) =>
    fetch(`${BASE}${p}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const post = async (p: string, body: unknown, cookie?: string) =>
    fetch(`${BASE}${p}`, {
      method: "POST", redirect: "manual",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });

  // ================= A. auth boundaries =================
  group("A. Authentication boundaries");
  check("no cookie is refused", (await get("/api/cards")).status === 401);
  check("unsigned gachard_uid alone is refused", (await get("/api/cards", `gachard_uid=${uid}`)).status === 401);
  check("forged signature is refused", (await get("/api/cards", `gachard_session=${uid}.${ts}.deadbeef`)).status === 401);
  const okCards = await get("/api/cards", session);
  check("valid session is accepted", okCards.status === 200);
  check("protected page redirects without a session", (await get("/collection")).status === 307);
  check("protected page loads with one", (await get("/collection", session)).status === 200);

  // ================= B. public endpoint leaks =================
  group("B. Public marketplace endpoint");
  await db.collection("listings").deleteMany({ listingId: "suite-l1" });
  await db.collection("listings").insertOne({
    listingId: "suite-l1", cardId: "suite-2", tokenId: 970002, templateId: tpl[2].templateId,
    sellerId: uid, sellerWalletAddress: OWNER, price: 100, status: "active", createdAt: now,
  });
  const anon = await (await get("/api/marketplace/listings")).json();
  const lAnon = (anon.listings ?? []).find((x: Record<string, unknown>) => x.listingId === "suite-l1");
  check("listing is returned to anonymous callers", !!lAnon);
  check("sellerId is not leaked", lAnon && !("sellerId" in lAnon));
  check("sellerWalletAddress is not leaked", lAnon && !("sellerWalletAddress" in lAnon));
  check("raw _id is not leaked", lAnon && !("_id" in lAnon));
  check("isOwn false for a stranger", lAnon?.isOwn === false);
  const mine = await (await get("/api/marketplace/listings", session)).json();
  const lMine = (mine.listings ?? []).find((x: Record<string, unknown>) => x.listingId === "suite-l1");
  check("isOwn true for the seller", lMine?.isOwn === true);

  // ================= C. logout =================
  group("C. Logout");
  const lo = await post("/api/auth/logout", {}, session);
  const setCookie = lo.headers.get("set-cookie") ?? "";
  check("logout responds 200", lo.status === 200);
  check("logout expires the session cookie", /gachard_session=;/.test(setCookie) && /Max-Age=0/i.test(setCookie));
  check("logout expires the legacy uid cookie", /gachard_uid=;/.test(setCookie));

  // ================= D. redeem =================
  group("D. Redeem");
  const r404 = await post("/api/redeem", { cardId: "no-such-card", code: "X" }, session);
  check("unknown card id is 404", r404.status === 404, String(r404.status));
  const rState = await post("/api/redeem", { cardId: "suite-0", code: "X" }, session);
  const rStateBody = await rState.json();
  check("a Digital card is refused with a reason", rState.status === 400 && /claimed/i.test(rStateBody.error ?? ""), rStateBody.error);

  // ================= E. export batch signature =================
  group("E. Export batch signature (offline)");
  const domain = buildExportIntentDomain();
  const types = EXPORT_BATCH_TYPES as unknown as Record<string, ethers.TypedDataField[]>;
  const tokenIds = [970000, 970001];
  const nonce = crypto.randomUUID();
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const sig = await privyWallet.signTypedData(domain, types, {
    tokenIds: tokenIds.map(String), to: privyWallet.address, userId: uid, nonce, deadline: String(deadline),
  });
  const base = { tokenIds, to: ethers.getAddress(privyWallet.address), userId: uid, nonce, deadline };
  check("client shape verifies against server shape", recoverExportBatchSigner(base, sig) === privyWallet.address);
  check("reordered tokenIds break recovery", recoverExportBatchSigner({ ...base, tokenIds: [970001, 970000] }, sig) !== privyWallet.address);
  check("extended tokenIds break recovery", recoverExportBatchSigner({ ...base, tokenIds: [...tokenIds, 1] }, sig) !== privyWallet.address);
  check("swapped tokenId breaks recovery", recoverExportBatchSigner({ ...base, tokenIds: [970000, 999] }, sig) !== privyWallet.address);
  check("changed destination breaks recovery", recoverExportBatchSigner({ ...base, to: ethers.Wallet.createRandom().address }, sig) !== privyWallet.address);
  check("changed userId breaks recovery", recoverExportBatchSigner({ ...base, userId: "someone-else" }, sig) !== privyWallet.address);

  group("F. Export batch over HTTP");
  const prep = (body: unknown) => post("/api/privy/export/prepare", body, session);
  // suite-4 is Digital and unlisted, so it clears every earlier guard and can
  // only be stopped by the membership check itself. suite-2 is listed, which
  // trips an earlier one — worth asserting separately rather than conflating.
  const outside = await prep({ cardId: "suite-4", tokenIds, signature: sig, nonce, deadline });
  const outsideBody = await outside.json();
  check("a card outside the signed set is refused", outside.status === 400 && /not covered/i.test(outsideBody.error ?? ""), `${outside.status} ${outsideBody.error}`);
  const listed = await prep({ cardId: "suite-2", tokenIds, signature: sig, nonce, deadline });
  const listedBody = await listed.json();
  check("a listed card is refused earlier, with its own reason", listed.status === 400 && /listed for sale/i.test(listedBody.error ?? ""), `${listed.status} ${listedBody.error}`);
  const noIds = await prep({ cardId: "suite-0", signature: sig, nonce, deadline });
  check("missing tokenIds is refused", noIds.status === 400);
  const bigIds = Array.from({ length: 21 }, (_, i) => 970000 + i);
  const bigSig = await privyWallet.signTypedData(domain, types, {
    tokenIds: bigIds.map(String), to: privyWallet.address, userId: uid, nonce: crypto.randomUUID(), deadline: String(deadline),
  });
  const big = await prep({ cardId: "suite-0", tokenIds: bigIds, signature: bigSig, nonce: crypto.randomUUID(), deadline });
  check("an oversized batch is refused", big.status === 400 && /at most/i.test((await big.json()).error ?? ""));
  const stale = await prep({ cardId: "suite-0", tokenIds, signature: sig, nonce, deadline: Math.floor(Date.now() / 1000) - 10 });
  check("an expired deadline is refused", stale.status === 400 && /expired/i.test((await stale.json()).error ?? ""));
  const badSig = await prep({ cardId: "suite-0", tokenIds, signature: "0x" + "11".repeat(65), nonce: crypto.randomUUID(), deadline });
  check("a bad signature is refused", badSig.status === 400 && /invalid signature/i.test((await badSig.json()).error ?? ""));

  // Two cards, one signature: both should get past every new check and stop
  // only at resolveWallet, because this fixture's wallet is not a Privy one.
  const n2 = crypto.randomUUID();
  const sig2 = await privyWallet.signTypedData(domain, types, {
    tokenIds: tokenIds.map(String), to: privyWallet.address, userId: uid, nonce: n2, deadline: String(deadline),
  });
  const c0 = await prep({ cardId: "suite-0", tokenIds, signature: sig2, nonce: n2, deadline });
  const c1 = await prep({ cardId: "suite-1", tokenIds, signature: sig2, nonce: n2, deadline });
  const c0b = await c0.json(); const c1b = await c1.json();
  check("card 1 of a batch passes the new checks", c0.status === 400 && /not one Gachard can return/i.test(c0b.error ?? ""), `${c0.status} ${c0b.error}`);
  check("card 2 of the same signature passes too", c1.status === 400 && /not one Gachard can return/i.test(c1b.error ?? ""), `${c1.status} ${c1b.error}`);
  const replay = await prep({ cardId: "suite-0", tokenIds, signature: sig2, nonce: n2, deadline });
  check("replaying a card under one signature is 409", replay.status === 409, String(replay.status));
  const nonces = db.collection("privy_nonces");
  check("one nonce row per card", (await nonces.countDocuments({ batchNonce: n2 })) === 2);
  check("one batch marker, so the limit counted once", (await nonces.countDocuments({ nonce: n2, batchMarker: true })) === 1);

  // ================= G. rate limits =================
  group("G. Rate limits");
  const probe = "suite-rl-" + Date.now();
  const firstDenied = async (action: string, max?: number) => {
    for (let i = 1; i <= 25; i++) {
      const r = max === undefined ? await checkRateLimit(probe, action) : await checkRateLimit(probe, action, max);
      if (!r.allowed) return i;
    }
    return null;
  };
  check("ADR-006 default still denies on the 6th", (await firstDenied("suite_default")) === 6);
  check("an explicit ceiling of 20 denies on the 21st", (await firstDenied("suite_import", 20)) === 21);
  await db.collection("rate_limits").deleteMany({ userId: probe });

  // ================= H. reconciliation =================
  group("H. Reconciliation");
  await db.collection("transactions").insertOne({
    userId: uid, type: "privy_import", tokenId: 970003, tokenIds: [970003], rarity: 3,
    templateIds: [tpl[3].templateId], privyTxId: "suite-tx-1", txHash: null, status: "pending",
    contractAddress: process.env.CONTRACT_ADDRESS, fromAddress: privyWallet.address, toAddress: OWNER,
    createdAt: now, updatedAt: now,
  });
  await db.collection("cards").updateOne({ cardId: "suite-3" }, { $set: { importTxId: "suite-tx-1" } });
  // The fixture's tokens do not exist on chain, so balanceOf is 0 everywhere:
  // a card marked Exported with nobody holding it must be left alone, not
  // "repaired" into the wrong state.
  const rec = await reconcileExportedCards(10, OWNER);
  const touched = rec.filter((x) => x.changed);
  check("broad sweep scopes by ownerAddress and finds the cards", rec.length > 0, `scanned ${rec.length}`);
  check("a card nobody holds is not wrongly repaired", touched.length === 0, JSON.stringify(touched));
  const stillPending = await db.collection("transactions").findOne({ privyTxId: "suite-tx-1" });
  check("its history row is left pending too", stillPending?.status === "pending");

  // The narrow variant is what runs on every collection load, so what it
  // selects matters as much as what it does.
  const narrow = await reconcileStuckTransfers(5, OWNER);
  check(
    "narrow pass picks up the mid-flight card",
    narrow.some((x) => x.cardId === "suite-3"),
    JSON.stringify(narrow.map((x) => x.cardId))
  );
  check(
    "narrow pass skips settled cards, so a page load costs nothing extra",
    narrow.length === 1,
    `selected ${narrow.length}`
  );
  const t0 = Date.now();
  await reconcileStuckTransfers(2, "0x0000000000000000000000000000000000000000");
  check("nothing stuck means no RPC at all", Date.now() - t0 < 400, `${Date.now() - t0}ms`);

  // ================= I. privy binding =================
  group("I. Privy binding");
  const noTok = await post("/api/user/privy", {}, session);
  check("binding without a token is 400", noTok.status === 400);
  const badTok = await post("/api/user/privy", { authToken: "not-a-jwt" }, session);
  check("binding with an unverifiable token is 401", badTok.status === 401, String(badTok.status));
  check("binding is refused without a session", (await post("/api/user/privy", { authToken: "x" })).status === 401);

  // ================= J. removed surfaces =================
  group("J. Removed surfaces");
  check("the advanced-access endpoint is gone", (await get("/api/user/advanced", session)).status === 404);

  // ================= H2. supply integrity =================
  // A compromised admin key can mintBatch without limit (ADR-036). This is the
  // detection, and the behaviour worth testing is that it survives deletion:
  // the first version counted mint transactions, so clean-slate and every test
  // fixture made Gachard's own mints look unexplained. It took a false alarm in
  // production to see it. A detector that cries wolf is worse than none.
  group("H2. Supply integrity");

  const baselines = db.collection("chain_baseline");
  const savedBaseline = await baselines.findOne({ _id: "token-supply" as never });

  await baselines.deleteOne({ _id: "token-supply" as never });
  const first = await checkSupplyIntegrity();
  check("a first run adopts the chain rather than alarming", first.unexplained === 0, String(first.unexplained));
  check("it knows the chain's last issued id", first.highestKnownTokenId === first.chainNextTokenId - 1);

  const quiet = await checkSupplyIntegrity();
  check("a quiet run stays quiet", quiet.unexplained === 0, String(quiet.unexplained));

  // Tokens on chain beyond anything Gachard has acknowledged.
  await baselines.updateOne(
    { _id: "token-supply" as never },
    { $set: { highestKnownTokenId: first.chainNextTokenId - 41 } }
  );
  const alarmed = await checkSupplyIntegrity();
  check("unexplained minting is reported", alarmed.unexplained === 40, String(alarmed.unexplained));

  const stillAlarmed = await checkSupplyIntegrity();
  check("the alarm does not clear itself on the next check", stillAlarmed.unexplained === 40, String(stillAlarmed.unexplained));

  // The regression that caused a false alarm in production: wiping the
  // collections that record mints must not change the reading.
  const before = (await checkSupplyIntegrity()).unexplained;
  await db.collection("transactions").deleteMany({ type: "mint", userId: "no-such-user" });
  check("deleting mint records does not move the reading", (await checkSupplyIntegrity()).unexplained === before, String(before));

  // A real mint claims its ids and quiets the alarm.
  await recordMintedUpTo([first.chainNextTokenId - 1]);
  const resolved = await checkSupplyIntegrity();
  check("acknowledging the tokens clears it", resolved.unexplained === 0, String(resolved.unexplained));

  // And a late, lower id must not drag the mark backwards.
  await recordMintedUpTo([1]);
  check("an older id cannot lower the high-water mark", (await checkSupplyIntegrity()).unexplained === 0);

  if (savedBaseline) {
    await baselines.replaceOne({ _id: "token-supply" as never }, savedBaseline, { upsert: true });
  }


  // ================= I1. buying, end to end over HTTP =================
  // The route itself was never exercised. These checks go through the real
  // endpoint with a real session, so the money arithmetic is tested where it
  // actually runs rather than in a helper beside it.
  //
  // The on-chain transfer is left to fail on purpose: the token does not
  // exist, so the contract's balanceOf require reverts during ethers'
  // gas estimation and nothing is ever submitted. No gas is spent, and the
  // route's refund path is the part worth proving — a buyer must get back
  // exactly what they paid, with no fee asymmetry hiding in the rounding.
  group("I1. Buying over HTTP");

  const otherSeller = new ObjectId().toString();
  const BUY_PRICE = 300;
  await db.collection("listings").deleteMany({ listingId: "suite-l3" });
  await db.collection("listings").insertOne({
    listingId: "suite-l3", cardId: "suite-4", tokenId: 970004,
    templateId: tpl[0].templateId, sellerId: otherSeller,
    sellerWalletAddress: OWNER, price: BUY_PRICE, status: "active", createdAt: now,
  });

  const { addCrystal: give, getCrystalBalance: bal } = await import("../lib/crystal");
  await db.collection("crystal_balances").deleteMany({ userId: { $in: [uid, otherSeller] } });
  await give(uid, 1000);

  const buyRes = await post("/api/marketplace/listings/suite-l3/buy", {}, session);
  const buyBody = await buyRes.json().catch(() => null);
  check(
    "a failed on-chain transfer is reported, not swallowed",
    buyRes.status === 500 && /refunded/i.test(buyBody?.error ?? ""),
    `${buyRes.status} ${buyBody?.error ?? ""}`
  );
  check("the buyer is refunded to the exact starting balance", (await bal(uid)) === 1000, String(await bal(uid)));
  check("no fee is skimmed on the refund", (await bal(uid)) === 1000);
  check("the seller receives nothing for a sale that did not happen", (await bal(otherSeller)) === 0, String(await bal(otherSeller)));
  const relisted = await db.collection("listings").findOne({ listingId: "suite-l3" });
  check("the listing goes back to active", relisted?.status === "active", String(relisted?.status));

  await db.collection("listings").deleteMany({ listingId: "suite-l3" });
  await db.collection("crystal_balances").deleteMany({ userId: { $in: [uid, otherSeller] } });

  // ================= I2. a stuck marketplace purchase =================
  // The buy route waits about three seconds for the receipt. If it does not
  // arrive it writes five pending* fields on the card — and nothing read any
  // of them, so the buyer's Crystal was spent, the card stayed with the
  // seller, and the seller was never paid. The sweep in /api/cards even marked
  // the row confirmed while none of that was repaired.
  //
  // The property that matters is exactly-once. This settlement runs on every
  // page load, and paying a seller twice would create Crystal from nothing.
  group("I2. Stuck marketplace purchase");

  const sellerId = new ObjectId().toString();
  const buyerId = new ObjectId().toString();
  const PRICE = 500;
  const stuckToken = 970010;

  const makeStuck = async () => {
    await db.collection("cards").deleteMany({ tokenId: stuckToken });
    await db.collection("cards").insertOne({
      cardId: "suite-stuck", tokenId: stuckToken, templateId: tpl[0].templateId,
      rarity: 0, ownerAddress: OWNER, status: "pending", isListed: false,
      listingId: "suite-l2", fulfillmentStatus: null, viewed: true, createdAt: now,
      pendingBuyerId: buyerId, pendingBuyerWallet: "0x00000000000000000000000000000000000000bb",
      pendingSellerId: sellerId, pendingListingPrice: PRICE, pendingTxHash: "0xdeadbeef",
    });
    await db.collection("crystal_balances").deleteMany({ userId: { $in: [sellerId, buyerId] } });
  };

  const cardsCol = db.collection("cards");
  const soldTx = { tokenId: stuckToken, toAddress: "0x00000000000000000000000000000000000000bb" };

  await makeStuck();
  await settleMarketplacePurchase(cardsCol as never, soldTx as never);
  const afterOne = await cardsCol.findOne({ tokenId: stuckToken });
  check("the card moves to the buyer", afterOne?.ownerAddress === soldTx.toAddress, String(afterOne?.ownerAddress));
  check("its status is no longer pending", afterOne?.status === "Digital", String(afterOne?.status));
  check("the pending fields are cleared", afterOne?.pendingSellerId === undefined);
  check("the seller is paid the whole price, no fee", (await getCrystalBalance(sellerId)) === PRICE, String(await getCrystalBalance(sellerId)));

  // The point of the latch.
  await settleMarketplacePurchase(cardsCol as never, soldTx as never);
  await settleMarketplacePurchase(cardsCol as never, soldTx as never);
  check("running it again pays nothing more", (await getCrystalBalance(sellerId)) === PRICE, String(await getCrystalBalance(sellerId)));

  // A transfer that landed and reverted: the buyer gets their Crystal back and
  // the listing is sellable again.
  await makeStuck();
  await db.collection("listings").deleteMany({ listingId: "suite-l2" });
  await db.collection("listings").insertOne({
    listingId: "suite-l2", cardId: "suite-stuck", tokenId: stuckToken,
    templateId: tpl[0].templateId, sellerId, sellerWalletAddress: OWNER,
    price: PRICE, status: "sold", createdAt: now,
  });
  await unwindMarketplacePurchase(db as never, cardsCol as never, soldTx as never);
  check("a reverted transfer refunds the buyer", (await getCrystalBalance(buyerId)) === PRICE, String(await getCrystalBalance(buyerId)));
  check("it does not pay the seller", (await getCrystalBalance(sellerId)) === 0, String(await getCrystalBalance(sellerId)));
  check("the listing goes back to active", (await db.collection("listings").findOne({ listingId: "suite-l2" }))?.status === "active");
  await unwindMarketplacePurchase(db as never, cardsCol as never, soldTx as never);
  check("unwinding again refunds nothing more", (await getCrystalBalance(buyerId)) === PRICE, String(await getCrystalBalance(buyerId)));

  await db.collection("cards").deleteMany({ tokenId: stuckToken });
  await db.collection("listings").deleteMany({ listingId: "suite-l2" });
  await db.collection("crystal_balances").deleteMany({ userId: { $in: [sellerId, buyerId] } });

  // ================= J2. the public admin tier =================
  // The console is public so the print flow can be followed without an
  // account. It was also returning the buyer's email, the recipient's name,
  // phone and home address, and the decrypted redeem code — which is the
  // bearer credential for a physical card (ADR-007), so publishing it handed
  // the card to anyone who asked.
  group("J2. Public admin endpoints carry no people");
  const PUBLIC_ADMIN = [
    "/api/admin/print-requests",
    "/api/admin/transactions",
    "/api/admin/cards",
    "/api/admin/pending-cards",
  ];
  const PERSONAL = [
    '"email"', '"recipientName"', '"phone"', '"addressLine1"', '"postalCode"',
    '"redeemCode"', '"userId"', '"ownerAddress"', '"ownerName"', '"redeemer"',
  ];
  for (const path of PUBLIC_ADMIN) {
    const body = await (await get(path)).text();
    const leaked = PERSONAL.filter((k) => body.includes(k));
    check(`${path} leaks nothing personal`, leaked.length === 0, leaked.join(" "));
  }

  // The marker the proxy sets is an ordinary header, so it has to be stripped
  // from every incoming request. Without that, typing it into curl would be
  // indistinguishable from the gate's own word and the lock would be decor.
  const forged = await fetch(`${BASE}/api/admin/print-requests`, {
    headers: { "x-gachard-admin": "1" },
  });
  const forgedBody = await forged.text();
  check(
    "a forged x-gachard-admin header is ignored",
    PERSONAL.every((k) => !forgedBody.includes(k)),
    PERSONAL.filter((k) => forgedBody.includes(k)).join(" ")
  );

  // And the fields are withheld, not deleted: a real admin still gets them.
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    const basic =
      "Basic " +
      Buffer.from(`${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`).toString("base64");
    const asAdmin = await fetch(`${BASE}/api/admin/print-requests`, {
      headers: { authorization: basic },
    });
    const adminBody = await asAdmin.text();
    const hasRows = adminBody.includes('"txId"');
    check(
      "an authenticated admin still gets the personal fields",
      !hasRows || adminBody.includes('"shippingAddress"'),
      hasRows ? "rows present but shippingAddress absent" : "no rows to judge"
    );
  }

  // ================= K0. the on-demand reconcile =================
  // The branch it exists for — a card moved into the wallet from outside
  // Gachard — cannot be built here: it needs an address that really holds a
  // token on Monad, and this fixture's wallets are freshly generated. That
  // branch was verified against real chain state. What is checked here is the
  // route around it: that it is gated, and that it answers in the shape the
  // Refresh button reads.
  group("K. On-demand reconcile");
  check("reconcile without a session is refused", (await post("/api/privy/reconcile", {})).status === 401);
  const recRes = await post("/api/privy/reconcile", {}, session);
  const recBody = await recRes.json().catch(() => null);
  check("reconcile with a session is accepted", recRes.status === 200, String(recRes.status));
  check("it reports how many cards changed", typeof recBody?.changed === "number");
  check("it lists what it looked at", Array.isArray(recBody?.results));

  // ================= K2. a released card =================
  group("L. Released cards");
  const cardsBody = await (await get("/api/cards", session)).json();
  const released = (cardsBody.cards ?? []).find((c: Record<string, unknown>) => c.cardId === "suite-5");
  check("a released card is still listed", !!released);
  check("it does not claim to be Digital", released?.displayStatus !== "Digital", String(released?.displayStatus));
  check("it reads as Sent Away", released?.displayStatus === "Sent Away", String(released?.displayStatus));

  // ================= M. scanned QR payloads =================
  // Both QR codes hold a URL, not an id. Claim Shipping compared the whole URL
  // against a bare claimId and refused every card; these are the shapes a
  // scanner actually produces.
  group("M. Scanned QR payloads");
  const ORIGIN = "https://gachard-monad.vercel.app";
  const sc = (t: string) => parseScannedCode(t);
  check("a claim QR yields its claimId", sc(`${ORIGIN}/scan?claimId=1fa28e07`).claimId === "1fa28e07");
  check("a card QR yields its cardId", sc(`${ORIGIN}/scan?cardId=092ba`).cardId === "092ba");
  check("a claim QR is not mistaken for a card", sc(`${ORIGIN}/scan?claimId=1fa28e07`).cardId === null);
  check("surrounding whitespace is ignored", sc(` ${ORIGIN}/scan?claimId=1fa28e07 `).claimId === "1fa28e07");
  check("extra query params do not break it", sc(`${ORIGIN}/scan?claimId=1fa28e07&utm=x`).claimId === "1fa28e07");
  check("a bare claimId still works", sc("1fa28e07").claimId === "1fa28e07");
  check("a bare 5-char cardId is a card, not a claim", sc("092ba").claimId === null && sc("092ba").cardId === "092ba");
  check("one of our URLs carrying no code yields nothing", sc(`${ORIGIN}/scan`).claimId === null && sc(`${ORIGIN}/scan`).cardId === null);
  check("someone else's QR yields nothing", sc("https://example.com/hello").cardId === null);

  // ================= N. scan history =================
  // The scan page used to cap history at ten with no way past it, while
  // telling the user they would see the full history. An eleventh transaction
  // silently dropped the first one — where the card came from, which is the
  // part of provenance that matters most — and nothing anywhere errored.
  group("N. Scan history");
  const HIST = 8;
  const histBase = Date.now() - HIST * 60_000;
  await db.collection("transactions").insertMany(
    Array.from({ length: HIST }, (_, i) => ({
      _id: new ObjectId(), userId: uid, type: i === 0 ? "mint" : "sold",
      tokenId: 970000, tokenIds: [970000], status: "confirmed", txHash: null,
      fromAddress: "vault", toAddress: "vault",
      createdAt: new Date(histBase + i * 60_000).toISOString(),
    }))
  );
  const recent = await (await get("/api/scan?cardId=suite-0")).json();
  check("the scan opens with the five most recent", recent.history?.length === 5, String(recent.history?.length));
  check("it reports the true total", recent.historyTotal === HIST, String(recent.historyTotal));
  const full = await (await get("/api/scan?cardId=suite-0&history=all")).json();
  check("the full view returns every transaction", full.history?.length === HIST, String(full.history?.length));
  check("including the first one, where the card came from", full.history?.at(-1)?.type === "mint", String(full.history?.at(-1)?.type));

  // ================= O. public names =================
  // The scan page showed owners by `username`, which is the email's local
  // part. The endpoint is public and cardIds are five hex characters, so every
  // owner's email minus its domain could be collected by script. Owners are
  // now shown by a name they chose, or an anonymous label.
  group("O. Public names");

  check("names are refused unauthenticated", (await get("/api/user/display-name")).status === 401);

  const nm0 = await (await get("/api/user/display-name", session)).json();
  check("an unnamed user gets an anonymous label", /^Collector #[0-9A-F]{6}$/.test(nm0.fallback ?? ""), String(nm0.fallback));

  // Rules, checked directly so the rate limit is spent on the HTTP checks.
  check("too short is refused", !checkDisplayName("ab").ok);
  check("non-ASCII is refused, so a Cyrillic a cannot pass as Latin", !checkDisplayName("G\u0430chard").ok);
  check("a name that mimics the platform is refused", !checkDisplayName("Gachard Vault").ok);
  check("punctuation does not get around the reserved words", !checkDisplayName("G.a.c.h.a.r.d").ok);
  check("a name that mimics the anonymous label is refused", !checkDisplayName("Collector 1").ok);
  check("an ordinary name is accepted", checkDisplayName("Card Hunter").ok);

  const badHttp = await post("/api/user/display-name", { displayName: "Gachard Vault" }, session);
  check("the route refuses a reserved name", badHttp.status === 400, String(badHttp.status));

  const PICKED = "Suite Hunter";
  const setRes = await post("/api/user/display-name", { displayName: PICKED }, session);
  check("a valid name is saved", setRes.status === 200, String(setRes.status));

  const scanNamed = await (await get("/api/scan?cardId=suite-0")).text();
  check("the scan shows the chosen name", scanNamed.includes(PICKED));
  check("the scan never shows the username", !scanNamed.includes("@suite") && !scanNamed.includes('"suite"'));

  // A name is chosen once. Renaming, and releasing (which would allow a
  // rename by claiming again), both need a grant on the account.
  const again = await post("/api/user/display-name", { displayName: "Another Hunter" }, session);
  check("a second name is refused", again.status === 403, String(again.status));
  const giveUp = await post("/api/user/display-name", { displayName: "" }, session);
  check("releasing without a grant is refused too", giveUp.status === 403, String(giveUp.status));
  const afterOnce = await (await get("/api/user/display-name", session)).json();
  check("the name is unchanged and the profile is told it cannot change", afterOnce.displayName === PICKED && afterOnce.canChange === false);
  await db.collection("rate_limits").deleteMany({ userId: uid });

  // Private hides the name from scans but keeps it reserved. Hiding a name
  // and giving it up are different acts; a collector who goes quiet for a week
  // must not come back to find someone else wearing their name.
  const hid = await (await post("/api/user/display-name", { hidden: true }, session)).json();
  check("a name can be made private", hid.hidden === true && hid.displayName === PICKED);
  const scanHidden = await (await get("/api/scan?cardId=suite-0")).text();
  check("a private name is not shown on scans", !scanHidden.includes(PICKED));
  check("scans show the anonymous label instead", scanHidden.includes(nm0.fallback));

  // A second account tries to take the name while it is private.
  const otherId = new ObjectId();
  await db.collection("users").insertOne({
    _id: otherId, email: "suite-other@gachard.test", username: "suite-other",
    walletAddress: ethers.Wallet.createRandom().address, crystalBalance: 0, createdAt: now,
  });
  const ots = Math.floor(Date.now() / 1000);
  const opl = `${otherId.toString()}.${ots}`;
  const otherSession = `gachard_session=${opl}.${createHmac("sha256", Buffer.from(process.env.ENCRYPTION_SECRET_KEY!, "utf8")).update(opl).digest("hex")}`;
  const dup = await post("/api/user/display-name", { displayName: PICKED.toUpperCase() }, otherSession);
  check("a private name cannot be claimed by anyone else", dup.status === 409, String(dup.status));

  await db.collection("rate_limits").deleteMany({ userId: uid });
  const shown = await (await post("/api/user/display-name", { hidden: false }, session)).json();
  check("making it public again restores it", shown.hidden === false);
  check("and scans show it again", (await (await get("/api/scan?cardId=suite-0")).text()).includes(PICKED));

  // A grant allows exactly one change, and the change spends it.
  await db.collection("users").updateOne({ _id: new ObjectId(uid) }, { $set: { nameChangeGranted: true } });
  check("a grant is visible to the profile", (await (await get("/api/user/display-name", session)).json()).canChange === true);
  const renamed = await post("/api/user/display-name", { displayName: "Suite Hunter Two" }, session);
  check("with a grant, the name can be changed", renamed.status === 200, String(renamed.status));
  const takeOld = await post("/api/user/display-name", { displayName: PICKED }, otherSession);
  check("the name given up by renaming is free for someone else", takeOld.status === 200, String(takeOld.status));
  const third = await post("/api/user/display-name", { displayName: "Suite Hunter Three" }, session);
  check("and the grant is spent by that change", third.status === 403, String(third.status));
  await db.collection("rate_limits").deleteMany({ userId: uid });

  // Releasing is the only thing that frees a name, and it also needs a grant.
  await db.collection("users").updateOne({ _id: new ObjectId(uid) }, { $set: { nameChangeGranted: true } });
  const cleared = await (await post("/api/user/display-name", { displayName: "" }, session)).json();
  check("releasing a name returns to the anonymous label", cleared.displayName === null);
  const scanAnon = await (await get("/api/scan?cardId=suite-0")).text();
  check("the scan then shows the anonymous label", scanAnon.includes(nm0.fallback));
  check("the released account may choose again, as a first choice", cleared.canChange === true);
  const taken = await post("/api/user/display-name", { displayName: PICKED.toLowerCase() }, session);
  check("but not a name someone else now holds", taken.status === 409, String(taken.status));
  const reclaim = await post("/api/user/display-name", { displayName: "Suite Hunter Two" }, session);
  check("a released name is free again", reclaim.status === 200, String(reclaim.status));
  // The admin Users panel shows the same name and label, not the username.
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    const basic = "Basic " + Buffer.from(`${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`).toString("base64");
    const list = await (await fetch(`${BASE}/api/admin/users`, { headers: { authorization: basic } })).json();
    const row = (list.users ?? []).find((x: { id: string }) => x.id === uid);
    check("the admin Users panel shows the public name and collector ID",
      row?.displayName === "Suite Hunter Two" && row?.collectorId === nm0.fallback && row?.displayNameHidden === false,
      JSON.stringify(row));
    check("and not the username", row !== undefined && !("username" in row));
    const adminCards = await (await fetch(`${BASE}/api/admin/cards`, { headers: { authorization: basic } })).json();
    const owned = (adminCards.cards ?? []).find((x: { cardId: string }) => x.cardId === "suite-0");
    check("the Cards panel names the owner the same way", owned?.ownerName === "Suite Hunter Two", JSON.stringify(owned?.ownerName));
  }
  await db.collection("users").deleteOne({ _id: otherId });
  await db.collection("rate_limits").deleteMany({ userId: otherId.toString() });

  group("P. Stuck in flight (ADR-037)");
  {
    const ago = (m: number) => new Date(Date.now() - m * 60000).toISOString();
    const H_STUCK = "0x" + "a1".repeat(32);
    const H_FRESH = "0x" + "a2".repeat(32);
    const H_DONE = "0x" + "a3".repeat(32);
    const H_PEND = "0x" + "a4".repeat(32);
    await db.collection("transactions").insertMany([
      // waiting 25 minutes: stuck
      { userId: uid, type: "privy_send", tokenId: 970103, txHash: H_STUCK, status: "pending", createdAt: ago(25), updatedAt: ago(25) },
      // just started: in flight, not stuck
      { userId: uid, type: "redeem", tokenId: 970104, txHash: H_FRESH, status: "pending", createdAt: ago(1), updatedAt: ago(1) },
      // the record says done, but the card below never left pending
      { userId: uid, type: "sold", tokenId: 970101, txHash: H_DONE, status: "confirmed", createdAt: ago(30), updatedAt: ago(30) },
      // pending, and its card is pending too: one problem, not two
      { userId: uid, type: "sold", tokenId: 970102, txHash: H_PEND, status: "pending", createdAt: ago(30), updatedAt: ago(30) },
    ]);
    await db.collection("cards").insertMany([
      { cardId: "suite-p1", tokenId: 970101, templateId: tpl[0].templateId, rarity: 0, ownerAddress: OWNER, status: "pending", pendingBuyerId: "suite-buyer", pendingTxHash: H_DONE, viewed: true, createdAt: ago(30), updatedAt: ago(30) },
      { cardId: "suite-p2", tokenId: 970102, templateId: tpl[0].templateId, rarity: 0, ownerAddress: OWNER, status: "pending", pendingBuyerId: "suite-buyer", pendingTxHash: H_PEND, viewed: true, createdAt: ago(30), updatedAt: ago(30) },
    ]);

    const res = await get("/api/admin/in-flight");
    check("the panel is readable without unlocking", res.status === 200, String(res.status));
    const text = await res.text();
    const r = JSON.parse(text) as { inFlight: number; stuck: number; rows: { source: string; kind: string; cardId: string | null; txHash: string | null; ageMinutes: number }[] };
    check("it names no user", !text.includes("userId") && !text.includes(uid) && !text.includes("suite-buyer") && !text.includes(EMAIL));
    const stuckTx = r.rows.find((x) => x.txHash === H_STUCK);
    check("a transaction pending for 25 minutes is listed as stuck", stuckTx?.kind === "Send out of Gachard" && stuckTx.ageMinutes >= 25, JSON.stringify(stuckTx));
    check("one started a minute ago is in flight but not stuck", !r.rows.some((x) => x.txHash === H_FRESH) && r.inFlight > r.stuck);
    const orphan = r.rows.find((x) => x.cardId === "suite-p1");
    check("a card still pending after its record says confirmed is listed", orphan?.source === "card" && orphan.kind === "Marketplace purchase", JSON.stringify(orphan));
    check("a pending card behind a pending transaction is listed once, not twice",
      !r.rows.some((x) => x.cardId === "suite-p2") && r.rows.some((x) => x.txHash === H_PEND));

    await db.collection("cards").deleteMany({ cardId: { $in: ["suite-p1", "suite-p2"] } });
    await db.collection("transactions").deleteMany({ userId: uid, txHash: { $in: [H_STUCK, H_FRESH, H_DONE, H_PEND] } });
    const after = await (await get("/api/admin/in-flight")).json();
    check("once settled, they leave the panel", !after.rows.some((x: { txHash: string | null; cardId: string | null }) => [H_STUCK, H_PEND].includes(x.txHash ?? "") || x.cardId === "suite-p1"));
  }

  group("Q. Print queue: owner or admin (19 October)");
  {
    const TOKEN = 970200;
    await db.collection("cards").deleteMany({ cardId: "suite-print" });
    await db.collection("cards").insertOne({
      cardId: "suite-print", tokenId: TOKEN, templateId: tpl[0].templateId, rarity: 0,
      ownerAddress: OWNER, status: "Vaulted", fulfillmentStatus: "Locked", isListed: false, viewed: true, createdAt: now,
    });
    await db.collection("transactions").insertOne({
      userId: uid, type: "print", tokenId: TOKEN, tokenIds: [TOKEN], status: "confirmed", txHash: null, createdAt: now,
    });
    await db.collection("rate_limits").deleteMany({ userId: uid });

    // A stranger with no session.
    const anon = await post("/api/admin/fulfillment", { tokenId: TOKEN, action: "Processing" });
    check("without a session, the print queue refuses", anon.status === 401, String(anon.status));

    // Another signed-in account that does not own the card.
    const strangerId = new ObjectId();
    await db.collection("users").insertOne({
      _id: strangerId, email: "suite-stranger@gachard.test", username: "suite-stranger",
      walletAddress: ethers.Wallet.createRandom().address, crystalBalance: 0, createdAt: now,
    });
    const sts = Math.floor(Date.now() / 1000);
    const spl = `${strangerId.toString()}.${sts}`;
    const strangerSession = `gachard_session=${spl}.${createHmac("sha256", Buffer.from(process.env.ENCRYPTION_SECRET_KEY!, "utf8")).update(spl).digest("hex")}`;
    const other = await post("/api/admin/fulfillment", { tokenId: TOKEN, action: "Processing" }, strangerSession);
    check("another account cannot advance someone else's card", other.status === 403, String(other.status));

    const listAnon = await (await get("/api/admin/print-requests")).json();
    const rowAnon = (listAnon.printRequests ?? []).find((x: { tokenId: number }) => x.tokenId === TOKEN);
    check("an anonymous viewer is not told the card is theirs", rowAnon?.mine === false, JSON.stringify(rowAnon?.mine));
    const listOwner = await (await get("/api/admin/print-requests", session)).json();
    const rowOwner = (listOwner.printRequests ?? []).find((x: { tokenId: number }) => x.tokenId === TOKEN);
    check("the owner is told the card is theirs", rowOwner?.mine === true, JSON.stringify(rowOwner?.mine));
    check("and still receives none of the personal fields", rowOwner !== undefined && !("user" in rowOwner) && !("redeemCode" in rowOwner));

    const own = await post("/api/admin/fulfillment", { tokenId: TOKEN, action: "Processing" }, session);
    check("the owner can advance their own card", own.status === 200, String(own.status));
    check("and the queue moved", (await db.collection("cards").findOne({ cardId: "suite-print" }))?.fulfillmentStatus === "Processing");

    const skip = await post("/api/admin/fulfillment", { tokenId: TOKEN, action: "Shipping" }, session);
    check("the owner still cannot skip a step", skip.status === 400, String(skip.status));

    if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
      const basic = "Basic " + Buffer.from(`${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`).toString("base64");
      const asAdmin = await fetch(`${BASE}/api/admin/fulfillment`, {
        method: "POST", headers: { "content-type": "application/json", authorization: basic },
        body: JSON.stringify({ tokenId: TOKEN, action: "Printed" }),
      });
      check("an admin can still advance any card", asAdmin.status === 200, String(asAdmin.status));
    }

    // Other state-changing admin routes stay admin-only.
    const confirmAll = await post("/api/admin/confirm-all", {}, session);
    check("confirm-all stays admin-only for a signed-in user", confirmAll.status === 401, String(confirmAll.status));

    await db.collection("users").deleteOne({ _id: strangerId });
    await db.collection("rate_limits").deleteMany({ userId: { $in: [uid, strangerId.toString()] } });
    await db.collection("cards").deleteMany({ cardId: "suite-print" });
  }

  group("R. Redeem code for the owner of a claimed card (demo, 19 October)");
  {
    const TOKEN = 970210;
    const CODE = "SUITE-CODE-" + Date.now();
    await db.collection("cards").deleteMany({ cardId: "suite-claimed" });
    await db.collection("cards").insertOne({
      cardId: "suite-claimed", tokenId: TOKEN, templateId: tpl[0].templateId, rarity: 0,
      ownerAddress: OWNER, status: "Vaulted", fulfillmentStatus: "Shipping", isListed: false, viewed: true, createdAt: now,
    });
    await db.collection("redeem_codes").insertOne({ tokenId: TOKEN, txId: "suite-redeem-tx", codeEncrypted: encrypt(CODE), status: "active", createdAt: now });
    await db.collection("rate_limits").deleteMany({ userId: uid });

    check("without a session, the code is refused", (await get(`/api/cards/${TOKEN}/redeem-code`)).status === 401);
    const early = await get(`/api/cards/${TOKEN}/redeem-code`, session);
    check("before the shipment is claimed, the owner is refused", early.status === 400, String(early.status));

    await db.collection("cards").updateOne({ cardId: "suite-claimed" }, { $set: { status: "Real", fulfillmentStatus: "Real" } });
    const ok = await get(`/api/cards/${TOKEN}/redeem-code`, session);
    const okBody = await ok.json();
    check("after the claim, the owner gets the code", ok.status === 200 && okBody.code === CODE, String(ok.status));
    check("and the response is not cached", (ok.headers.get("cache-control") ?? "").includes("no-store"));

    const otherId = new ObjectId();
    await db.collection("users").insertOne({
      _id: otherId, email: "suite-peek@gachard.test", username: "suite-peek",
      walletAddress: ethers.Wallet.createRandom().address, crystalBalance: 0, createdAt: now,
    });
    const ots = Math.floor(Date.now() / 1000);
    const opl = `${otherId.toString()}.${ots}`;
    const otherSession = `gachard_session=${opl}.${createHmac("sha256", Buffer.from(process.env.ENCRYPTION_SECRET_KEY!, "utf8")).update(opl).digest("hex")}`;
    const peek = await get(`/api/cards/${TOKEN}/redeem-code`, otherSession);
    check("another account cannot read someone else's code", peek.status === 403, String(peek.status));

    await db.collection("redeem_codes").updateMany({ tokenId: TOKEN }, { $set: { status: "claimed" } });
    const used = await get(`/api/cards/${TOKEN}/redeem-code`, session);
    check("a used code is not handed out again", used.status === 404, String(used.status));

    await db.collection("users").deleteOne({ _id: otherId });
    await db.collection("rate_limits").deleteMany({ userId: { $in: [uid, otherId.toString()] } });
    await db.collection("redeem_codes").deleteMany({ tokenId: TOKEN });
    await db.collection("cards").deleteMany({ cardId: "suite-claimed" });
  }

  // ---- cleanup ----
  await db.collection("cards").deleteMany({ cardId: { $regex: "^suite-" } });
  await db.collection("cards").deleteMany({ ownerAddress: OWNER });
  await db.collection("users").deleteMany({ email: EMAIL });
  await db.collection("listings").deleteMany({ listingId: { $regex: "^suite-" } });
  await db.collection("transactions").deleteMany({ userId: uid });
  await db.collection("transactions").deleteMany(SUITE_TX);
  await db.collection("privy_nonces").deleteMany({ userId: uid });
  await db.collection("rate_limits").deleteMany({ userId: uid });

  const leftovers =
    (await db.collection("cards").countDocuments({ ownerAddress: OWNER })) +
    (await db.collection("users").countDocuments({ email: EMAIL })) +
    (await db.collection("listings").countDocuments({ listingId: "suite-l1" })) +
    (await db.collection("transactions").countDocuments({ userId: uid })) +
    (await db.collection("transactions").countDocuments(SUITE_TX)) +
    (await db.collection("privy_nonces").countDocuments({ userId: uid }));

  console.log(results.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed.   test data left behind: ${leftovers}`);
  await client.close();
  process.exit(fail === 0 ? 0 : 1);
})();
