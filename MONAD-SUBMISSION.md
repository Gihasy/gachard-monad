# Gachard — Monad Metropolis Hackathon Submission

## Project Overview

Gachard is a digital-to-physical trading card game (TCG) platform built on **Monad Testnet**. The blockchain is completely hidden from the end user — custodial wallets, sponsored gas fees, and Google OAuth login provide a seamless Web2-like experience while leveraging blockchain for true digital ownership.

Users can buy card packs, collect rare NFT cards, trade them on a marketplace, print physical versions, and redeem physical cards back to digital — all without ever seeing a wallet address or signing a transaction.

## Key Features

### Core Loop
- **Login** — Google OAuth + demo account (custodial wallet, hidden from user)
- **Buy Pack** — Standard (5 cards / 500 Credits) or Booster (10 cards / 800 Credits)
- **Collect** — NFT cards minted on-chain (ERC-1155), stored in user's collection
- **Print** — Physical card printing, card locked in vault
- **Redeem** — Enter Card ID + Redeem Code from physical card → back to digital

### Marketplace
- **Public browsing** — Users can view listings without login
- **Trade** — Buy/sell cards between users with Crystal currency
- **FVM (Fair Value Model)** — AI-powered pricing based on sales history
- **Wishlist & Cart** — Standard e-commerce UX for marketplace

### Advanced Features
- **Pyth Entropy Integration** — Provably fair pack randomness using on-chain verifiable RNG, replacing Math.random() with cryptographically secure seed generation
- **AI Anomaly Detection** — Wash-trading detection on marketplace transactions
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
- **Tests:** 76/76 passed (Foundry) — covering mint, print, redeem, transfer, burn, verification, Pyth Entropy

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

Monad's high throughput (~10,000 TPS) and low latency (~1s block time) are essential for a responsive TCG experience. Pack openings feel instant because `mintBatch()` confirms in seconds. Marketplace settlements are fast enough for real-time trading. The concurrent transaction handling (with our nonce manager) works smoothly because Monad can process multiple transactions per block without congestion — something that would be prohibitively slow on other chains.

## Links

| Resource | URL |
|----------|-----|
| Live Demo | https://gachard-monad.vercel.app |
| Admin Console | https://gachard-monad.vercel.app/admin |
| GachardCard (Verified) | https://testnet.monadvision.com/address/0x2a05a2e3b0e7355b97de593e354063e9474c9d08 |
| PackEntropy (Verified) | https://testnet.monadvision.com/address/0x6B53C35e8baBaaBe4DD725573C3f612121764542 |
| Pack Verification | https://gachard-monad.vercel.app/api/verify/pack/[txHash] |
| GitHub | https://github.com/Gihasy/Gachard-Monad |

---

*Built for Monad Metropolis Hackathon — September 2026*
