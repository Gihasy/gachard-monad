# Gachard on Monad

A digital-native collectible card game (TCG) platform built on **Monad Testnet**. Brands and IP owners can issue cards that users buy, collect, print as physical cards, and redeem back to digital — with blockchain completely hidden from the end user.

Monad's high throughput (~10,000 TPS) and low latency (~1s block time) make it ideal for a responsive TCG experience where mint, trade, and marketplace operations feel instant.

## Live Demo

- **App**: https://gachard-monad.vercel.app
- **Admin Console**: https://gachard-monad.vercel.app/admin
- **Smart Contract**: [0x712b70CbD3854A11f18839068483114D0068b4FC](https://testnet.monadexplorer.com/address/0x712b70CbD3854A11f18839068483114D0068b4FC) (verified on Sourcify)

## Features

### Core Loop
- **Login** — Google OAuth + demo account (custodial wallet, hidden from user)
- **Buy Pack** — Standard (5 cards / 500 Credits) or Booster (10 cards / 800 Credits)
- **Collect** — NFT cards minted on-chain, stored in user's collection
- **Print** — Physical card printing (+$14.99 shipping), card locked in vault
- **Claim Shipping** — User scans QR code on receipt → status becomes "Real"
- **Redeem** — Enter Card ID + Redeem Code from physical card → back to digital

### Additional Features
- **Scan & Verify** — QR code scanning for card authenticity verification
- **Credit System** — Top up credits to purchase packs
- **Transaction History** — Full transaction history in Profile page
- **Unique Card ID** — Each card has a unique hex ID (e.g. `#8a866`)
- **Invoice ID** — Each transaction has an Invoice ID (e.g. `GC-20260730-a3f1`)
- **Admin Console** — Manage users, transactions, cards, print requests
- **Trade Marketplace** — Buy/sell cards between users with FVM pricing
- **Dismantle & Crystal** — Burn cards to earn Crystal currency
- **AI Anomaly Detection** — Wash-trading detection on marketplace
- **Support Gachard** — Floating CTA button for early supporters

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (free tier)
- Google Cloud Console OAuth credentials

### Frontend + Backend (Single Service)
```bash
cd frontend
npm install
npm run dev
```

Backend runs via Next.js API routes (`app/api/`) — no separate service needed.

### Smart Contracts (Foundry)
```bash
cd contracts
forge install
forge build
forge test
```

### Environment Variables
See `frontend/.env.local.example`.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Backend | Next.js API Routes (single service) |
| Database | MongoDB Atlas (free tier) |
| Blockchain | Monad Testnet, ERC-1155 |
| Smart Contracts | Solidity 0.8.28, Foundry, OpenZeppelin v5 |
| Wallet | Custodial (ethers.js v6), sponsored gas |
| Auth | Google OAuth + demo accounts |
| Payment | Stripe Test Mode (credit + direct) |
| AI | Gemini API (market insight) |
| Hosting | Vercel (frontend + backend) |

## Architecture

### Key Design Decisions
- **ADR-002**: Custodial wallet, hidden from user
- **ADR-003**: Gas fees sponsored by platform
- **ADR-004**: Lock in-place via status flag (not burn)
- **ADR-017**: Next.js API routes as sole backend
- **ADR-018**: Async pattern for blockchain transactions
- **ADR-020**: AES-256-GCM encryption for private keys
- **ADR-024**: Functional marketplace (trade system)
- **ADR-025**: AI Anomaly Detection Oracle
- **ADR-026**: Dismantle & Crystal (burn-to-earn)
- **ADR-027**: Become a Creator (whitelist form)

See `DECISIONS.md` for all 27 ADRs.

### Project Structure
```
gachard-monad/
├── frontend/           # Next.js app (single service)
│   ├── app/           # Pages & API routes
│   ├── components/    # React components
│   ├── lib/           # Utilities & blockchain
│   ├── hooks/         # React hooks
│   └── public/        # Static assets
├── contracts/         # Solidity smart contracts (Foundry)
│   ├── src/           # GachardCard.sol (ERC-1155)
│   ├── test/          # 54 test cases
│   └── script/        # Deploy scripts
├── docs/              # Documentation
├── scripts/           # Deployment scripts
├── MEMORY.md          # Project status & rules
├── DECISIONS.md       # Architecture decisions (27 ADRs)
└── vercel.json        # Vercel deployment config
```

## Deployment

### Smart Contract (Monad Testnet)
```bash
# Auto-generate wallet and deploy
deploy-auto.bat

# Or manually with Foundry
cd contracts
forge create src/GachardCard.sol:GachardCard \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key <YOUR_PRIVATE_KEY> \
  --chain-id 10143
```

### Frontend (Vercel)
1. Push to `main` branch → auto-deploy
2. Settings:
   - Framework Preset: Next.js
   - Root Directory: `frontend`
3. Environment Variables:
   - `MONGODB_URL` — MongoDB Atlas connection string
   - `DATABASE_NAME` — gachard-monad
   - `GOOGLE_CLIENT_ID` — Google OAuth Client ID
   - `GOOGLE_CLIENT_SECRET` — Google OAuth Client Secret
   - `CONTRACT_ADDRESS` — Smart contract address
   - `ADMIN_WALLET_ADDRESS` — Admin wallet address
   - `ADMIN_PRIVATE_KEY` — Admin wallet private key
   - `RPC_URL` — Monad Testnet RPC URL
   - `CHAIN_ID` — Monad Testnet Chain ID (10143)
   - `ENCRYPTION_SECRET_KEY` — AES-256-GCM key (min 32 chars)
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — Admin console credentials

### Database Scripts
```bash
# Clean slate (delete all test data)
cd frontend && npx tsx scripts/clean-slate.ts
```

## Blockchain Verification

All blockchain transactions are verifiable on Monad Explorer:
- **Smart Contract**: [0x712b70CbD3854A11f18839068483114D0068b4FC](https://testnet.monadexplorer.com/address/0x712b70CbD3854A11f18839068483114D0068b4FC)
- **Chain**: Monad Testnet (Chain ID 10143)
- **Explorer**: https://testnet.monadexplorer.com
- **Verification**: Sourcify exact_match ✅

Admin Console displays:
- All transactions with clickable txHash links to Monad Explorer
- User wallet addresses
- Token IDs on blockchain
- Risk scores from AI anomaly detection

## Smart Contract Tests

```
Ran 54 tests — 54 passed, 0 failed, 0 skipped
Compiler: Solc 0.8.28 + EVM cancun
Duration: 20.19ms
```

Test coverage: mint, print, redeem, transfer, burn, verification, access control, events, error handling.

## Notes for AI Coding Agents
- Read `MEMORY.md`, `DECISIONS.md`, and `docs/` before making changes
- Do not use blockchain/crypto/on-chain terminology in user-facing UI
- All changes must be compatible with locked ADRs
- Test on mobile (iPhone 12 Pro/390px, Galaxy S8+/360px) before deploying
- Use `getAuthenticatedUser(req)` for all API routes (server-side session)
- All blockchain transactions use async pattern (ADR-018)

## License
Private — Monad hackathon submission.
