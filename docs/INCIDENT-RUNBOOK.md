# Incident Runbook — Suspected Admin Key Compromise

*Written 7 October 2026. The reasoning is in ADR-036; this is only what to do.*

Read the first section and act. The explanations are below it, not above it.

---

## 1. Do this first

```bash
cd frontend && npx tsx scripts/emergency-transfer-ownership.ts
```

This calls `transferOwnership()` on `GachardCard`, moving ownership to the
cold address below. It strips the attacker of **every** `onlyOwner` function at
once — `marketplaceTransfer`, `burnCard`, `redeemCard`, `setAuthorizedMinter` —
and of the ability to add themselves as a minter.

**It is a race.** Whoever calls `transferOwnership` first wins, permanently. The
attacker holds the same key and can do this to us. Seconds matter; do not stop
to investigate first.

### The destination address

```
EMERGENCY_OWNER = <<< NOT SET — FILL THIS IN BEFORE YOU NEED IT >>>
```

It must be a cold wallet or a multisig **whose keys have never touched a
server**. A second hot key is not a destination; it is the same problem with a
different address.

The script refuses to run while this is unset, which is deliberate: a runbook
whose critical value is blank should fail loudly in a drill rather than
silently at 3am.

---

## 2. How you would know

**The admin console.** The *Token Supply Integrity* panel turns pink and reads
"Unexplained minting" when tokens appear on chain that no Gachard mint
accounts for. It will not clear itself; only a resolved gap quiets it.

**The MON balance.** An unexplained drop in the admin wallet means someone else
is spending its gas.

**Cards moving without a sale.** `MarketplaceTransfer` events with no matching
row in `transactions`.

---

## 3. After the call lands

**If ownership transferred to the cold address:** nothing is lost. The contract
is intact and every card stays where it was. Rotate `ADMIN_PRIVATE_KEY`, work
out how it leaked, and only then restore day-to-day operations — the backend
cannot call `onlyOwner` functions until the cold key signs or hands ownership
to a fresh hot key.

Print, redeem, marketplace purchases and dismantle will fail while this is
true. That is correct. A frozen platform is a recoverable state.

**If the attacker transferred ownership first:** the contract is gone. Do not
rush a replacement. Read ADR-036 on recovery — the short version is that a new
contract returns nothing, re-minting requires knowing who owned what *before*
the compromise, and re-minting is itself a custodial act that breaks the
self-custody promise for exactly the users who chose it.

---

## 4. What not to do

**Do not deploy a new contract first.** It is the slowest possible response and
it recovers nothing. Ownership transfer is the action with a time limit.

**Do not try to out-transfer the attacker card by card.** They have the same
key and the same rights; it is a loop you lose.

**Do not wipe the database.** It is the record of who owned what, and after a
compromise it is the only basis for any recovery. Take a copy before anything
else if you have a spare minute — but not before section 1.

---

## 5. What this cannot protect

Custodial cards, if `ENCRYPTION_SECRET_KEY` leaked with the database. Those
keys are Gachard's, and whoever holds them holds the cards regardless of who
owns the contract. That is what custody means (ADR-020, ADR-036).

Self-custody cards *should* be protected and currently are not:
`marketplaceTransfer` takes no signature from the holder, and an exported card
is still `Digital` on chain. Closing that is the first item for the next
contract (ADR-036).

---

## 6. Drill

Run it once, before you need it. Transferring ownership to the cold address and
back proves the script works, the address is right, and the keys are where you
think they are. Finding out any of those is wrong during an incident is the
expensive way.
