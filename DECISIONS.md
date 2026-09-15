# Architecture Decision Records

## ADR-001: Token Standard — ERC-1155
**Status**: Accepted
**Decision**: Use ERC-1155 for cards (not ERC-721).
**Reason**: ERC-1155 was chosen for gas-efficient batch operations (mint multiple tokens in a single transaction) and flexibility of multi-token-type in a single contract. **Important note**: although ERC-1155 supports fungible balance (multiple users can hold quantity >1 for the same tokenId), in Gachard each card gets a unique tokenId (one-token-per-instance) to support per-card vault status tracking per ADR-004. Rarity is stored as metadata per tokenId (`cardRarity` mapping), not as grouping of the same tokenId. Open to combination with ERC-721 in production if individual uniqueness is needed (e.g. numbered legendary editions).

## ADR-002: Wallet — Custodial, Hidden from User
**Status**: Accepted
**Decision**: Users log in via Google OAuth; wallet is created automatically by the backend, private key stored on server. Users only know their username `@user`, never see a wallet address.
**Reason**: Core product philosophy — blockchain must be completely hidden from end-users for mainstream UX, avoiding Web3/crypto stigma.

## ADR-003: Gas Fee — Platform-Sponsored
**Status**: Accepted
**Decision**: All transactions (mint, print, redeem) are executed by the backend on behalf of the user; the backend/platform covers gas fees.
**Reason**: Users should never hold crypto or understand the concept of gas fees.
**Known limitation**: a single admin/relayer wallet becomes a centralization point — needs multi-sig or third-party custodian in production.

## ADR-004: Card State Machine — Lock In-Place via Status Flag, Not Burn
**Status**: Accepted (clarified 28 July 2026)
**Decision**: NFT is never burned on print. Status changes `Digital → Vaulted` (transfer to vault address, normal transfers rejected during this status) `→ Digital` (redeem, transfer to new owner). **On-chain clarification**: Deployed contract `requestPrint()` performs `_update(ownerAddress, address(this))` which moves the NFT to the vault (contract address). `_update()` override blocks normal transfers when `cardStatus == Vaulted`. NFT moves on-chain to the contract when vaulted, not staying in the user's wallet.
**Reason**: History/provenance remains intact within a single token ID, simpler for AI-scan provenance, and more intuitive for the product narrative ("locked", not "destroyed").
**Verified**: 28 July 2026 — `safeTransferFrom` on a Vaulted token (tokenId 46) REVERTs with message "Card is vaulted, transfer blocked". Digital tokens (tokenId 45) can be transferred normally.

## ADR-005: Redeem Code — Hash Overwrite per Print Cycle
**Status**: Accepted
**Decision**: Each `requestPrint()` generates a new random code; its hash overwrites the old hash in `storedHash[tokenId]`. Plaintext code is never stored permanently or displayed in UI/on-chain.
**Reason**: Codes from previous print cycles automatically expire without needing a separate "used code" list. Prevents old physical cards (not yet scratched) from remaining valid after a card is reprinted for a new owner.

## ADR-006: Redeem — Backend-Only Access (Rate-Limited)
**Status**: Accepted
**Decision**: `redeemCard()` can only be accessed via backend API (login → input code), not free on-chain calls from any wallet. Backend implements rate-limiting (e.g. max 5 attempts/minute/account).
**Reason**: Since gas is platform-sponsored, free access risks abuse for spam brute-force code guessing with costs borne by the platform, not the attacker.

## ADR-007: Explicit `recipientAddress`, Not `msg.sender`
**Status**: Accepted
**Decision**: `redeemCard()` accepts an explicit `recipientAddress` parameter (the logged-in user's wallet), instead of relying on `msg.sender`.
**Reason**: Since the backend calls the contract on behalf of the user, `msg.sender` is actually the backend/relayer wallet, not the user's wallet — an explicit parameter is needed so the card is sent to the correct user.

## ADR-008: Payment — Two Separate Tracks (Credit vs Direct)
**Status**: Accepted
**Decision**: **Credit** (top-up any amount, stored as integer/cents in the database, used exclusively for buying packs) is completely separated from **Direct Payment** (per transaction, required for print requests, cannot use credits).
**Implementation status (15 Sep 2026)**: Stripe was the intended processor, but no payment SDK is integrated. Both tracks currently run through a simulated checkout that mints `sim_<timestamp>` payment ids. The two-track separation is real; the payment rail is not.
**Reason**: Print requests have real costs (printing + shipping) that are intentionally separated from the virtual pack economy. Reduces repeated Stripe integration for each pack purchase.

## ADR-009: Odds/Rarity — Stored in Backend, Not On-chain
**Status**: Accepted
**Decision**: Rarity distribution (odds table) is stored in the backend database, can be changed without redeploying the contract. Only the final reveal result is recorded on-chain.
**Reason**: Flexibility to tune odds during testing without the cost/delay of contract redeployment.

## ADR-010: Marketplace — "Coming Soon", Not a Demo Feature
**Status**: Accepted
**Decision**: Marketplace is only displayed as a UI placeholder "Coming Soon" for the hackathon, not functional (no real trading/listing).
**Reason**: Not a core product differentiator; time redirected to the core mint–vault–redeem loop and AI scan features required for the hackathon theme.

## ADR-011: Card Artwork — Manual AI Generation Upfront
**Status**: Accepted
**Decision**: Card artwork is generated once upfront manually, not generated on-demand during reveal.
**Reason**: Demo reliability — on-demand generation adds complexity and wait time that risks issues during live presentation.

## ADR-012: Emergent → Claude Code + Self-Hosted Migration
**Status**: Accepted
**Decision**: Use Emergent (via 7-day pass + first month Standard, ~350 credits) specifically for Sprint 1–3 (foundation, mint, vault/redeem state machine). After that, push code to GitHub and continue Sprint 4–6 with Claude Code (Pro, $20/month). Self-deploy to Vercel (frontend), Render/Railway (backend), MongoDB Atlas (database) — all free tier for hackathon demo scale. Smart contract remains deployed directly to Monad Testnet, independent of hosting choice.
**Reason**: Emergent's cost model (credit-per-action) is not predictable and expensive for long-term use; Claude Code (flat subscription) is more predictable for iterative work in Sprint 4–6. The stack used by Emergent (React/Next.js + FastAPI + MongoDB) is portable to any standard hosting.
**Migration note**: audit Stripe integration (and other Playbook integrations) to ensure using direct SDK/API, not relying on Emergent-specific environment configuration.

## ADR-013: Delivery Platform — PWA (Progressive Web App)
**Status**: Accepted
**Decision**: Gachard is built as a PWA (manifest.json + service worker on top of React/Next.js stack), not a separate native app for iOS/Android.
**Reason**: Avoids App Store review process that risks being blocked by Apple's policies on NFT/digital collectibles. Single codebase for all platforms, fitting the hackathon timeline. Camera (for AI-scan) and Stripe checkout still function normally in web/PWA context.
**Known limitation**: push notifications on iOS PWA are still more limited than native apps — not relevant for hackathon demo, noted for production consideration.

## ADR-014: Tool-Agnostic Documentation + Per-Tool Adapters
**Status**: Accepted
**Decision**: Core project documents (`README.md`, `MEMORY.md`, `DECISIONS.md`, `docs/`, `sprints/`) are written purely as tool-agnostic markdown. Each AI coding tool used (Emergent, Claude Code, MiMo Code, etc.) has one small "adapter" file (`CLAUDE.md` for Claude Code, `.mimo/config.md` for MiMo Code) that points to the same core documents — not duplicating content.
**Reason**: The team considers switching tools/models (Emergent → Claude Code → MiMo Code with MiMo V2.5 Pro model, possibly switching again). With tool-independent core documentation, switching tools doesn't require rewriting context — just create a new adapter if needed.
**Note**: MiMo Code (early release, still alpha as of July 2026) supports connections to various LLM providers (not locked to MiMo models only) and automatically imports configuration from Claude Code during migration — strengthening the feasibility of this adapter approach. Since it's still early-stage software, maintaining frequent Git commits as a fallback remains important in case the tool is unstable.

## ADR-015: Primary Tool — MiMoCode (mimo-v2.5-pro) From the Start, No Emergent
**Status**: Accepted (supersedes the approach in ADR-012)
**Decision**: All development (Sprint 1–6) uses MiMoCode (model `mimo-v2.5-pro`, paid via Xiaomi MiMo Platform or custom third-party provider) from the start. Emergent is not used at all. Git + GitHub repo setup is done manually from Sprint 1 (not auto-sync like Emergent). Self-hosted setup (Vercel/Render/MongoDB Atlas, free tier) is prepared from Sprint 1, not waiting for mid-project migration.
**Reason**: Simplifies to one tool throughout the project (instead of two different tools at different phases), cost model is more predictable (Token Plan/pay-as-you-go), and MiMoCode has a persistent memory system (`MEMORY.md` auto-loaded, task tracking, checkpoint) that fits our documentation approach.
**Supersedes**: ADR-012 (Emergent → Claude Code plan) no longer applies.

## ADR-016: Correction — MiMoCode Auto-Loaded Files
**Status**: Accepted
**Decision**: `MEMORY.md` is the official file automatically read by MiMoCode each session (part of its built-in persistent memory system: `MEMORY.md`, `checkpoint.md`, `notes.md`, `tasks/<id>/progress.md`). `.mimo/config.md` and `CLAUDE.md` are **not** files automatically read by MiMoCode — both are maintained as references for humans/other tools (e.g. if switching back to Claude Code later), not as auto-load mechanisms for MiMoCode.
**Reason**: Technical clarification after checking MiMoCode's official documentation directly (July 2026) — main instructions for the agent were moved to the top of `MEMORY.md` to ensure they are actually auto-read.

## ADR-017: Backend Architecture — Next.js API Routes as the Sole Backend
**Status**: Accepted
**Decision**: All backend logic (auth, wallet, blockchain transactions, rate-limiting) runs via Next.js API routes (`app/api/`). The separate FastAPI backend (`backend/`) is fully removed.
**Reason**: Three separate backend hosting options (Koyeb, Railway, Fly.io) are closed or require credit cards; Render has issues with available cards. Next.js API routes are already deployed on Vercel at no extra cost, reducing infrastructure complexity from 2 services to 1.
**Supersedes**: References to FastAPI/Render/Railway in ADR-012 and ADR-015 no longer apply to backend.

## ADR-018: Async Pattern for Blockchain Transactions
**Status**: Accepted
**Decision**: All endpoints interacting with the smart contract use an async pattern:
1. Endpoint immediately returns `{status: "pending", txHash: null}` once the transaction is sent to the chain, NOT waiting for confirmation.
2. Transaction status is stored in MongoDB `transactions` collection, updated to `confirmed`/`failed` via a separate process.
3. Frontend polls endpoint `/api/transactions?txId=...` every few seconds until it gets `confirmed`.
**Reason**: Blockchain confirmation takes 1-2 seconds on Monad Testnet. The async pattern is more scalable and enables retry/resilience.

## ADR-019: MongoDB-Based Rate-Limiting for Redeem
**Status**: Accepted
**Decision**: Rate-limiting for `redeemCard()` uses MongoDB `rate_limits` collection, not in-memory storage. Max 5 attempts per user per minute (see ADR-006). Each attempt is recorded with a per-minute timestamp window.
**Reason**: Serverless functions on Vercel are stateless — in-memory storage is inconsistent across invocations. MongoDB ensures rate-limiting remains effective even if requests are routed to different instances.

## ADR-020: Private Key Encryption in Database
**Status**: Accepted
**Decision**: All private keys (user wallets and admin wallets) are encrypted using AES-256-GCM before being stored in MongoDB. The secret key is stored in environment variable `ENCRYPTION_SECRET_KEY` (minimum 32 characters), not in the database. When used to sign transactions, the private key is decrypted first.
**Reason**: Plaintext private keys in the database are a critical security risk — if the database leaks, all wallets can be stolen. AES-256-GCM provides authenticated encryption (integrity + confidentiality). The secret key in env var ensures that database compromise alone is not sufficient to decrypt.

## ADR-021: Pack System (Standard & Booster)
**Status**: Accepted
**Decision**: Two pack types available:
- **Standard Pack**: 5 cards at 500 Credits (1 guaranteed Rare+)
- **Booster Pack**: 10 cards at 800 Credits (2 guaranteed Rare+)

Cards follow the normal odds table. Guaranteed slots are Rare/Epic/Legendary with relative weights. Mint via `mintBatch()` atomic (1 transaction for the entire pack). Guaranteed slots are shuffled so they're not always in the same position.
**Reason**: Two pack tiers give users choice based on budget. The Standard pack offers quick collection building, while the Booster pack provides better value per card. Atomic `mintBatch()` saves gas and ensures consistency (all or nothing).
**Supersedes**: Previous ADR-021 referenced "8 cards per pack" — updated to match actual implementation.

## ADR-022: AI Vision — Deferred, Not Started
**Status**: DEFERRED — not implemented.
**Decision**: AI vision for visual card analysis is deferred from the current hackathon scope. All card verification relies on QR lookup, matching on-chain state against MongoDB.
**Correction (15 Sep 2026)**: this record previously stated that reference code remained in `lib/vision.ts`. That file has never existed — no vision code was ever written. Corrected so the record matches the repository.
**Correction (15 Sep 2026)**: this record previously called AI vision "a required eligibility criterion for the AI x Web3 theme across all tracks". That requirement could not be confirmed on the Metropolis programme page, which describes AI as the focus of Track 04 rather than a universal gate. Treat it as unverified rather than established.
**Reason for deferral**: priority went to stabilising the core loop. The AI that is live is text-based — trade risk scoring and marketplace insight, both via MiMo (ADR-030).
**Intended value if built**: comparing a photographed card against its on-chain template would catch forgeries that carry a valid-looking QR code, which QR lookup alone cannot detect.

## ADR-023: Card Template System
**Status**: Accepted
**Decision**: Cards are based on templates stored in MongoDB `card_templates` collection. Each template defines: name, description, image path, rarity, and a unique templateId. When a card pack is opened, random templates are selected based on odds table, and individual cards are minted from these templates. This separates the card design (template) from the individual instance (card).
**Reason**: Enables easy addition of new card designs without smart contract changes. Templates can be managed via admin console. Each card instance tracks its template reference for metadata lookup.

## ADR-024: Marketplace — Functional Trade System
**Status**: Accepted — supersedes ADR-010
**Decision**: Implement full marketplace with listing, buying, cancelling. Cards listed via `isListed` flag (MongoDB) + `marketplaceTransfer()` on-chain. Marketplace fee 8%. FVM (Fair Value Market) calculates average sold price per template. AI-powered market insight and price suggestion via LLM (provider is MiMo — see ADR-030; this line previously said Gemini API). Print blocked while card is listed.
**Reason**: Enhances demo value for the hackathon. Shows full card lifecycle: mint → collect → trade → print → redeem. Blockchain abstraction maintained — users see Credit prices, not crypto.

## ADR-025: AI Anomaly Detection Oracle for Trade
**Status**: Accepted
**Decision**: Detect wash-trading patterns in marketplace transactions using an Oracle approach:
1. **Deterministic signals** (`fraud-signals.ts`): `repeatPairCount` (wallet pair frequency), `priceDeviationPct` (price deviation from FVM), `resaleSpeedHours` (resale speed).
2. **AI risk scoring** (`risk-score.ts`): an LLM synthesizes the three signals into a 0-100 score. Provider is MiMo — see ADR-030. (This line previously said Gemini, which never matched the code.) Threshold `flagged = riskScore >= 70`.
3. **On-chain Oracle** (`recordVerification()`): Score and flag results are posted to the smart contract, recorded permanently on blockchain.
4. **FVM exclusion**: Transactions with `flagged === true` are excluded from FVM calculation to prevent price manipulation.
5. **Non-blocking**: All scoring occurs AFTER the transaction completes — never blocks or cancels trades.
**Reason**: Wash-trading (A sells to B, B sells back to A at a higher price) threatens FVM integrity and marketplace economy. Oracle pattern ensures verification results are transparent and auditable on-chain, not just in the backend database.

## ADR-026: Dismantle & Crystal — Burn-to-Earn Currency
**Status**: Accepted
**Decision**: Digital cards can be "dismantled" (permanent on-chain burn) to earn Crystal — a new currency that CANNOT be purchased, topped up, or transferred. Crystal can only be obtained from dismantle. `crystal_balances` collection is completely separate from `credits` so the two currencies never mix. Burned cards change status to `"Burned"` in MongoDB (not deleted) to maintain provenance and transparency via Scan. Burned cards don't appear in the active Collection grid but can still be searched by Card ID.
**Dismantle rates**: Common=20, Rare=50, Epic=120, Legendary=300 Crystal (proportional to FVM price range).
**On-chain**: `burnCard(tokenId, owner)` calls OpenZeppelin `_burn()` which permanently destroys the ERC1155 token. Only Digital cards can be burned — Vaulted cards are blocked by the existing `_update()` override.
**Replaces Buyback concept**: Dismantle & Crystal replaces the buyback plan — permanent on-chain burn, non-purchasable/non-cashable new currency, no financial liability.
**Roadmap (NOT built in this session)**: Crystal trading system between users will restructure the existing Marketplace. Crystal will become an alternative currency for listing and buying cards from other users.
**Reason**: On-chain burn proves cards are truly destroyed (transparent, auditable on Monad Explorer). Crystal as a non-purchasable currency avoids financial liability and regulation. Separate collections prevent cross-currency bugs.
**Known limitation**: After burn, `cardStatus(tokenId)` on-chain still shows the last value before burn (not reset to "Burned" state) because the ERC1155 token no longer exists after `_burn()`. The source of truth for "Burned" status is in MongoDB (`cards.status === "Burned"`). Keep in mind that if there's a future feature reading `cardStatus` directly from chain without cross-checking MongoDB — need to check `balanceOf(owner, tokenId) == 0` as a burn indicator.

## ADR-027: Become a Creator — Whitelist Form for IP Owners
**Status**: Accepted
**Decision**: The `/creators` page provides a whitelist form for external IP Owner collaboration. Purely web2 feature (MongoDB `creator_applications` collection, no blockchain). Form collects: name, brand/IP, IP type, social media, email, interest, estimated community size. Honeypot field `website_url` for anti-spam bot (returns fake 200 without insert). Admin "Creators" tab displays all submissions. Revenue split 70/30 (creator/platform) per the infrastructure-first model from the PRD.
**Reason**: Acquiring external IP Creators is Gachard's primary growth vector. Whitelist form enables a partner pipeline without technical commitment from creators. Web2-only because there's no blockchain need for registration — blockchain only becomes relevant after IP is onboarded and cards are minted.

## ADR-028: Privy Integration — Optional Self-Custody Wallet
**Status**: Accepted
**Decision**: Integrate Privy embedded wallet as optional "For Advanced Users" section in `/profile`. Uses `@privy-io/react-auth@1.93.0` (pinned — v2+/v3+ incompatible with Turbopack/Webpack in Next.js 16). Progressive disclosure UX: no technical terms visible until user explicitly expands "Show Technical Details". Wallet creation via Privy SDK, address verifiable on Monad block explorer. Export private key NOT available in v1.93.0 (`useExportWallet` hook added in v2+).
**Scope**: ONLY affects `/profile` page. Core flow (pack purchase, fulfill, print, redeem, marketplace) remains 100% custodial — no changes to mint, blockchain.ts, or smart contracts.
**Reason**: Gachard's central bet is that mainstream users should never see a wallet (ADR-002). But that bet only holds if the people who *do* want custody of their own keys are not locked out. Privy lets both audiences share one app: the default path stays fully custodial, and a user who wants a self-custody wallet can create one without a single blockchain term appearing until they ask for it. Scoped to `/profile` so the core flow carries zero added risk. It also makes the project eligible for the Privy bounty ($5,000) at the Monad Metropolis Hackathon, which is a welcome side effect rather than the reason for the design.
**Known limitation**: Export private key not available — wallet address can be viewed and verified on block explorer, but cannot be exported to other wallets. Decision to pin to v1.93.0 was made after confirming v2+/v3+ dependency tree (@headlessui/react v2 → react-aria v3 subpath exports; WalletConnect/AppKit) is incompatible with both Turbopack and Webpack in Next.js 16.

## ADR-029: Pyth Entropy for Provably Fair Pack Randomness
**Status**: Accepted
**Decision**: Pack rarity is derived from a seed supplied by Pyth Entropy on Monad Testnet, not from `Math.random()`. A dedicated `PackEntropy.sol` contract implements `IEntropyConsumer` and holds its own MON balance to pay entropy fees. The flow is three steps: `requestPack()` asks Pyth for randomness; Pyth's `entropyCallback()` writes the seed on-chain; `fulfillPack()` accepts the rarities computed off-chain, checks them, stores a commitment, and mints.

Four properties make the result auditable:
1. **Seed provenance** — `packSeed` can only be written by the Pyth Entropy contract. `IEntropyConsumer._entropyCallback()` enforces `require(msg.sender == entropy)`, `entropyCallback` is `internal` so there is no other entry point, and the entropy address is `immutable`, fixed at construction to `0x825c0390f379C631f3Cf11A82a37D20BddF93c07`. The backend cannot inject a seed.
2. **Hash commitment (Opsi C)** — `fulfillPack()` stores `keccak256(abi.encodePacked(packSeed[seq], rarities))`. This binds the rarities to that specific seed permanently.
3. **Structural check** — `require(rarePlusCount >= req.guaranteed)` makes the advertised Rare+ guarantee unbreakable by the backend; a violating pack reverts.
4. **Independent verification** — anyone can read `getSeed(seq)`, recompute the rarities with the documented deterministic shuffle, recompute the commitment, and compare against `getRarityHash(seq)`. `frontend/scripts/verify-entropy-onchain.ts` does exactly this, and `/api/verify/pack/[txHash]` exposes it publicly.

**Shuffle location (Opsi B)**: the seed lives on-chain, the Fisher-Yates shuffle runs off-chain in `buildPackRaritiesFromSeed()` (seeded xorshift64). Chosen over an on-chain shuffle to save roughly 150k-200k gas per pack.

**Access control**: `requestPack()` and `fulfillPack()` are both `onlyOwner` (the admin relayer). This was added after a security review — without it, anyone could fulfill someone else's pack.

**Fee handling**: `PackEntropy` pays entropy fees from its own balance rather than the admin wallet, so the fee budget is monitorable separately from gas. The contract balance needs periodic checking; the admin console surfaces it.

**Reason**: "Provably fair" is the core trust claim of any pack-opening product. With `Math.random()` a user simply has to believe the server. With this design the user can verify a specific pack after the fact, and the platform cannot alter a pack's outcome after seeing the seed without producing a commitment mismatch that anyone can detect.

**Verified**: 78/78 Foundry tests pass (20 covering PackEntropy, including a runtime proof that an unauthorized `entropyCallback` caller is rejected). 9 live production transactions were re-verified independently on 15 September 2026 — commitment hash, per-token `cardRarity()`, and the Rare+ guarantee all matched in every case.

**Known limitation**: the shuffle algorithm itself is not cryptographically constrained. The commitment proves the rarities were derived consistently from the on-chain seed, but a biased algorithm would still produce a matching hash. Closing that gap requires moving the shuffle on-chain, at the gas cost noted above. This is a deliberate trade-off, not an oversight.

**Contracts**: `PackEntropy` at `0x6B53C35e8baBaaBe4DD725573C3f612121764542`, minting through `GachardCard` at `0x2a05a2e3b0e7355b97de593e354063e9474c9d08` via the `authorizedMinters` role. Both verified on Sourcify (`exact_match`).

## ADR-030: MiMo as the Single AI Provider
**Status**: Accepted
**Decision**: All LLM calls in the application go to MiMo (`MiMo-V2.5-Pro`) through one OpenAI-compatible endpoint, configured by `MIMO_API_KEY` (plus optional `MIMO_BASE_URL` and `MIMO_MODEL`). This covers trade risk scoring (`lib/risk-score.ts`) and marketplace insight plus listing-price suggestion (`lib/market-insight.ts`). `lib/market-insight.ts` previously called Gemini directly; it was migrated to MiMo on 15 September 2026.

**Reason**: two providers meant two credentials, and in practice neither was configured in production — `GEMINI_API_KEY` existed only in the local `.env.local` and `MIMO_API_KEY` was documented nowhere at all. Both AI features were therefore silently inert in production while the documentation advertised them. One provider means one key to set and one thing to verify after deploying.

**Consequence — failures are silent by design**: `calculateRiskScore()` catches its own errors and returns `{ riskScore: 0, flagged: false, reasoning: "AI scoring unavailable" }` so a provider outage never blocks a trade. That is correct behaviour for the user, but it means a missing key looks identical to "no suspicious signals". **After any deployment, confirm `MIMO_API_KEY` is set** — nothing will fail loudly if it is not.

**Scope**: `@google/generative-ai` is left in `package.json` for now; removing it is safe cleanup but npm reinstalls on this Windows setup have historically corrupted `node_modules`, so it is deferred rather than risked mid-hackathon.

**Note on AI vision**: card image verification remains unbuilt. ADR-022 deferred it, and nothing in this decision changes that — this ADR is only about which provider serves the text-based AI features that already exist.
