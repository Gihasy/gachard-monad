# Gachard: Monad Metropolis Hackathon Submission

## Project Overview

Gachard is a digital-to-physical trading card game (TCG) platform built on **Monad Testnet**. The blockchain is completely hidden from the end user, custodial wallets, sponsored gas fees, and Google OAuth login provide a seamless Web2-like experience while leveraging blockchain for true digital ownership.

Users can buy card packs, collect rare NFT cards, trade them on a marketplace, print physical versions, and redeem physical cards back to digital, all without ever seeing a wallet address or signing a transaction.

That is the default, not the ceiling. A user who wants custody of their own cards can connect a Privy wallet and move cards into it, bring them back, or transfer them anywhere. The consumer pages carry no wallet actions for anyone; everything to do with self-custody lives on `/wallet` and `/wallet/move`, which nobody reaches by accident.

## Key Features

### Core Loop
- **Login**: Google OAuth + demo account (custodial wallet, hidden from user)
- **Credits**: Top-up and print checkout run through a simulated payment flow for the demo; no payment processor is integrated
- **Buy Pack**: Standard (5 cards / 500 Credits) or Booster (10 cards / 800 Credits)
- **Collect**: NFT cards minted on-chain (ERC-1155), stored in user's collection
- **Print**: Physical card printing, card locked in vault
- **Redeem**: Enter Card ID + Redeem Code from physical card → back to digital

### Marketplace
- **Public browsing**: Users can view listings without login
- **Trade**: Buy/sell cards between users with Crystal currency, with **no marketplace fee**. Crystal exists only because someone dismantled a duplicate, so the market is where an unwanted card becomes a wanted one; a fee there would tax the recovery from a bad pull. A paid tier requiring self-custody export is recorded as a plan (ADR-034) and is not built
- **FVM (Fair Value Model)**: Fair-value pricing computed from sales history (deterministic, not AI), with an optional MiMo-generated listing-price suggestion layered on top
- **Wishlist & Cart**: Standard e-commerce UX for marketplace

### Advanced Features
- **Pyth Entropy Integration**: Provably fair pack randomness using on-chain verifiable RNG, replacing Math.random() with cryptographically secure seed generation
- **Privy Beyond Authentication**: Cards move both ways between Gachard and the user's own Privy wallet. Export is authorised by an EIP-712 intent the user signs with that wallet, one signature covering a whole selection; the return transfer is signed and sent from the user's wallet, and Gachard has no route that could do it without the delegation they grant and can withdraw. Gas on both sponsored steps is paid by Privy's native sponsorship, so the wallet transacts while its MON balance stays at zero. The wallet is bound to the Gachard account permanently and must carry the same email, so a stolen session cannot point it somewhere else. Two things make the custody real rather than described. A card can leave for an address Gachard has no signing rights over, which is a door out of the product entirely. And when such a card is sent *back* by a transfer Gachard never made, the platform finds it by reading balances on chain — there is no transaction id and no pending row to look it up by, because nothing here performed the transfer. The chain is the record, and Gachard is reading it rather than being it
- **AI Anomaly Detection**: Wash-trading risk scoring on marketplace trades via MiMo LLM, with the resulting score written on-chain through `recordVerification()`. Requires `MIMO_API_KEY`; without it the call degrades to a neutral score rather than failing the trade
- **Dismantle & Crystal**: Burn cards to earn Crystal currency
- **QR Verification**: Scan physical cards for authenticity verification
- **Admin Console**: Full management for users, cards, transactions, prints. Open without an account so the print-to-approval flow can be followed end to end; personal details and every state-changing action stay behind admin credentials

## Technical Highlights

### Smart Contract
- **GachardCard Address:** `0x2a05a2e3b0e7355b97de593e354063e9474c9d08`
- **PackEntropy Address:** `0x6B53C35e8baBaaBe4DD725573C3f612121764542`
- **Standard:** ERC-1155 (one-token-per-instance)
- **Compiler:** Solc 0.8.28 + EVM cancun + via_ir
- **Verification:** Sourcify exact_match on MonadVision
- **Tests:** 78/78 passed (Foundry), 58 GachardCard + 20 PackEntropy, covering mint, print, redeem, transfer, burn, verification, access control and the entropy flow

### API and Logic Tests
`npx tsx frontend/scripts/suite-api.ts` — **77 checks**, all passing, over authentication boundaries, what the public marketplace and public admin endpoints are allowed to return, logout, redeem, the EIP-712 batch signature, rate limits, chain reconciliation, Privy binding, marketplace purchases whose receipt arrives late, released cards and the payloads a QR scanner actually produces. It builds its own fixture, deletes it, and reports what it left behind.

### Nonce Manager
Implemented `acquireNonce()` in `blockchain.ts` with lock mechanism to handle concurrent transactions. This prevents "existing transaction had higher priority" errors when multiple users buy packs simultaneously, a critical feature for real-time TCG gameplay.

### Pyth Entropy: Provably Fair Randomness
Pack rarity is now determined by **Pyth Entropy**, an on-chain verifiable RNG protocol on Monad Testnet. This replaces the previous `Math.random()` implementation with a 4-layer security model:

1. **Access Control**: Only authorized contracts can request/fulfill entropy
2. **Hash Commitment**: `keccak256(seed, rarities)` stored on-chain creates immutable binding
3. **Structural Check**: On-chain validation ensures minimum Rare+ card count
4. **Transparency**: Public verification endpoint at `/api/verify/pack/[txHash]`

The seed is generated via Pyth's commit-reveal protocol, making it cryptographically secure and publicly auditable. Users can verify their pack fairness by re-running the deterministic algorithm with the on-chain seed.

**Pyth Entropy Contract:** `0x825c0390f379c631f3cf11a82a37d20bddf93c07` (Monad Testnet)

### Architecture
- **Custodial Wallets**: Users never see private keys
- **Sponsored Gas**: Platform pays all transaction fees
- **State Machine**: Digital ↔ Vaulted ↔ Exported ↔ Released card status with transfer blocking. `Released` means sent to an address outside Gachard; the platform cannot bring it back, and only the chain can say it returned
- **AES-256-GCM**: Private keys encrypted at rest
- **One identity**: every request is authenticated by a signed, httpOnly session cookie and nothing else (ADR-032)
- **Two audiences, one console**: the admin console is readable without an account so the print-to-approval flow can be followed, but its routes withhold the people in that flow — email, recipient name, phone, address and the redeem code are sent only to a signed-in admin. The gate states the result in a request header that is stripped from every incoming request before it is set, so it cannot be forged (ADR-032, second amendment)

## Why Monad

Monad's sub-second blocks are what make this product shape possible at all. We measured block time on Monad Testnet at **~0.3s** (sampled across 2,000 blocks), so `mintBatch()` confirms inside the pack-reveal animation rather than behind a pending spinner, the blockchain stays invisible because it is never slow enough to notice. Monad reports throughput of ~10,000 TPS; that figure is theirs, not something we measured. Marketplace settlements are fast enough for real-time trading. The concurrent transaction handling (with our nonce manager) works smoothly because Monad can process multiple transactions per block without congestion, something that would be prohibitively slow on other chains.

## Scope: What Is and Is Not Built

Stated plainly so nothing here has to be taken on trust:

| Area | Status |
|------|--------|
| Buy pack → reveal → collect | Live on Monad Testnet, provably fair via Pyth Entropy |
| Marketplace trade, wishlist, cart | Live |
| Dismantle → Crystal | Live |
| Print request → vault lock → redeem | Live end-to-end in software; no physical card has been produced and redeemed yet |
| AI risk scoring + market insight | Code live and wired; requires `MIMO_API_KEY` to be set in the deployment |
| Privy self-custody wallet | Live: wallet creation, export, import and outward transfer, both sponsored steps paid by Privy (v3.44.0). `/wallet` carries the wallet's own ledger — direction and transaction hash per row — and a Refresh that checks the chain rather than re-reading the database |
| Revealing the wallet's private key | Built and switched off. `useExportWallet` works on v3.44.0, but a revealed key cannot be un-revealed, so it sits behind a deliberate flag |
| Export/import exercised end to end by a user | Yes, on Monad Testnet, including the outward transfer. One card (`#092ba`, token 272) has now made the whole round trip: printed, shipping claimed, redeemed, exported to the user's Privy wallet (`0x47c56d03…`), transferred out to an address outside Gachard (`0x630d24d5…`), sent back in by a transfer Gachard did not make, detected by reading the chain, and returned to Gachard |
| AI vision card verification | Not built. QR + on-chain lookup is the only verification today |
| Gameplay (`/play`) | Not built, marked "Coming Soon" in the app |
| Payments | Simulated; no processor integrated |

## Links

| Resource | URL |
|----------|-----|
| Live Demo | https://gachard-monad.vercel.app |
| Admin Console | https://gachard-monad.vercel.app/admin |
| GachardCard (Verified) | https://testnet.monadvision.com/address/0x2a05a2e3b0e7355b97de593e354063e9474c9d08 |
| PackEntropy (Verified) | https://testnet.monadvision.com/address/0x6B53C35e8baBaaBe4DD725573C3f612121764542 |
| Pack Verification | https://gachard-monad.vercel.app/api/verify/pack/[txHash] |
| GitHub | https://github.com/Gihasy/gachard-monad |

---

*Built for Monad Metropolis Hackathon, September 2026*
