# Gachard — Monad Metropolis Hackathon Submission

## Project Overview

Gachard is a digital-to-physical trading card game (TCG) platform built on **Monad Testnet**. The blockchain is completely hidden from the end user — custodial wallets, sponsored gas fees, and Google OAuth login provide a seamless Web2-like experience while leveraging blockchain for true digital ownership.

Users can buy card packs, collect rare NFT cards, trade them on a marketplace, print physical versions, and redeem physical cards back to digital — all without ever seeing a wallet address or signing a transaction.

## Key Features

### Core Loop
- **Login** — Google OAuth + demo account (custodial wallet, hidden from user)
- **Credits** — Top-up and print checkout run through a simulated payment flow for the demo; no payment processor is integrated
- **Buy Pack** — Standard (5 cards / 500 Credits) or Booster (10 cards / 800 Credits)
- **Collect** — NFT cards minted on-chain (ERC-1155), stored in user's collection
- **Print** — Physical card printing, card locked in vault
- **Redeem** — Enter Card ID + Redeem Code from physical card → back to digital

### Marketplace
- **Public browsing** — Users can view listings without login
- **Trade** — Buy/sell cards between users with Crystal currency
- **FVM (Fair Value Model)** — Fair-value pricing computed from sales history (deterministic, not AI), with an optional MiMo-generated listing-price suggestion layered on top
- **Wishlist & Cart** — Standard e-commerce UX for marketplace

### Advanced Features
- **Pyth Entropy Integration** — Provably fair pack randomness using on-chain verifiable RNG, replacing Math.random() with cryptographically secure seed generation
- **Privy Embedded Wallet** — Optional self-custody wallet for advanced users, with progressive disclosure UX. Wallet creation and address verification on the block explorer are live; exporting the key is not available on the pinned SDK version (v1.93.0), and card export to that wallet is roadmap, not shipped
- **AI Anomaly Detection** — Wash-trading risk scoring on marketplace trades via MiMo LLM, with the resulting score written on-chain through `recordVerification()`. Requires `MIMO_API_KEY`; without it the call degrades to a neutral score rather than failing the trade
- **Dismantle & Crystal** — Burn cards to earn Crystal currency
- **QR Verification** — Scan physical cards for authenticity verification
- **Admin Console** — Full management for users, cards, transactions, prints

## Technical Highlights

### Smart Contract
- **GachardCard Address:** `0x2a05a2e3b0e7355b97de593e354063e9474c9d08`
- **PackEntropy Address:** `0x6B53C35e8baBaaBe4DD725573C3f612121764542`
- **Standard:** ERC-1155 (one-token-per-instance)
- **Compiler:** Solc 0.8.28 + EVM cancun + via_ir
- **Verification:** Sourcify exact_match on MonadVision
- **Tests:** 78/78 passed (Foundry) — 58 GachardCard + 20 PackEntropy, covering mint, print, redeem, transfer, burn, verification, access control and the entropy flow

### Nonce Manager
Implemented `acquireNonce()` in `blockchain.ts` with lock mechanism to handle concurrent transactions. This prevents "existing transaction had higher priority" errors when multiple users buy packs simultaneously — a critical feature for real-time TCG gameplay.

### Pyth Entropy — Provably Fair Randomness
Pack rarity is now determined by **Pyth Entropy**, an on-chain verifiable RNG protocol on Monad Testnet. This replaces the previous `Math.random()` implementation with a 4-layer security model:

1. **Access Control** — Only authorized contracts can request/fulfill entropy
2. **Hash Commitment** — `keccak256(seed, rarities)` stored on-chain creates immutable binding
3. **Structural Check** — On-chain validation ensures minimum Rare+ card count
4. **Transparency** — Public verification endpoint at `/api/verify/pack/[txHash]`

The seed is generated via Pyth's commit-reveal protocol, making it cryptographically secure and publicly auditable. Users can verify their pack fairness by re-running the deterministic algorithm with the on-chain seed.

**Pyth Entropy Contract:** `0x825c0390f379c631f3cf11a82a37d20bddf93c07` (Monad Testnet)

### Architecture
- **Custodial Wallets** — Users never see private keys
- **Sponsored Gas** — Platform pays all transaction fees
- **State Machine** — Digital ↔ Vaulted card status with transfer blocking
- **AES-256-GCM** — Private keys encrypted at rest

## Why Monad

Monad's sub-second blocks are what make this product shape possible at all. We measured block time on Monad Testnet at **~0.3s** (sampled across 2,000 blocks), so `mintBatch()` confirms inside the pack-reveal animation rather than behind a pending spinner — the blockchain stays invisible because it is never slow enough to notice. Monad reports throughput of ~10,000 TPS; that figure is theirs, not something we measured. Marketplace settlements are fast enough for real-time trading. The concurrent transaction handling (with our nonce manager) works smoothly because Monad can process multiple transactions per block without congestion — something that would be prohibitively slow on other chains.

## Scope — What Is and Is Not Built

Stated plainly so nothing here has to be taken on trust:

| Area | Status |
|------|--------|
| Buy pack → reveal → collect | Live on Monad Testnet, provably fair via Pyth Entropy |
| Marketplace trade, wishlist, cart | Live |
| Dismantle → Crystal | Live |
| Print request → vault lock → redeem | Live end-to-end in software; no physical card has been produced and redeemed yet |
| AI risk scoring + market insight | Code live and wired; requires `MIMO_API_KEY` to be set in the deployment |
| Privy self-custody wallet | Creation and address verification live; key export unavailable on v1.93.0 |
| AI vision card verification | Not built. QR + on-chain lookup is the only verification today |
| Gameplay (`/play`) | Not built — marked "Coming Soon" in the app |
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

*Built for Monad Metropolis Hackathon — September 2026*
