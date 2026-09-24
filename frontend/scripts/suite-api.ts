/**
 * Whole-suite API and logic checks. Throwaway fixture, cleaned up at the end.
 * Run: npx tsx scripts/suite-api.ts   (needs a server on BASE)
 */
import { MongoClient, ObjectId } from "mongodb";
import { createHmac } from "crypto";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

for (const l of fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf-8").split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i > 0) {
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[t.slice(0, i).trim()] = v;
  }
}

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

  const client = new MongoClient(process.env.MONGODB_URL!);
  await client.connect();
  const db = client.db(process.env.DATABASE_NAME || "gachard");

  // ---- fixture ----
  const privyWallet = ethers.Wallet.createRandom();
  await db.collection("cards").deleteMany({ ownerAddress: OWNER });
  await db.collection("users").deleteMany({ email: EMAIL });

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
    '"redeemCode"', '"userId"', '"ownerAddress"', '"ownerUsername"', '"redeemer"',
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

  // ---- cleanup ----
  await db.collection("cards").deleteMany({ ownerAddress: OWNER });
  await db.collection("users").deleteMany({ email: EMAIL });
  await db.collection("listings").deleteMany({ listingId: "suite-l1" });
  await db.collection("transactions").deleteMany({ userId: uid });
  await db.collection("privy_nonces").deleteMany({ userId: uid });
  await db.collection("rate_limits").deleteMany({ userId: uid });

  const leftovers =
    (await db.collection("cards").countDocuments({ ownerAddress: OWNER })) +
    (await db.collection("users").countDocuments({ email: EMAIL })) +
    (await db.collection("listings").countDocuments({ listingId: "suite-l1" })) +
    (await db.collection("transactions").countDocuments({ userId: uid })) +
    (await db.collection("privy_nonces").countDocuments({ userId: uid }));

  console.log(results.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed.   test data left behind: ${leftovers}`);
  await client.close();
  process.exit(fail === 0 ? 0 : 1);
})();
