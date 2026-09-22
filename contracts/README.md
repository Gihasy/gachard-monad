# Gachard contracts

Two contracts on Monad Testnet, built with Foundry.

| Contract | Address | What it does |
|---|---|---|
| `GachardCard.sol` | [`0x2a05a2e3…74c9d08`](https://testnet.monadvision.com/address/0x2a05a2e3b0e7355b97de593e354063e9474c9d08) | ERC-1155, one token per card instance. Holds the Digital / Vaulted / Real state machine and blocks transfers of a vaulted card in `_update()` |
| `PackEntropy.sol` | [`0x6B53C35e…21764542`](https://testnet.monadvision.com/address/0x6B53C35e8baBaaBe4DD725573C3f612121764542) | Pack randomness through Pyth Entropy's commit-reveal, with the rarity commitment hashed on chain (ADR-029) |

Compiled with solc 0.8.28, EVM cancun, `via_ir`. Both are verified on
MonadVision by Sourcify exact match.

## Commands

```bash
forge build
forge test                 # 78 tests: 58 GachardCard, 20 PackEntropy
forge test --match-contract GachardCardTest -vvv
forge fmt
```

Tests cover mint, print, redeem, transfer, burn, verification, access control
and the entropy request/fulfil flow. The export and import paths added in
ADR-031 need no contract change: they are ordinary ERC-1155 transfers, which
is itself worth knowing — the feature was built without touching a deployed
contract.

## Design notes

The decisions behind these contracts, including the ones that were superseded,
are in [`../DECISIONS.md`](../DECISIONS.md). The entropy design has its own
spec at [`../docs/ENTROPY-INTEGRATION-SPEC.md`](../docs/ENTROPY-INTEGRATION-SPEC.md).

Foundry's own documentation is at https://book.getfoundry.sh/.
