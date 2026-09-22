# Architecture Decision Records

## ADR-001: Token Standard, ERC-1155
**Status**: Accepted
**Decision**: Use ERC-1155 for cards (not ERC-721).
**Reason**: ERC-1155 was chosen for gas-efficient batch operations (mint multiple tokens in a single transaction) and flexibility of multi-token-type in a single contract. **Important note**: although ERC-1155 supports fungible balance (multiple users can hold quantity >1 for the same tokenId), in Gachard each card gets a unique tokenId (one-token-per-instance) to support per-card vault status tracking per ADR-004. Rarity is stored as metadata per tokenId (`cardRarity` mapping), not as grouping of the same tokenId. Open to combination with ERC-721 in production if individual uniqueness is needed (e.g. numbered legendary editions).

## ADR-002: Wallet (Custodial, Hidden from User)
**Status**: Accepted, **amended 22 September 2026** (see Amendment below; "never see a wallet address" is no longer literally true, and the rule that replaced it is stated here)
**Decision**: Users log in via Google OAuth; wallet is created automatically by the backend, private key stored on server. Users only know their username `@user`, never see a wallet address.
**Reason**: Core product philosophy. Blockchain must be completely hidden from end-users for mainstream UX, avoiding Web3/crypto stigma.

**Amendment, 22 September 2026: the boundary is a surface, not a user.**

This ADR says users "never see a wallet address". Since ADR-028 and ADR-031 that is false, and it has been false for longer than the document admitted. The real rule lived only as a comment in `components/wallet/WalletWorkspace.tsx`, which is not where a rule belongs. It is written down here.

**The rule.** The consumer surfaces — `/`, `/collect`, `/collection`, `/play`, `/trade`, `/scan`, `/wishlist` — offer no wallet *action*, for every user, in every state. Not hidden behind a setting: absent. `/wallet` is the one page that is explicit, and `/profile` names Privy only in the "For Advanced Users" section that leads there. Nobody arrives at either by accident.

The word itself survives in exactly one situation, described under **The one exception** below. Everywhere else on those pages it does not appear at all: verified by grep, the seven page files above contain zero occurrences of "wallet".

**Why the euphemism has to stop at that boundary.** Hiding the wallet is right while the wallet is Gachard's responsibility; the user has no decision to make, so the word would only add friction and crypto stigma. Once they connect a wallet of their own the responsibility moves to them, and a soft word for something that is now their liability stops being kind. (That used to be gated by a separate Advanced Access switch in /profile. It was removed on 22 September 2026: it asked the same question twice — a wallet exists here for one purpose — and could only realistically be off by accident, which left /wallet/move blocked with no sign from the profile of why. Connecting the wallet is the decision now. Nothing about the consumer surfaces changes; they carry no wallet actions because those do not exist there, not because a setting hides them.) Three concrete failures, not hypothetical:

- **Sending to an outside address.** The user copies it from MetaMask, Rabby or an exchange, and every one of those says *wallet*. A private Gachard word would leave them unable to match the thing on screen to the thing they are pasting into, in the one flow where a mistake costs the card permanently.
- **The private key screen.** "Reveal private key" has no object without the word. The key to *what*? (That screen is switched off as of 22 September 2026 — see ADR-028 — but the point stands wherever the word has to carry a noun, and it is the clearest example of why.)
- **The warning itself.** It reads "You become responsible for the wallet." A warning written in a vocabulary only this app uses is not a warning. The same applies when the user asks for help: they need words the rest of the ecosystem understands, or they can only ever explain the problem to us.

**What enforces it.** Not review. `components/CardItem.tsx` has no export code path at all — it was removed, not gated, so no setting or prop can bring the button back. Choosing which cards leave happens only on `/wallet/move`, a page of its own: `/wallet` answers "what do I hold?", and stacking a grid of candidates above the cards already held meant neither read as the main list. The invariant is greppable: `"Move to My Wallet"` and `export-wallet` appear in zero client bundles after a build, and they should stay at zero.

**What this costs.** A user who wants to move a card must go to `/wallet` to do it; there is no shortcut from the card itself. That is the intended trade. The previous arrangement put an irreversible action on the consumer surface and relied on a switch to keep it out of sight, which left `/collection` one setting away from becoming a crypto page. One deliberate navigation is cheaper than that.

**The one exception: a card that is already out.** Such a card shows the status **In Your Wallet** and a **Manage in Wallet** link to `/wallet`, both on `/collection`. This is wallet vocabulary on a consumer surface and it is deliberate. The alternative is a card that vanishes from the collection with nothing saying where it went, or a status invented to avoid the word, which would leave the user unable to reason about a card they can no longer print, list or dismantle. The word is the smaller harm.

Note what the exception is not: it appears only *after* the user has moved a card, by their own choice, from `/wallet`. It is never the thing that introduces them to the idea.

## ADR-003: Gas Fee, Platform-Sponsored
**Status**: Accepted
**Decision**: All transactions (mint, print, redeem) are executed by the backend on behalf of the user; the backend/platform covers gas fees.
**Reason**: Users should never hold crypto or understand the concept of gas fees.
**Known limitation**: a single admin/relayer wallet becomes a centralization point that needs multi-sig or a third-party custodian in production.

## ADR-004: Card State Machine (Lock In-Place via Status Flag, Not Burn)
**Status**: Accepted (clarified 28 July 2026)
**Decision**: NFT is never burned on print. Status changes `Digital → Vaulted` (transfer to vault address, normal transfers rejected during this status) `→ Digital` (redeem, transfer to new owner). **On-chain clarification**: Deployed contract `requestPrint()` performs `_update(ownerAddress, address(this))` which moves the NFT to the vault (contract address). `_update()` override blocks normal transfers when `cardStatus == Vaulted`. NFT moves on-chain to the contract when vaulted, not staying in the user's wallet.
**Reason**: History/provenance remains intact within a single token ID, simpler for AI-scan provenance, and more intuitive for the product narrative ("locked", not "destroyed").
**Verified**: 28 July 2026, `safeTransferFrom` on a Vaulted token (tokenId 46) REVERTs with message "Card is vaulted, transfer blocked". Digital tokens (tokenId 45) can be transferred normally.

## ADR-005: Redeem Code, Hash Overwrite per Print Cycle
**Status**: Accepted
**Decision**: Each `requestPrint()` generates a new random code; its hash overwrites the old hash in `storedHash[tokenId]`. Plaintext code is never stored permanently or displayed in UI/on-chain.
**Reason**: Codes from previous print cycles automatically expire without needing a separate "used code" list. Prevents old physical cards (not yet scratched) from remaining valid after a card is reprinted for a new owner.

## ADR-006: Redeem, Backend-Only Access (Rate-Limited)
**Status**: Accepted
**Decision**: `redeemCard()` can only be accessed via backend API (login → input code), not free on-chain calls from any wallet. Backend implements rate-limiting (e.g. max 5 attempts/minute/account).
**Reason**: Since gas is platform-sponsored, free access risks abuse for spam brute-force code guessing with costs borne by the platform, not the attacker.

## ADR-007: Explicit `recipientAddress`, Not `msg.sender`
**Status**: Accepted
**Decision**: `redeemCard()` accepts an explicit `recipientAddress` parameter (the logged-in user's wallet), instead of relying on `msg.sender`.
**Reason**: Since the backend calls the contract on behalf of the user, `msg.sender` is actually the backend/relayer wallet, not the user's wallet, an explicit parameter is needed so the card is sent to the correct user.

## ADR-008: Payment, Two Separate Tracks (Credit vs Direct)
**Status**: Accepted
**Decision**: **Credit** (top-up any amount, stored as integer/cents in the database, used exclusively for buying packs) is completely separated from **Direct Payment** (per transaction, required for print requests, cannot use credits).
**Implementation status (15 Sep 2026)**: Stripe was the intended processor, but no payment SDK is integrated. Both tracks currently run through a simulated checkout that mints `sim_<timestamp>` payment ids. The two-track separation is real; the payment rail is not.
**Reason**: Print requests have real costs (printing + shipping) that are intentionally separated from the virtual pack economy. Reduces repeated Stripe integration for each pack purchase.

## ADR-009: Odds/Rarity (Stored in Backend, Not On-chain)
**Status**: Accepted
**Decision**: Rarity distribution (odds table) is stored in the backend database, can be changed without redeploying the contract. Only the final reveal result is recorded on-chain.
**Reason**: Flexibility to tune odds during testing without the cost/delay of contract redeployment.

## ADR-010: Marketplace ("Coming Soon", Not a Demo Feature)
**Status**: Accepted
**Decision**: Marketplace is only displayed as a UI placeholder "Coming Soon" for the hackathon, not functional (no real trading/listing).
**Reason**: Not a core product differentiator; time redirected to the core mint–vault–redeem loop and AI scan features required for the hackathon theme.

## ADR-011: Card Artwork, Manual AI Generation Upfront
**Status**: Accepted
**Decision**: Card artwork is generated once upfront manually, not generated on-demand during reveal.
**Reason**: Demo reliability. On-demand generation adds complexity and wait time that risks issues during live presentation.

## ADR-012: Emergent → Claude Code + Self-Hosted Migration
**Status**: Accepted
**Decision**: Use Emergent (via 7-day pass + first month Standard, ~350 credits) specifically for Sprint 1–3 (foundation, mint, vault/redeem state machine). After that, push code to GitHub and continue Sprint 4–6 with Claude Code (Pro, $20/month). Self-deploy to Vercel (frontend), Render/Railway (backend), MongoDB Atlas (database), all free tier for hackathon demo scale. Smart contract remains deployed directly to Monad Testnet, independent of hosting choice.
**Reason**: Emergent's cost model (credit-per-action) is not predictable and expensive for long-term use; Claude Code (flat subscription) is more predictable for iterative work in Sprint 4–6. The stack used by Emergent (React/Next.js + FastAPI + MongoDB) is portable to any standard hosting.
**Migration note**: audit Stripe integration (and other Playbook integrations) to ensure using direct SDK/API, not relying on Emergent-specific environment configuration.

## ADR-013: Delivery Platform, PWA (Progressive Web App)
**Status**: Accepted
**Decision**: Gachard is built as a PWA (manifest.json + service worker on top of React/Next.js stack), not a separate native app for iOS/Android.
**Reason**: Avoids App Store review process that risks being blocked by Apple's policies on NFT/digital collectibles. Single codebase for all platforms, fitting the hackathon timeline. Camera (for AI-scan) and Stripe checkout still function normally in web/PWA context.
**Known limitation**: push notifications on iOS PWA are still more limited than native apps, not relevant for hackathon demo, noted for production consideration.

## ADR-014: Tool-Agnostic Documentation + Per-Tool Adapters
**Status**: Accepted
**Decision**: Core project documents (`README.md`, `MEMORY.md`, `DECISIONS.md`, `docs/`, `sprints/`) are written purely as tool-agnostic markdown. Each AI coding tool used (Emergent, Claude Code, MiMo Code, etc.) has one small "adapter" file (`CLAUDE.md` for Claude Code, `.mimo/config.md` for MiMo Code) that points to the same core documents, not duplicating content.
**Reason**: The team considers switching tools/models (Emergent → Claude Code → MiMo Code with MiMo V2.5 Pro model, possibly switching again). With tool-independent core documentation, switching tools doesn't require rewriting context, just create a new adapter if needed.
**Note**: MiMo Code (early release, still alpha as of July 2026) supports connections to various LLM providers (not locked to MiMo models only) and automatically imports configuration from Claude Code during migration, which strengthens the feasibility of this adapter approach. Since it's still early-stage software, maintaining frequent Git commits as a fallback remains important in case the tool is unstable.

## ADR-015: Primary Tool, MiMoCode (mimo-v2.5-pro) From the Start, No Emergent
**Status**: Accepted (supersedes the approach in ADR-012)
**Decision**: All development (Sprint 1–6) uses MiMoCode (model `mimo-v2.5-pro`, paid via Xiaomi MiMo Platform or custom third-party provider) from the start. Emergent is not used at all. Git + GitHub repo setup is done manually from Sprint 1 (not auto-sync like Emergent). Self-hosted setup (Vercel/Render/MongoDB Atlas, free tier) is prepared from Sprint 1, not waiting for mid-project migration.
**Reason**: Simplifies to one tool throughout the project (instead of two different tools at different phases), cost model is more predictable (Token Plan/pay-as-you-go), and MiMoCode has a persistent memory system (`MEMORY.md` auto-loaded, task tracking, checkpoint) that fits our documentation approach.
**Supersedes**: ADR-012 (Emergent → Claude Code plan) no longer applies.

## ADR-016: Correction, MiMoCode Auto-Loaded Files
**Status**: Accepted
**Decision**: `MEMORY.md` is the official file automatically read by MiMoCode each session (part of its built-in persistent memory system: `MEMORY.md`, `checkpoint.md`, `notes.md`, `tasks/<id>/progress.md`). `.mimo/config.md` and `CLAUDE.md` are **not** files automatically read by MiMoCode, both are maintained as references for humans/other tools (e.g. if switching back to Claude Code later), not as auto-load mechanisms for MiMoCode.
**Reason**: Technical clarification after checking MiMoCode's official documentation directly (July 2026), main instructions for the agent were moved to the top of `MEMORY.md` to ensure they are actually auto-read.

## ADR-017: Backend Architecture, Next.js API Routes as the Sole Backend
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
**Reason**: Serverless functions on Vercel are stateless, so in-memory storage is inconsistent across invocations. MongoDB ensures rate-limiting remains effective even if requests are routed to different instances.

## ADR-020: Private Key Encryption in Database
**Status**: Accepted
**Decision**: All private keys (user wallets and admin wallets) are encrypted using AES-256-GCM before being stored in MongoDB. The secret key is stored in environment variable `ENCRYPTION_SECRET_KEY` (minimum 32 characters), not in the database. When used to sign transactions, the private key is decrypted first.
**Reason**: Plaintext private keys in the database are a critical security risk, if the database leaks, all wallets can be stolen. AES-256-GCM provides authenticated encryption (integrity + confidentiality). The secret key in env var ensures that database compromise alone is not sufficient to decrypt.

## ADR-021: Pack System (Standard & Booster)
**Status**: Accepted
**Decision**: Two pack types available:
- **Standard Pack**: 5 cards at 500 Credits (1 guaranteed Rare+)
- **Booster Pack**: 10 cards at 800 Credits (2 guaranteed Rare+)

Cards follow the normal odds table. Guaranteed slots are Rare/Epic/Legendary with relative weights. Mint via `mintBatch()` atomic (1 transaction for the entire pack). Guaranteed slots are shuffled so they're not always in the same position.
**Reason**: Two pack tiers give users choice based on budget. The Standard pack offers quick collection building, while the Booster pack provides better value per card. Atomic `mintBatch()` saves gas and ensures consistency (all or nothing).
**Supersedes**: Previous ADR-021 referenced "8 cards per pack", updated to match actual implementation.

## ADR-022: AI Vision (Deferred, Not Started)
**Status**: DEFERRED. Not implemented.
**Decision**: AI vision for visual card analysis is deferred from the current hackathon scope. All card verification relies on QR lookup, matching on-chain state against MongoDB.
**Correction (15 Sep 2026)**: this record previously stated that reference code remained in `lib/vision.ts`. That file has never existed, no vision code was ever written. Corrected so the record matches the repository.
**Correction (15 Sep 2026)**: this record previously called AI vision "a required eligibility criterion for the AI x Web3 theme across all tracks". That requirement could not be confirmed on the Metropolis programme page, which describes AI as the focus of Track 04 rather than a universal gate. Treat it as unverified rather than established.
**Reason for deferral**: priority went to stabilising the core loop. The AI that is live is text-based, trade risk scoring and marketplace insight, both via MiMo (ADR-030).
**Intended value if built**: comparing a photographed card against its on-chain template would catch forgeries that carry a valid-looking QR code, which QR lookup alone cannot detect.

## ADR-023: Card Template System
**Status**: Accepted
**Decision**: Cards are based on templates stored in MongoDB `card_templates` collection. Each template defines: name, description, image path, rarity, and a unique templateId. When a card pack is opened, random templates are selected based on odds table, and individual cards are minted from these templates. This separates the card design (template) from the individual instance (card).
**Reason**: Enables easy addition of new card designs without smart contract changes. Templates can be managed via admin console. Each card instance tracks its template reference for metadata lookup.

## ADR-024: Marketplace, Functional Trade System
**Status**: Accepted. Supersedes ADR-010
**Decision**: Implement full marketplace with listing, buying, cancelling. Cards listed via `isListed` flag (MongoDB) + `marketplaceTransfer()` on-chain. Marketplace fee 8%. FVM (Fair Value Market) calculates average sold price per template. AI-powered market insight and price suggestion via LLM (provider is MiMo, see ADR-030; this line previously said Gemini API). Print blocked while card is listed.
**Reason**: Enhances demo value for the hackathon. Shows full card lifecycle: mint → collect → trade → print → redeem. Blockchain abstraction is maintained: users see Credit prices, not crypto.

## ADR-025: AI Anomaly Detection Oracle for Trade
**Status**: Accepted
**Decision**: Detect wash-trading patterns in marketplace transactions using an Oracle approach:
1. **Deterministic signals** (`fraud-signals.ts`): `repeatPairCount` (wallet pair frequency), `priceDeviationPct` (price deviation from FVM), `resaleSpeedHours` (resale speed).
2. **AI risk scoring** (`risk-score.ts`): an LLM synthesizes the three signals into a 0-100 score. Provider is MiMo, see ADR-030. (This line previously said Gemini, which never matched the code.) Threshold `flagged = riskScore >= 70`.
3. **On-chain Oracle** (`recordVerification()`): Score and flag results are posted to the smart contract, recorded permanently on blockchain.
4. **FVM exclusion**: Transactions with `flagged === true` are excluded from FVM calculation to prevent price manipulation.
5. **Non-blocking**: All scoring occurs AFTER the transaction completes, never blocks or cancels trades.
**Reason**: Wash-trading (A sells to B, B sells back to A at a higher price) threatens FVM integrity and marketplace economy. Oracle pattern ensures verification results are transparent and auditable on-chain, not just in the backend database.

## ADR-026: Dismantle & Crystal, Burn-to-Earn Currency
**Status**: Accepted
**Decision**: Digital cards can be "dismantled" (permanent on-chain burn) to earn Crystal, a new currency that CANNOT be purchased, topped up, or transferred. Crystal can only be obtained from dismantle. `crystal_balances` collection is completely separate from `credits` so the two currencies never mix. Burned cards change status to `"Burned"` in MongoDB (not deleted) to maintain provenance and transparency via Scan. Burned cards don't appear in the active Collection grid but can still be searched by Card ID.
**Dismantle rates**: Common=20, Rare=50, Epic=120, Legendary=300 Crystal (proportional to FVM price range).
**On-chain**: `burnCard(tokenId, owner)` calls OpenZeppelin `_burn()` which permanently destroys the ERC1155 token. Only Digital cards can be burned, Vaulted cards are blocked by the existing `_update()` override.
**Replaces Buyback concept**: Dismantle & Crystal replaces the buyback plan, permanent on-chain burn, non-purchasable/non-cashable new currency, no financial liability.
**Roadmap (NOT built in this session)**: Crystal trading system between users will restructure the existing Marketplace. Crystal will become an alternative currency for listing and buying cards from other users.
**Reason**: On-chain burn proves cards are truly destroyed (transparent, auditable on Monad Explorer). Crystal as a non-purchasable currency avoids financial liability and regulation. Separate collections prevent cross-currency bugs.
**Known limitation**: After burn, `cardStatus(tokenId)` on-chain still shows the last value before burn (not reset to "Burned" state) because the ERC1155 token no longer exists after `_burn()`. The source of truth for "Burned" status is in MongoDB (`cards.status === "Burned"`). Keep in mind that if there's a future feature reading `cardStatus` directly from chain without cross-checking MongoDB, need to check `balanceOf(owner, tokenId) == 0` as a burn indicator.

## ADR-027: Become a Creator, Whitelist Form for IP Owners
**Status**: Accepted
**Decision**: The `/creators` page provides a whitelist form for external IP Owner collaboration. Purely web2 feature (MongoDB `creator_applications` collection, no blockchain). Form collects: name, brand/IP, IP type, social media, email, interest, estimated community size. Honeypot field `website_url` for anti-spam bot (returns fake 200 without insert). Admin "Creators" tab displays all submissions. Revenue split 70/30 (creator/platform) per the infrastructure-first model from the PRD.
**Reason**: Acquiring external IP Creators is Gachard's primary growth vector. Whitelist form enables a partner pipeline without technical commitment from creators. Web2-only because there's no blockchain need for registration, blockchain only becomes relevant after IP is onboarded and cards are minted.

## ADR-028: Privy Integration, Optional Self-Custody Wallet
**Status**: Accepted, **amended 22 September 2026** (see Amendment below; the pinning constraint no longer holds)
**Decision**: Integrate Privy embedded wallet as optional "For Advanced Users" section in `/profile`. Uses `@privy-io/react-auth@1.93.0` (pinned, v2+/v3+ incompatible with Turbopack/Webpack in Next.js 16). Progressive disclosure UX: no technical terms visible until user explicitly expands "Show Technical Details". Wallet creation via Privy SDK, address verifiable on Monad block explorer. Export private key NOT available in v1.93.0 (`useExportWallet` hook added in v2+).
**Scope**: ONLY affects `/profile` page. Core flow (pack purchase, fulfill, print, redeem, marketplace) remains 100% custodial, no changes to mint, blockchain.ts, or smart contracts.
**Reason**: Gachard's central bet is that mainstream users should never see a wallet (ADR-002). But that bet only holds if the people who *do* want custody of their own keys are not locked out. Privy lets both audiences share one app: the default path stays fully custodial, and a user who wants a self-custody wallet can create one without a single blockchain term appearing until they ask for it. Scoped to `/profile` so the core flow carries zero added risk. It also makes the project eligible for the Privy bounty ($5,000) at the Monad Metropolis Hackathon, which is a welcome side effect rather than the reason for the design.
**Known limitation**: Export private key not available. The wallet address can be viewed and verified on block explorer, but cannot be exported to other wallets. Decision to pin to v1.93.0 was made after confirming v2+/v3+ dependency tree (@headlessui/react v2 → react-aria v3 subpath exports; WalletConnect/AppKit) is incompatible with both Turbopack and Webpack in Next.js 16.
**Amendment, 22 September 2026, the pin is lifted.**

The constraint this ADR rests on was retested and no longer holds. `@privy-io/react-auth@3.44.0` installs, builds under Turbopack on Next.js 16 in about 10 seconds, typechecks, and runs: `/profile` loads, the SDK initialises, and `auth.privy.io/api/v1/apps/<appId>` answers 200. It still pulls the dependency tree named above, `@headlessui/react` v2 and WalletConnect, so that tree was never the real blocker, or it has since been fixed upstream. Exactly one line of our code had to change: `embeddedWallets.createOnLogin` moved under an `ethereum` key.

**The upgrade was not optional in the end.** This app's Privy wallets run in `user-controlled-server-wallets-only` mode, and v1.93.0's `delegateWallet` targets the delegated-actions flow Privy has retired. Calling it does not fail, it hangs: nothing answers and the promise never settles. Delegation is required for the server to act on a user's wallet at all (ADR-031), so on v1.93.0 the export/import feature could never have worked. The pin was not a safe default, it was a dead end.

**What the upgrade changed for us:**

- `useSigners().addSigners()` replaces the retired API and works. Delegation is proven against a real wallet.
- **`useExportWallet` is available**, so the "Known limitation" above is void as a *constraint*: the SDK can do it. Shipping it is a separate question, answered separately — see the note below.
- `useSessionSigners` exists but is deprecated in favour of `useSigners`.

**Two runtime differences that cost time, recorded so they are not rediscovered:** `signTypedData` resolves to `{ signature }` in v3 where v1.93.0 resolved to the string, and typecheck cannot catch the difference when the value goes straight into `JSON.stringify`. And the SDK provides no way to attach the `privy-authorization-signature` header, which delegated wallets require: passing it in the rpc params leaves it in the body, passing it through request options never reaches the wire, and both return 401. Sponsored sends therefore call `POST /v1/wallets/{id}/rpc` with `fetch` directly; everything else still goes through the SDK.

**Key export is built and switched off, 22 September 2026.** `useExportWallet` works, and the "Reveal private key" section exists behind a `SHOW_KEY_EXPORT` constant in `components/wallet/WalletWorkspace.tsx`. It is `false`, so the bundler drops the block entirely and the strings appear in zero client chunks — not hidden from the page, absent from it. The reason is asymmetry: every other irreversible action here is at least *visible* as a risk the user chose, while a key that has been seen cannot be un-seen, by the user or by anyone standing behind them. Flipping the constant is a deliberate act, which is the point.

**Scope is also wider than this ADR states.** Privy is no longer confined to `/profile`. It now has its own page at `/wallet`. Both pages mount their own `PrivyProvider` as islands rather than a global one, so the isolation this ADR was built to protect still holds: the SDK never loads on pack opening, and verified after build, its chunk is absent from the prerendered HTML of both pages. `/collection` briefly carried a per-card export button as well; it was removed on 22 September 2026 and the reasoning is recorded in the amendment to ADR-002.

## ADR-029: Pyth Entropy for Provably Fair Pack Randomness
**Status**: Accepted
**Decision**: Pack rarity is derived from a seed supplied by Pyth Entropy on Monad Testnet, not from `Math.random()`. A dedicated `PackEntropy.sol` contract implements `IEntropyConsumer` and holds its own MON balance to pay entropy fees. The flow is three steps: `requestPack()` asks Pyth for randomness; Pyth's `entropyCallback()` writes the seed on-chain; `fulfillPack()` accepts the rarities computed off-chain, checks them, stores a commitment, and mints.

Four properties make the result auditable:
1. **Seed provenance**: `packSeed` can only be written by the Pyth Entropy contract. `IEntropyConsumer._entropyCallback()` enforces `require(msg.sender == entropy)`, `entropyCallback` is `internal` so there is no other entry point, and the entropy address is `immutable`, fixed at construction to `0x825c0390f379C631f3Cf11A82a37D20BddF93c07`. The backend cannot inject a seed.
2. **Hash commitment (Opsi C)**: `fulfillPack()` stores `keccak256(abi.encodePacked(packSeed[seq], rarities))`. This binds the rarities to that specific seed permanently.
3. **Structural check**: `require(rarePlusCount >= req.guaranteed)` makes the advertised Rare+ guarantee unbreakable by the backend; a violating pack reverts.
4. **Independent verification**: anyone can read `getSeed(seq)`, recompute the rarities with the documented deterministic shuffle, recompute the commitment, and compare against `getRarityHash(seq)`. `frontend/scripts/verify-entropy-onchain.ts` does exactly this, and `/api/verify/pack/[txHash]` exposes it publicly.

**Shuffle location (Opsi B)**: the seed lives on-chain, the Fisher-Yates shuffle runs off-chain in `buildPackRaritiesFromSeed()` (seeded xorshift64). Chosen over an on-chain shuffle to save roughly 150k-200k gas per pack.

**Access control**: `requestPack()` and `fulfillPack()` are both `onlyOwner` (the admin relayer). This was added after a security review, without it, anyone could fulfill someone else's pack.

**Fee handling**: `PackEntropy` pays entropy fees from its own balance rather than the admin wallet, so the fee budget is monitorable separately from gas. The contract balance needs periodic checking; the admin console surfaces it.

**Reason**: "Provably fair" is the core trust claim of any pack-opening product. With `Math.random()` a user simply has to believe the server. With this design the user can verify a specific pack after the fact, and the platform cannot alter a pack's outcome after seeing the seed without producing a commitment mismatch that anyone can detect.

**Verified**: 78/78 Foundry tests pass (20 covering PackEntropy, including a runtime proof that an unauthorized `entropyCallback` caller is rejected). 9 live production transactions were re-verified independently on 15 September 2026, commitment hash, per-token `cardRarity()`, and the Rare+ guarantee all matched in every case.

**Known limitation**: the shuffle algorithm itself is not cryptographically constrained. The commitment proves the rarities were derived consistently from the on-chain seed, but a biased algorithm would still produce a matching hash. Closing that gap requires moving the shuffle on-chain, at the gas cost noted above. This is a deliberate trade-off, not an oversight.

**Contracts**: `PackEntropy` at `0x6B53C35e8baBaaBe4DD725573C3f612121764542`, minting through `GachardCard` at `0x2a05a2e3b0e7355b97de593e354063e9474c9d08` via the `authorizedMinters` role. Both verified on Sourcify (`exact_match`).

## ADR-030: MiMo as the Single AI Provider
**Status**: Accepted
**Decision**: All LLM calls in the application go to MiMo (`MiMo-V2.5-Pro`) through one OpenAI-compatible endpoint, configured by `MIMO_API_KEY` (plus optional `MIMO_BASE_URL` and `MIMO_MODEL`). This covers trade risk scoring (`lib/risk-score.ts`) and marketplace insight plus listing-price suggestion (`lib/market-insight.ts`). `lib/market-insight.ts` previously called Gemini directly; it was migrated to MiMo on 15 September 2026.

**Reason**: two providers meant two credentials, and in practice neither was configured in production. `GEMINI_API_KEY` existed only in the local `.env.local` and `MIMO_API_KEY` was documented nowhere at all. Both AI features were therefore silently inert in production while the documentation advertised them. One provider means one key to set and one thing to verify after deploying.

**Consequence, failures are silent by design**: `calculateRiskScore()` catches its own errors and returns `{ riskScore: 0, flagged: false, reasoning: "AI scoring unavailable" }` so a provider outage never blocks a trade. That is correct behaviour for the user, but it means a missing key looks identical to "no suspicious signals". **After any deployment, confirm `MIMO_API_KEY` is set**, nothing will fail loudly if it is not.

**Scope**: `@google/generative-ai` is left in `package.json` for now; removing it is safe cleanup but npm reinstalls on this Windows setup have historically corrupted `node_modules`, so it is deferred rather than risked mid-hackathon.

**Note on AI vision**: card image verification remains unbuilt. ADR-022 deferred it, and nothing in this decision changes that, this ADR is only about which provider serves the text-based AI features that already exist.

## ADR-031: Card Export and Import via Privy, With Server-Side Sponsored Signing
**Status**: Accepted
**Supersedes the scope of**: ADR-028 (Privy stays optional and isolated, but is no longer view-only)

**Decision**: A user may move a Digital card out of Gachard's custodial wallet into their own Privy embedded wallet, and move it back. Privy is the active executor in both directions, not a destination address.

**Export**: the user first signs an EIP-712 intent with their own Privy wallet naming the tokenIds, the destination address, and a single-use nonce. (Amended 22 September 2026: the struct was `ExportIntent` with one `tokenId` and was signed once per card, which meant a Privy dialog for every card in a selection. It is now `ExportBatch` with a `uint256[] tokenIds`, signed once for the whole selection. The transfers are still one request per card, because ADR-018 caps a function at ten seconds; only the dialog count changed. The server verifies the array exactly as sent — a reordered or extended one produces a different digest and fails recovery — and then refuses any card not in it. Replay protection became per card within the batch, keyed `nonce:tokenId`, and the rate limit is counted once per signature rather than once per card, since five cards would otherwise exhaust ADR-006's five-a-minute allowance mid-selection. A signature covers at most 20 cards.)

**Import, amended 22 September 2026: returning is a selection too.** Cards in the wallet are picked the same way and returned together. There is no batched signature because there is no signature at all — the wallet has delegated to Gachard, which is the whole reason the server can send on the user's behalf — so a batch here is purely a selection. It is still one request per card for the same ADR-018 reason. The one thing that had to change is the limiter: ten cards is ten calls, and ADR-006's five-a-minute would have cut a user off midway through their own selection, so `checkRateLimit()` now takes an explicit ceiling and `privy_import` passes `DAILY_SPONSORED_LIMIT`. That does not raise what this costs us. Every return is one sponsored transfer and `consumeSponsorshipBudget()` still caps those at 20 per user per day; the per-minute limit was a burst guard, not the spend ceiling. The default stays five, verified: a caller using the default is denied on the sixth attempt and one passing 20 on the twenty-first.) The backend verifies the recovered address matches the Privy wallet recorded for that user, then calls `marketplaceTransfer()` from the admin wallet, because the custodial wallet is the only party that can move a card it holds. A claim transaction is then sent **from the user's Privy wallet with gas paid by Privy**, and only a card that has been claimed may be imported back.

**Import**: the user signs and sends `safeTransferFrom` themselves, from their own Privy wallet, with gas paid by Privy. The backend cannot do this and deliberately has no route that can. The import is settled only once `balanceOf(custodialWallet, tokenId) == 1`, read directly. An earlier draft of this ADR specified a `TransferSingle` scan anchored to the claim block, carried over from a design where the backend had to notice a transfer it had not initiated; since we send the transfer and hold its hash, one balance read is cheaper than log pagination and is stronger evidence than a matching event. `exportClaimBlock` is still recorded as provenance but is no longer load-bearing.

**The `sponsor` flag never appears in client code.** All sponsored transactions are sent server-side through `@privy-io/node` using `PRIVY_APP_SECRET`, and the Privy Dashboard option "Allow transactions from the client" stays **off**. `NEXT_PUBLIC_PRIVY_APP_ID` is inlined into the browser bundle by definition, so with that option on, the only thing guarding the sponsorship balance would be a value printed in the page source. This holds independently of the SDK pinning problem and would still hold if that problem disappeared.

**Client SDK, superseded 22 September 2026.** This ADR originally kept `@privy-io/react-auth` at 1.93.0, on the grounds that its signing hooks were sufficient and the v2/v3 upgrade ADR-028 rejected was therefore unnecessary. The signing hooks were indeed sufficient; delegation was not. v1.93.0's `delegateWallet` targets a flow Privy has retired and simply hangs against this app's wallet mode, and without delegation the server cannot send from a user's wallet, which makes import impossible. The client is now on **v3.44.0**. See the amendment to ADR-028. Signing still happens on the client and sponsorship still happens on the server, so the division this ADR describes is unchanged; only the version is.

**No smart contract changes.** `marketplaceTransfer()` is `onlyOwner` but does not constrain the recipient, which covers export. Import rides on stock ERC-1155 `safeTransferFrom`, since the `_update()` override blocks only `Vaulted` cards. The H-2 fix already maintains `lastOwner` on standard transfers, so a user-initiated transfer does not corrupt the state `redeem()` depends on. `GachardCard` and `PackEntropy` are untouched, so no redeploy, no re-verification, and the 78/78 suite still stands.

**"Exported" is a MongoDB status, not an on-chain enum**, following the precedent set for "Burned" in ADR-026. Adding a `CardStatus` member would require a redeploy and would invalidate the paragraph above. The on-chain way to confirm a card is out is `balanceOf(custodialWallet, tokenId) == 0`. Reusing the existing `status` field is deliberate: `dismantle` and `marketplace/listings` already require `status === "Digital"`, so both are guarded by construction; only `print` needs a new check, because it tests only for "Burned".

**Reason**: the Privy bounty requires integration beyond authentication, and ADR-028's wallet is created as a side effect of login and then only displayed, which almost certainly does not qualify. More durably, export/import is the feature that gives ADR-028's "For Advanced Users" section a reason to exist and closes the loop the README roadmap already promises. Import is the strongest evidence of the claim: the card is genuinely the user's, and Gachard has no route that can take it back.

**Verified on 21 September 2026** with three gates, all passed. A throwaway wallet sent a zero-value self-transfer on Monad Testnet with `sponsor: true`; it confirmed in block 64494516 using 248,734 gas, the on-chain payer was neither the user's wallet nor the admin wallet, and the wallet's balance was 0.0 MON before and after. The server SDK builds, typechecks and loads in the Next.js Node runtime without touching Turbopack.

**Consequence, sponsorship is asynchronous**: `wallets().rpc()` returns an empty `hash` plus a `user_operation_hash` and a `transaction_id`. The real hash appears only after polling `transactions().get()`. Code that trusts the first response stores an empty string and fails silently, which is the same failure shape as the `tokenId: null` bug fixed in commit `4658e4e`. Every sponsored call must treat `transaction_id` as the source of truth and poll.

**Consequence, sponsored wallets carry EIP-7702 code**: sponsorship runs on ERC-4337 with Alchemy as provider, and after its first sponsored transaction the user's wallet holds `0xef0100...` delegation code. The address does not change, so the destination a user sees is stable. But ERC-1155 `safeTransferFrom` refuses a recipient with code unless it implements `onERC1155Received`. Confirmed with a real transfer on 21 September 2026, not just an `eth_call`: a test token moved into a delegated wallet (120,511 gas) and came back out through a sponsored transfer the wallet signed itself, with its MON balance still 0.0; the token was burned afterwards and nothing was left behind. This depends on a third-party implementation and must stay covered by an integration test. Export is immune regardless, because `marketplaceTransfer()` calls `_update()` directly and skips the acceptance check; that immunity is inherited luck and is now a property to preserve deliberately.

**Consequence, spend control is ours**: Privy caps total spend only. Per-user and per-timeframe limits are the application's job, and every import is one sponsored transaction, so an export/import loop drains the balance unless rate limited. `checkRateLimit()` from ADR-019 is reused. A global dashboard cap is adequate for the hackathon demo and is not adequate for public use.

**Operational hazard, the Monad RPC "could not coalesce error"**: seen three times during testing, and the transaction had landed every time; only the client-side response parsing failed. Blind retry around a write would therefore execute it twice. Existing code is safe because `withRetry()` wraps reads only, but every new write path must check on-chain state before retrying rather than retrying on the error alone.

**Known limitation**: a card sitting in a user's Privy wallet cannot be listed, printed, dismantled or redeemed until it is imported back. This is inherent, not a defect: the platform does not hold it. `wallets().list()` also returns HTTP 500 against this account, so wallet ids are read from MongoDB rather than from Privy.

## ADR-032: One Identity, the Signed Session Cookie

**Status**: Accepted, 22 September 2026
**Note**: no ADR ever recorded how sessions work in this app. The cookie, the HMAC, the client-written fallback and the two different gates all arrived without one, which is part of why the gap survived as long as it did. This ADR states the mechanism as well as the change.

**Decision**: a request is authenticated by the signed `gachard_session` cookie and by nothing else. `getAuthenticatedUser()` has no fallback. The middleware verifies the same HMAC for protected pages that it already verified for APIs. Logging out is a server round trip. Public endpoints do not emit user identifiers.

**Reason**: the previous arrangement was not a weak check, it was an open door, and it is worth recording exactly how the pieces combined — no single one of them looks alarming on its own.

`getAuthenticatedUser()` accepted a bare `gachard_uid` cookie and looked the user up by it, commented as a fallback for "pre-session-auth users". That cookie was written by client script in `app/login/page.tsx` and carried no signature. The middleware accepted it too, for APIs and for pages. So setting one cookie to a user's MongoDB ObjectId made you that user completely: read their collection, spend their credits, list or dismantle their cards, move cards to a Privy wallet. Not a shell, not a stale view — full authority.

The ids were not secret. `GET /api/marketplace/listings` is in `PUBLIC_API` and returned `{ ...listing }` with nothing removed, and a listing document carries `sellerId`, which is `user._id.toString()`. Anyone could open the marketplace unauthenticated, read a seller's id, set a cookie, and be them. The attack needed no credentials, no interception and no guessing.

**Verified before and after**, against a throwaway user, not by reading the code: with only `gachard_uid` set, `/api/cards` returned the full collection and `/api/user/advanced` returned the account's settings. After the change both return 401, a forged signature returns 401, protected pages redirect, and a genuine session still works.

**Two consequences that had to be fixed in the same change, because the first one broke logout and the second one was the leak itself:**

**Logging out never ended the session.** `handleLogout` cleared localStorage and the uid cookie, which was enough only because pages were gated on that cookie. `gachard_session` is httpOnly by design, so script cannot clear it; the browser stayed authenticated to every API after "Log out". This was already true before this ADR — tightening the page gate merely made it visible. `POST /api/auth/logout` now expires both cookies server-side.

**Public responses stop carrying identifiers.** `sellerId`, `sellerWalletAddress` and the raw `_id` are removed from the listings response. The UI only ever needed "is this listing mine", so the server computes an `isOwn` boolean instead; the seller's id never reaches the browser. The wallet address is a separate harm and would be worth removing even without the takeover: ADR-002 says a user never sees a wallet address, and publishing the seller's lets anyone read that person's entire on-chain collection starting from a listing.

**The rule this leaves**: a public endpoint returns a document only through an explicit field list or an explicit removal. `{ ...doc }` from a collection is how this happened, and it will be how it happens again.

**Consequence, migration**: none for current users. Both Google (`api/auth/google`) and demo (`api/auth/demo`) login already issued the signed httpOnly cookie, so the fallback was serving nobody. A browser carrying only the uid cookie is asked to sign in again.

**Consequence, one mechanism to reason about**: pages and APIs are now gated identically. The earlier split — signed token for APIs, cookie presence for pages — is the kind of asymmetry that reads as deliberate and is easy to extend wrongly. Any page that renders server-side data now sits behind the same verification the data does.
