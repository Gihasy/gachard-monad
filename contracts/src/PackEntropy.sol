// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";
import "./GachardCard.sol";

/**
 * @title PackEntropy
 * @notice Manages Pyth Entropy integration for Gachard pack randomness
 * @dev Implements IEntropyConsumer for entropy callback validation.
 *      Stores seed on-chain (immutable), computes rarityHash for verification (Opsi C),
 *      and calls GachardCard.mintBatch() via authorized minter role.
 */
contract PackEntropy is IEntropyConsumer, Ownable {
    IEntropyV2 public immutable entropy;
    GachardCard public immutable gachardCard;

    struct PackRequest {
        address userAddr;
        uint8 packSize;
        uint8 guaranteed;
        bool fulfilled;
    }

    mapping(uint64 => bytes32) public packSeed;      // sequenceNumber → Pyth random seed
    mapping(uint64 => bytes32) public packRarityHash; // sequenceNumber → keccak256(seed, rarities)
    mapping(uint64 => PackRequest) public requests;   // sequenceNumber → request metadata

    event PackRequested(uint64 indexed sequenceNumber, address indexed userAddr, uint8 packSize, uint8 guaranteed);
    event PackFulfilled(uint64 indexed sequenceNumber, address indexed userAddr, bytes32 rarityHash);

    constructor(address _entropy, address _gachardCard) Ownable(msg.sender) {
        entropy = IEntropyV2(_entropy);
        gachardCard = GachardCard(_gachardCard);
    }

    /**
     * @notice Returns the Entropy contract address for IEntropyConsumer validation
     */
    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    /**
     * @notice Callback from Entropy — stores seed on-chain
     * @dev Called by _entropyCallback() AFTER msg.sender validation (built into IEntropyConsumer base)
     */
    function entropyCallback(
        uint64 sequenceNumber,
        address /* provider */,
        bytes32 randomNumber
    ) internal override {
        packSeed[sequenceNumber] = randomNumber;
    }

    /**
     * @notice Request randomness for a pack — calls Pyth Entropy requestV2()
     * @dev Only callable by owner (admin relayer). Entropy fee is paid from this contract's MON balance.
     */
    function requestPack(
        uint256 /* packId */,
        address userAddr,
        uint8 packSize,
        uint8 guaranteed
    ) external onlyOwner returns (uint64 sequenceNumber) {
        uint256 fee = entropy.getFeeV2();
        require(address(this).balance >= fee, "Insufficient contract balance for entropy fee");

        sequenceNumber = entropy.requestV2{value: fee}();

        requests[sequenceNumber] = PackRequest({
            userAddr: userAddr,
            packSize: packSize,
            guaranteed: guaranteed,
            fulfilled: false
        });

        emit PackRequested(sequenceNumber, userAddr, packSize, guaranteed);
    }

    /**
     * @notice Fulfill pack with computed rarities — called by backend after deterministic shuffle
     * @dev Only callable by owner. Computes rarityHash (Opsi C), structural check, then mints.
     */
    function fulfillPack(
        uint64 sequenceNumber,
        address userAddr,
        uint8[] calldata rarities
    ) external onlyOwner {
        PackRequest storage req = requests[sequenceNumber];
        require(req.userAddr != address(0), "Request not found");
        require(!req.fulfilled, "Already fulfilled");
        require(packSeed[sequenceNumber] != bytes32(0), "Seed not received");
        require(rarities.length == req.packSize, "Rarity array length mismatch");

        // Structural check: count Rare+ cards
        uint8 rarePlusCount = 0;
        for (uint256 i = 0; i < rarities.length; i++) {
            require(rarities[i] <= 3, "Invalid rarity");
            if (rarities[i] >= 1) {
                rarePlusCount++;
            }
        }
        require(rarePlusCount >= req.guaranteed, "Insufficient Rare+ count");

        // Hash commitment (Opsi C): immutable on-chain binding
        bytes32 rarityHash = keccak256(abi.encodePacked(packSeed[sequenceNumber], rarities));
        packRarityHash[sequenceNumber] = rarityHash;

        req.fulfilled = true;

        // Mint via authorized minter role
        gachardCard.mintBatch(userAddr, rarities);

        emit PackFulfilled(sequenceNumber, userAddr, rarityHash);
    }

    /**
     * @notice Get the entropy seed for a given request
     */
    function getSeed(uint64 sequenceNumber) external view returns (bytes32) {
        return packSeed[sequenceNumber];
    }

    /**
     * @notice Get the rarity hash for a given request
     */
    function getRarityHash(uint64 sequenceNumber) external view returns (bytes32) {
        return packRarityHash[sequenceNumber];
    }

    /**
     * @notice Get MON balance available for entropy fees (KOREKSI 1: monitoring)
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Allow contract to receive MON for entropy fees
     */
    receive() external payable {}
}
