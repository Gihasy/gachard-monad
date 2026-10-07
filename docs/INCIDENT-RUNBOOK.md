# Incident Runbook — Suspected Admin Key Compromise

*Written 7 October 2026. The reasoning is in ADR-036; this is only what to do.*

Read the first section and act. The explanations are below it, not above it.

---

## 1. Do this first

```bash
cd frontend && npx tsx scripts/emergency-transfer-ownership.ts
```

This moves ownership of **both contracts** to the cold address below.

**GachardCard** — strips the attacker of every `onlyOwner` function at once:
`marketplaceTransfer`, `burnCard`, `redeemCard`, `setAuthorizedMinter`.

**PackEntropy** — its `requestPack` is `onlyOwner` too. A key that can no
longer touch cards can still call it in a loop and burn the entropy budget.
Its balance cannot be stolen outright (there is no withdraw function), but it
can be spent to nothing.

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

**If ownership transferred to the cold address:** nothing is lost. The
contracts are intact and every card stays where it was. Gachard is frozen —
print, redeem, marketplace purchases and dismantle all fail. That is correct.
A frozen platform is a recoverable state.

### Getting back to working, without handing the key back

Transferring ownership freezes; it does not fix. **Do not give ownership back
to the key that leaked** — that returns you to exactly where you started. Make
a new one, and use the hardware wallet as the bridge while you swap it.

1. **Generate a new admin wallet.** New address, new key, created somewhere the
   compromise could not have reached.
2. **Rotate the whole environment, not just that key.** If the attacker reached
   Vercel they took everything in it: `MONGODB_URL`, `ENCRYPTION_SECRET_KEY`,
   `PRIVY_APP_SECRET`, `ADMIN_PASSWORD`. Replacing one of five is not recovery.
3. **Fund the new address** with MON for gas.
4. **From the hardware wallet**, call `transferOwnership` on both contracts to
   the new admin address.
5. **Revoke any minter the attacker added.** Ownership does not revoke minting
   rights — `authorizedMinters` is a separate mapping, and an address granted
   before the freeze keeps it afterwards. The emergency script prints whether
   PackEntropy and the old admin wallet are authorized. Any *other* address
   cannot be listed cheaply, because this RPC caps `eth_getLogs` at a 100-block
   range. Revoke what you know with `setAuthorizedMinter(addr, false)` from the
   new owner, and treat an unexplained reading on the Token Supply Integrity
   panel as evidence that one is still out there.
6. **Check supply integrity** in the admin console before reopening. If it still
   reads unexplained, something is still minting.

The hardware wallet is never the permanent owner. It holds ownership only long
enough for the hot key underneath to be replaced.

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

**Do not reinstall the key that leaked.** It is the most natural thing to do
once the panic passes, because it is the fastest way to make the site work
again, and it undoes everything.

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
