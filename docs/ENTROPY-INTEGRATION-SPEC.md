# Pyth Entropy Integration — Technical Specification

**Version:** v1.4 (FINAL)
**Status:** Approved for implementation
**Last updated:** 9 September 2026

---

## 1. Kontrak baru: PackEntropy.sol

### Overview
PackEntropy.sol mengelola integrasi Pyth Entropy untuk Gachard pack randomness. Kontrak ini:
- Mengimplementasi `IEntropyConsumer` interface dari Pyth SDK
- Meminta randomness via `entropy.requestV2()` (bayar fee dalam MON)
- Menerima callback via `entropyCallback()` (built-in validation di base contract)
- Menyimpan seed on-chain dan rarityHash (Opsi C hash commitment)
- Memanggil `GachardCard.mintBatch()` via authorized minter role

### Access Control (Critical Security Fix — v1.4)
- `requestPack()`: `onlyOwner` — mencegah pihak luar spam entropy request
- `fulfillPack()`: `onlyOwner` — mencegah pihak luar submit rarities sembarangan
- `entropyCallback()`: validated by `IEntropyConsumer._entropyCallback()` base contract — `require(msg.sender == entropy)`, di-verified secara eksekusi nyata oleh test #16
- Owner: admin wallet yang sama dengan GachardCard.sol (single relayer model, ADR-003)

### Design
```solidity
contract PackEntropy is IEntropyConsumer, Ownable {
    IEntropyV2 public immutable entropy;
    GachardCard public immutable gachardCard;

    struct PackRequest {
        address userAddr;
        uint8 packSize;
        uint8 guaranteed;
        bool fulfilled;
    }

    mapping(uint64 => bytes32) public packSeed;
    mapping(uint64 => bytes32) public packRarityHash;
    mapping(uint64 => PackRequest) public requests;

    constructor(address _entropy, address _gachardCard) Ownable(msg.sender);

    function getEntropy() internal view override returns (address);
    function entropyCallback(uint64, address, bytes32) internal override;
    function requestPack(uint256, address, uint8, uint8) external onlyOwner returns (uint64);
    function fulfillPack(uint64, address, uint8[] calldata) external onlyOwner;
    function getSeed(uint64) external view returns (bytes32);
    function getRarityHash(uint64) external view returns (bytes32);
    function getBalance() external view returns (uint256); // Koreksi 1: monitoring
    receive() external payable;
}
```

### Hash Commitment (Opsi C)
`fulfillPack()` menghitung `rarityHash = keccak256(abi.encodePacked(seed, rarities))` dan menyimpannya secara permanen. Ini menciptakan immutable on-chain binding antara Pyth seed dan rarity array yang di-submit.

### Structural Check
`fulfillPack()` melakukan validasi minimal: menghitung jumlah kartu Rare+ (rarity >= 1) dan memastikan >= guaranteed count. Ini adalah sanity check murah (~500 gas), bukan validasi algoritma penuh.

### getBalance()
View function untuk monitoring saldo MON kontrak. Kritis karena `requestPack()` membayar entropy fee dari saldo kontrak (bukan admin wallet).

---

## 2. Perubahan GachardCard.sol

### Changes
- Tambah `mapping(address => bool) public authorizedMinters`
- Tambah `event AuthorizedMinterUpdated(address indexed minter, bool authorized)`
- Tambah modifier `onlyOwnerOrAuthorized`: `require(msg.sender == owner() || authorizedMinters[msg.sender])`
- Tambah `setAuthorizedMinter(address, bool)` — onlyOwner
- Ganti modifier `mintCard()` dan `mintBatch()`: `onlyOwner` → `onlyOwnerOrAuthorized`
- Existing 54 tests unaffected (all call as owner, revert message updated from `OwnableUnauthorizedAccount` to `"Not authorized"`)

---

## 3. Perubahan Alur Data

### Current Flow (1-step)
```
POST /api/mint → deduct credits → buildRarities(Math.random) → mintBatch → return
```

### New Flow (3-step)
```
1. POST /api/mint → deduct credits → requestPack() → save tx {status:"entropy_pending"} → return txId
2. Background: Entropy provider calls entropyCallback() → stores seed on-chain
3. Background: Backend polls for seed, reads it, computes rarities deterministically, calls fulfillPack() → status → "pending"
4. Background: confirmMint() → status → "confirmed"
```

### New TxStatus Values
```typescript
export type TxStatus = "entropy_pending" | "pending" | "confirmed" | "failed";
```

### MongoDB transactions Collection Additions
- `entropySequenceNumber: number` (from requestV2)
- `entropySeed: string | null` (bytes32 hex, populated after callback)
- `rarityHash: string | null` (bytes32 hex, populated after fulfillment)

---

## 4. Perubahan UX di PackReveal.tsx

### Latency Analysis
- Entropy callback: "~2-5 seconds" (estimated, NOT verified end-to-end on testnet)
- Monad block time: ~1 second
- If entropy resolves within existing "bursting" phase (1.4s): may feel instant

### Recommendation
Add `"requesting"` phase to RevealPhase type, shown only if entropy resolution > 3 seconds.

### Fallback UX
- Entropy request fails: show error + retry button
- Entropy timeout (>30s): auto-refund credits, show error
- Entropy callback fails: show error, manual retry

### Disclaimer
~2-5 seconds latency estimate is based on block time analysis, NOT verified end-to-end on Monad testnet. Actual latency must be measured before UX decisions are finalized.

---

## 5. Fee Handling

- Entropy fee: dynamic, read via `entropy.getFeeV2()` before each request
- Platform covers fee (consistent with sponsored gas model ADR-003)
- Fee paid in MON (native token) from **PackEntropy contract balance** (KOREKSI 1: NOT admin wallet)
- `requestPack()` checks `address(this).balance >= fee` before requesting

### Environment Variables
```
ENTROPY_CONTRACT_ADDRESS=<PackEntropy address after deploy>
PYTH_ENTROPY_ADDRESS=0x825c0390f379c631f3cf11a82a37d20bddf93c07
```

---

## 6. Testing Plan

### Framework
Foundry/forge-std with MockEntropy from Pyth SDK (`@pythnetwork/entropy-sdk-solidity/MockEntropy.sol`).

### MockEntropy Usage
MockEntropy provides `mockReveal(provider, sequenceNumber, randomNumber)` which calls `_entropyCallback()` on the requester contract, simulating the provider callback.

### Test Results
```
PackEntropy.t.sol: 17/17 passed
GachardCard.t.sol: 58/58 passed (54 original + 4 new)
Total: 75/75 passed
```

### PackEntropy.t.sol Test Cases (17)
1. `test_requestPack_stores_metadata`
2. `test_requestPack_calls_entropy_requestV2`
3. `test_entropyCallback_stores_seed`
4. `test_entropyCallback_reverts_for_invalid_sequence`
5. `test_fulfillPack_stores_rarityHash`
6. `test_fulfillPack_structural_check_passes`
7. `test_fulfillPack_structural_check_reverts`
8. `test_fulfillPack_calls_mintBatch`
9. `test_fulfillPack_reverts_before_seed`
10. `test_fulfillPack_reverts_already_fulfilled`
11. `test_getSeed_returns_stored_seed`
12. `test_getRarityHash_returns_stored_hash`
13. `test_hash_consistency`
14. `test_fulfillPack_reverts_for_unauthorized_caller`
15. `test_requestPack_reverts_for_unauthorized_caller`
16. **`test_entropyCallback_reverts_for_unauthorized_sender`** — proves IEntropyConsumer validates msg.sender at runtime
17. `test_getBalance_returns_contract_balance`

### GachardCard.t.sol New Tests (4)
- `test_authorized_minter_can_call_mintBatch`
- `test_unauthorized_address_cannot_call_mintBatch`
- `test_owner_can_still_call_mintBatch`
- `test_setAuthorizedMinter_only_owner`

---

## 7. Trust Model & Hash Commitment

### Layered Security Model
1. **Layer 1 — Access Control**: `onlyOwner` on `fulfillPack()`/`requestPack()` — prevents unauthorized parties from submitting arbitrary rarities. This is the FOUNDATION.
2. **Layer 2 — Hash Commitment**: `keccak256(seed, rarities)` stored on-chain — prevents authorized backend from secretly submitting different rarities than algorithm produces.
3. **Layer 3 — Structural Check**: Minimal Rare+ count validation — cheap sanity check.
4. **Layer 4 — Transparency**: Open-source algorithm + public verification endpoint.

These layers are COMPLEMENTARY, not substitutive. Layer 1 is mandatory for Layers 2-4 to have meaning.

### What Opsi C Provides
- Immutable on-chain binding between Pyth seed and submitted rarities
- `packRarityHash` stored permanently — tamper-proof record
- Anyone can verify: fetch seed + rarityHash from chain → re-run algorithm → compare

### What Opsi C Does NOT Provide
- On-chain algorithm re-execution (that's Opsi A, ~150k-200k gas)
- Prevention of arbitrary rarity submission by authorized backend (detection-based)

### Remaining Trust Gap
- Backend must use the correct deterministic algorithm
- Verified via: open-source code + public verification endpoint `/api/verify/pack/[txHash]`

---

## 8. Endpoint Verifikasi Publik

`GET /api/verify/pack/[txHash]`

### Verification Flow
1. Fetch tx from MongoDB → get `entropySequenceNumber`
2. Read `packSeed(sequenceNumber)` from PackEntropy.sol
3. Read `packRarityHash(sequenceNumber)` from PackEntropy.sol
4. Read minted rarities from GachardCard events in tx receipt
5. Re-run deterministic algorithm: `computedRarities = algorithm(seed, packSize, guaranteed)`
6. Compute `computedHash = keccak256(abi.encodePacked(seed, computedRarities))`
7. Compare: `computedHash == onChainRarityHash` AND `computedRarities == mintedRarities`

### Response
```json
{
  "verified": true,
  "seed": "0x...",
  "rarityHash": "0x...",
  "expectedRarities": [0, 1, 0, 2, 0],
  "actualRarities": [0, 1, 0, 2, 0],
  "match": true
}
```

---

## 9. Migrasi & Rollback

- `lib/odds.ts` preserved as dev-mode fallback (if `ENTROPY_CONTRACT_ADDRESS` not set, use Math.random)
- `buildPackRaritiesFromSeed(seed, packSize, guaranteed)` — deterministic version using seeded xorshift + Fisher-Yates shuffle
- Original `buildPackRarities()` kept as fallback
- README.md update: "Why Monad" section highlights Pyth Entropy

---

## 10. Contract Address Verification

### Pyth Entropy Contract
- Address: `0x825c0390f379c631f3cf11a82a37d20bddf93c07`
- Type: Proxy contract (EIP-1967), implementation at `0xdF21D137...2890538d5`
- Transactions: 4,012 total, last active 2 hours ago
- Balance: 361.17 MON
- Status: **CONFIRMED ACTIVE**

### Default Provider
- Address: `0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344`
- Type: EOA (wallet, not contract)
- Balance: 124.91 MON
- Status: **CONFIRMED ACTIVE**

### Verification Command
```bash
curl -s -X POST https://testnet-rpc.monad.xyz \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["0x825c0390f379c631f3cf11a82a37d20bddf93c07","latest"],"id":1}'
```

### Verification Source
MonadScan on-chain data: https://testnet.monadscan.com/address/0x825c0390f379c631f3cf11a82a37d20bddf93c07

---

## 11. Shuffle Strategy

### Decision: Opsi B (Off-chain Shuffle)
- Seed stored on-chain by `entropyCallback()`
- Backend computes rarities deterministically from seed
- Gas savings: ~150k-200k per pack vs full on-chain shuffle (Opsi A)

### Algorithm
```typescript
function buildPackRaritiesFromSeed(seed: string, packSize: number, guaranteedCount: number): number[] {
  // Seeded xorshift64 PRNG
  // Separate guaranteed Rare+ slots (match odds.ts pattern)
  // Fisher-Yates shuffle with seeded randomness
}
```

---

## 12. IEntropyConsumer Validation (Langkah 0)

### Investigation Result
Source code `lib/pyth-crosschain/target_chains/ethereum/entropy_sdk/solidity/IEntropyConsumer.sol`:

```solidity
function _entropyCallback(uint64 sequence, address provider, bytes32 randomNumber) external {
    address entropy = getEntropy();
    require(entropy != address(0), "Entropy address not set");
    require(msg.sender == entropy, "Only Entropy can call this function");
    entropyCallback(sequence, provider, randomNumber);
}
```

**Conclusion**: Base contract ALREADY validates `msg.sender == entropy`. No manual check needed. Verified at runtime by test #16.

---

## Changelog

- **v1.0**: Initial draft — Opsi A/B/C/D analysis
- **v1.1**: Corrected test count (52→54), verified Pyth addresses, fixed algorithm description
- **v1.2**: Added bytecode verification, confirmed shuffle strategy (Opsi B)
- **v1.3**: Opsi C hash commitment integrated into Phase 1 scope (was fast-follow)
- **v1.4 (FINAL)**: Added mandatory `onlyOwner` access control to `fulfillPack()` and `requestPack()`. Critical security fix — without this, hash commitment can be bypassed. Added `getBalance()` view function for monitoring. Deployment checklist updated: fund PackEntropy contract (not admin wallet) for entropy fees. Test #16 assertion verified from SDK source code.
