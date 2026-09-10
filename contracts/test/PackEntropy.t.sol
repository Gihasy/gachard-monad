// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PackEntropy.sol";
import "../src/GachardCard.sol";
import "@pythnetwork/entropy-sdk-solidity/MockEntropy.sol";
import "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";

contract PackEntropyTest is Test {
    GachardCard public card;
    MockEntropy public mockEntropy;
    PackEntropy public packEntropy;

    address public user1 = address(0x1);
    address public provider = address(0xAAAA);

    function setUp() public {
        card = new GachardCard();
        mockEntropy = new MockEntropy(provider);
        packEntropy = new PackEntropy(address(mockEntropy), address(card));

        // Authorize PackEntropy as minter on GachardCard
        card.setAuthorizedMinter(address(packEntropy), true);

        // Fund PackEntropy with MON for entropy fees
        vm.deal(address(packEntropy), 10 ether);
    }

    // ==================== requestPack tests ====================

    function test_requestPack_stores_metadata() public {
        uint64 seq = packEntropy.requestPack(1, user1, 5, 1);

        (address reqAddr, uint8 reqPackSize, uint8 reqGuaranteed, bool reqFulfilled) = packEntropy.requests(seq);
        assertEq(reqAddr, user1);
        assertEq(reqPackSize, 5);
        assertEq(reqGuaranteed, 1);
        assertFalse(reqFulfilled);
    }

    function test_requestPack_calls_entropy_requestV2() public {
        uint64 seq = packEntropy.requestPack(1, user1, 5, 1);

        // MockEntropy increments sequence from1
        assertEq(seq, 1);
        // Verify packEntropy is the requester (6th field in Request struct)
        (, , , , , address requester, , ,) = mockEntropy.requests(provider, seq);
        assertEq(requester, address(packEntropy));
    }

    // ==================== entropyCallback tests ====================

    function test_entropyCallback_stores_seed() public {
        // Request first
        uint64 seq = packEntropy.requestPack(1, user1, 5, 1);

        // Simulate entropy callback via MockEntropy.mockReveal
        bytes32 seed = bytes32(uint256(0xDEADBEEF));
        mockEntropy.mockReveal(provider, seq, seed);

        assertEq(packEntropy.getSeed(seq), seed);
    }

    function test_entropyCallback_reverts_for_invalid_sequence() public {
        // Try to reveal a sequence that was never requested
        // MockEntropy will revert with "Request not found"
        vm.expectRevert("Request not found");
        mockEntropy.mockReveal(provider, 999, bytes32(uint256(1)));
    }

    // ==================== fulfillPack tests ====================

    function test_fulfillPack_stores_rarityHash() public {
        uint64 seq = _requestAndReveal();

        uint8[] memory rarities = new uint8[](5);
        rarities[0] = 0; // Common
        rarities[1] = 1; // Rare
        rarities[2] = 0; // Common
        rarities[3] = 0; // Common
        rarities[4] = 0; // Common

        packEntropy.fulfillPack(seq, user1, rarities);

        // Verify hash matches keccak256(seed, rarities)
        bytes32 expectedHash = keccak256(abi.encodePacked(packEntropy.getSeed(seq), rarities));
        assertEq(packEntropy.getRarityHash(seq), expectedHash);
    }

    function test_fulfillPack_structural_check_passes() public {
        uint64 seq = _requestAndReveal();

        // guaranteed=1, at least1 Rare+ present
        uint8[] memory rarities = new uint8[](5);
        rarities[0] = 0;
        rarities[1] = 1; // Rare — satisfies guaranteed=1
        rarities[2] = 0;
        rarities[3] = 0;
        rarities[4] = 0;

        packEntropy.fulfillPack(seq, user1, rarities);
        // Should not revert
    }

    function test_fulfillPack_structural_check_reverts() public {
        uint64 seq = _requestAndReveal();

        // guaranteed=1, NO Rare+ present — all Common
        uint8[] memory rarities = new uint8[](5);
        rarities[0] = 0;
        rarities[1] = 0;
        rarities[2] = 0;
        rarities[3] = 0;
        rarities[4] = 0;

        vm.expectRevert("Insufficient Rare+ count");
        packEntropy.fulfillPack(seq, user1, rarities);
    }

    function test_fulfillPack_calls_mintBatch() public {
        uint64 seq = _requestAndReveal();

        uint8[] memory rarities = new uint8[](5);
        rarities[0] = 0; // Common
        rarities[1] = 1; // Rare
        rarities[2] = 2; // Epic
        rarities[3] = 0; // Common
        rarities[4] = 0; // Common

        uint256 balanceBefore = card.balanceOf(user1, 1);
        packEntropy.fulfillPack(seq, user1, rarities);

        // Cards should be minted to user1
        assertEq(card.balanceOf(user1, 1), balanceBefore + 1);
        assertEq(card.balanceOf(user1, 2), 1);
        assertEq(card.balanceOf(user1, 3), 1);
    }

    function test_fulfillPack_reverts_before_seed() public {
        // Request but DON'T reveal
        uint64 seq = packEntropy.requestPack(1, user1, 5, 1);

        uint8[] memory rarities = new uint8[](5);
        rarities[0] = 1;
        rarities[1] = 0;
        rarities[2] = 0;
        rarities[3] = 0;
        rarities[4] = 0;

        vm.expectRevert("Seed not received");
        packEntropy.fulfillPack(seq, user1, rarities);
    }

    function test_fulfillPack_reverts_already_fulfilled() public {
        uint64 seq = _requestAndReveal();

        uint8[] memory rarities = new uint8[](5);
        rarities[0] = 1;
        rarities[1] = 0;
        rarities[2] = 0;
        rarities[3] = 0;
        rarities[4] = 0;

        packEntropy.fulfillPack(seq, user1, rarities);

        vm.expectRevert("Already fulfilled");
        packEntropy.fulfillPack(seq, user1, rarities);
    }

    // ==================== view function tests ====================

    function test_getSeed_returns_stored_seed() public {
        uint64 seq = packEntropy.requestPack(1, user1, 5, 1);
        bytes32 seed = bytes32(uint256(0x1234567890ABCDEF));
        mockEntropy.mockReveal(provider, seq, seed);

        assertEq(packEntropy.getSeed(seq), seed);
    }

    function test_getRarityHash_returns_stored_hash() public {
        uint64 seq = _requestAndReveal();

        uint8[] memory rarities = new uint8[](5);
        rarities[0] = 1; // Rare
        rarities[1] = 0;
        rarities[2] = 0;
        rarities[3] = 0;
        rarities[4] = 0;

        packEntropy.fulfillPack(seq, user1, rarities);

        bytes32 expectedHash = keccak256(abi.encodePacked(packEntropy.getSeed(seq), rarities));
        assertEq(packEntropy.getRarityHash(seq), expectedHash);
    }

    function test_hash_consistency() public {
        // Same seed + rarities should always produce same hash
        uint64 seq = _requestAndReveal();
        bytes32 seed = packEntropy.getSeed(seq);

        uint8[] memory rarities = new uint8[](3);
        rarities[0] = 0;
        rarities[1] = 1;
        rarities[2] = 2;

        bytes32 hash1 = keccak256(abi.encodePacked(seed, rarities));
        bytes32 hash2 = keccak256(abi.encodePacked(seed, rarities));
        assertEq(hash1, hash2);
    }

    // ==================== access control tests ====================

    function test_fulfillPack_reverts_for_unauthorized_caller() public {
        uint64 seq = _requestAndReveal();

        uint8[] memory rarities = new uint8[](5);
        rarities[0] = 1;
        rarities[1] = 0;
        rarities[2] = 0;
        rarities[3] = 0;
        rarities[4] = 0;

        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user1));
        packEntropy.fulfillPack(seq, user1, rarities);
    }

    function test_requestPack_reverts_for_unauthorized_caller() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user1));
        packEntropy.requestPack(1, user1, 5, 1);
    }

    function test_entropyCallback_reverts_for_unauthorized_sender() public {
        // KOREKSI 2: Source code IEntropyConsumer.sol line14-15:
        //   require(entropy != address(0), "Entropy address not set");
        //   require(msg.sender == entropy, "Only Entropy can call this function");
        // Calling _entropyCallback directly from non-entropy address must revert

        // First make a request so the contract is properly initialized
        packEntropy.requestPack(1, user1, 5, 1);

        // Call _entropyCallback directly from user1 (not entropy contract)
        vm.prank(user1);
        vm.expectRevert("Only Entropy can call this function");
        IEntropyConsumer(address(packEntropy))._entropyCallback(1, provider, bytes32(uint256(1)));
    }

    // ==================== getBalance test ====================

    function test_getBalance_returns_contract_balance() public {
        assertEq(packEntropy.getBalance(), 10 ether);
    }

    // ==================== array length validation test ====================

    function test_fulfillPack_reverts_for_wrong_array_length() public {
        // Request pack with packSize=5
        uint64 seq = _requestAndReveal();

        // Try to fulfill with 3 rarities (wrong length)
        uint8[] memory rarities = new uint8[](3);
        rarities[0] = 1; // Rare (satisfies guaranteed)
        rarities[1] = 0;
        rarities[2] = 0;

        vm.expectRevert("Rarity array length mismatch");
        packEntropy.fulfillPack(seq, user1, rarities);
    }

    // ==================== helper ====================

    function _requestAndReveal() internal returns (uint64 seq) {
        seq = packEntropy.requestPack(1, user1, 5, 1);
        bytes32 seed = bytes32(uint256(0xCAFEBABE));
        mockEntropy.mockReveal(provider, seq, seed);
    }
}
