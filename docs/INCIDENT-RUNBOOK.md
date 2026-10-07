# Incident Runbook — Suspected Admin Key Compromise

*Written 7 October 2026. The reasoning is in ADR-036; this is only what to do.*

Read the first section and act. The explanations are below it, not above it.

---

## 1. Do this first

```powershell
$env:Path += ";$env:USERPROFILE\.foundry\bin"
cd D:\gachard-monad\frontend
npx tsx scripts/emergency-transfer-ownership.ts --confirm
```

The first line is not optional on Windows. Foundry lives in `~/.foundry/bin`
and PowerShell does not know about it, so `cast` later in this runbook fails
with "not recognized". Git Bash already has it. Found during the drill, which
is what drills are for.

**The `--confirm` is required.** Without it the script prints what it would do
and stops. That default exists because the script was once run simply to look
at its output, and it transferred both contracts for real — a tool whose dry
run is indistinguishable from the real thing gets fired by accident sooner or
later, and the accident looks exactly like the emergency.

This moves ownership of **both contracts** to the cold address below.

**GachardCard** — strips the attacker of every `onlyOwner` function at once:
`marketplaceTransfer`, `burnCard`, `redeemCard`, `setAuthorizedMinter`.

**PackEntropy** — its `requestPack` is `onlyOwner` too. A key that can no
longer touch cards can still call it in a loop and burn the entropy budget.
Its balance cannot be stolen outright (there is no withdraw function), but it
can be spent to nothing.

**It is a race.** Whoever calls `transferOwnership` first wins, permanently. The
attacker holds the same key and can do this to us.

**Freeze first, investigate afterwards.** The instinct is to check whether it is
really a compromise, how they got in, what is already gone. That costs ten
minutes, and those ten minutes belong to the attacker. The two mistakes are not
symmetric: freezing on a false alarm costs a few minutes of downtime and is
undone in five, while investigating first on a real one costs cards that cannot
be recovered and possibly the contract itself. Keep the threshold for pressing
this low. The only thing worth checking first is that you are not mid-recording.

### The destination address

```
EMERGENCY_OWNER = 0x97A189d91E8c784Df6F670220D3B7b319Fb6F61e
```

A Ledger account used for nothing else. Set and exercised on 7 October 2026:
ownership of both contracts moved to it and was handed back, so the address is
known good and the device provably signs on this network — the one thing a dry
run can never establish.

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

**The safe drill — run this any time, it moves nothing:**

```bash
cd frontend && npx tsx scripts/emergency-transfer-ownership.ts
```

It prints the current owners, the destination, and who holds minting rights.
That alone catches a wrong or missing address, which is the most likely thing
to be broken.

**The full drill** — actually transferring and handing it back — proves the
hardware wallet can sign on this network, which the dry run cannot. It
**freezes the platform** while ownership is away, so do not run it near a
recording.

Before the full drill, make sure the cold address can transact at all: it needs
Monad Testnet configured in your wallet software and some MON for gas. A frozen
platform plus a cold wallet that cannot sign is a bad place to discover either.

Handing ownership back is done from the cold wallet, not by this script. Two
routes, and the second is the one that actually worked here.

**Explorer plus wallet extension — recommended.** Both contracts are verified
on MonadVision, so there is a real Write Contract form:

    https://testnet.monadvision.com/address/0x2a05a2e3b0e7355b97de593e354063e9474c9d08?tab=Contract
    https://testnet.monadvision.com/address/0x6B53C35e8baBaaBe4DD725573C3f612121764542?tab=Contract

Contract -> Write Contract -> Connect Wallet -> transferOwnership. You see the
function name and the parameter name, and the wallet simulates the call before
you sign, which beats pasting hex nobody can read.

**cast with the hardware wallet directly** is the alternative:

    cast send <CONTRACT> "transferOwnership(address)" <NEW_ADMIN> --ledger --rpc-url https://testnet-rpc.monad.xyz

This failed during the drill with "Could not connect to Ledger device". The
cause is that a wallet extension holds the USB connection — Rabby, MetaMask or
Ledger Live. Close the browser entirely, and quit Ledger Live from the system
tray rather than its window. Blind signing must also be enabled in the Ledger's
Ethereum app, because transferOwnership is a contract call and the device
refuses those by default.

Either way, verify the destination on the hardware wallet's own screen, not the
computer's.
