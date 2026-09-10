// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/GachardCard.sol";

contract GachardCardTest is Test {
    GachardCard public card;
    address public user1 = address(0x1);
    address public user2 = address(0x2);

    function setUp() public {
        card = new GachardCard();
    }

    // ==================== mintCard tests ====================

    function test_mint_creates_token_with_digital_status() public {
        uint256 tokenId = card.mintCard(user1, 0);

        assertEq(card.balanceOf(user1, tokenId), 1);
        assertEq(uint8(card.cardStatus(tokenId)), uint8(GachardCard.CardStatus.Digital));
    }

    function test_mint_stores_rarity() public {
        uint256 id1 = card.mintCard(user1, 0);
        uint256 id2 = card.mintCard(user1, 2);
        uint256 id3 = card.mintCard(user1, 3);

        assertEq(uint8(card.cardRarity(id1)), 0);
        assertEq(uint8(card.cardRarity(id2)), 2);
        assertEq(uint8(card.cardRarity(id3)), 3);
    }

    function test_mint_increments_token_id() public {
        uint256 id1 = card.mintCard(user1, 0);
        uint256 id2 = card.mintCard(user2, 0);

        assertEq(id2, id1 + 1);
    }

    function test_mint_multiple_to_same_user() public {
        uint256 id1 = card.mintCard(user1, 0);
        uint256 id2 = card.mintCard(user1, 1);

        assertEq(card.balanceOf(user1, id1), 1);
        assertEq(card.balanceOf(user1, id2), 1);
        assertTrue(id1 != id2);
    }

    function test_mint_emits_event() public {
        vm.expectEmit(true, false, false, true);
        emit GachardCard.CardMinted(1, user1, GachardCard.CardStatus.Digital, GachardCard.Rarity.Common);
        card.mintCard(user1, 0);
    }

    function test_only_owner_can_mint() public {
        vm.prank(user1);
        vm.expectRevert("Not authorized");
        card.mintCard(user1, 0);
    }

    function test_mint_reverts_on_invalid_rarity() public {
        vm.expectRevert("Invalid rarity");
        card.mintCard(user1, 4);
    }

    // ==================== mintBatch tests ====================

    function test_mintBatch_creates_sequential_tokens() public {
        uint8[] memory rarities = new uint8[](3);
        rarities[0] = 0; // Common
        rarities[1] = 1; // Rare
        rarities[2] = 2; // Epic

        uint256[] memory tokenIds = card.mintBatch(user1, rarities);

        assertEq(tokenIds.length, 3);
        assertEq(tokenIds[0], 1);
        assertEq(tokenIds[1], 2);
        assertEq(tokenIds[2], 3);
    }

    function test_mintBatch_stores_rarity_per_token() public {
        uint8[] memory rarities = new uint8[](4);
        rarities[0] = 0; // Common
        rarities[1] = 1; // Rare
        rarities[2] = 2; // Epic
        rarities[3] = 3; // Legendary

        uint256[] memory tokenIds = card.mintBatch(user1, rarities);

        assertEq(uint8(card.cardRarity(tokenIds[0])), 0);
        assertEq(uint8(card.cardRarity(tokenIds[1])), 1);
        assertEq(uint8(card.cardRarity(tokenIds[2])), 2);
        assertEq(uint8(card.cardRarity(tokenIds[3])), 3);
    }

    function test_mintBatch_sets_all_tokens_to_digital() public {
        uint8[] memory rarities = new uint8[](3);
        rarities[0] = 0;
        rarities[1] = 1;
        rarities[2] = 2;

        uint256[] memory tokenIds = card.mintBatch(user1, rarities);

        for (uint256 i = 0; i < tokenIds.length; i++) {
            assertEq(uint8(card.cardStatus(tokenIds[i])), uint8(GachardCard.CardStatus.Digital));
            assertEq(card.balanceOf(user1, tokenIds[i]), 1);
        }
    }

    function test_mintBatch_emits_events_in_order() public {
        uint8[] memory rarities = new uint8[](2);
        rarities[0] = 0; // Common
        rarities[1] = 3; // Legendary

        vm.expectEmit(true, false, false, true);
        emit GachardCard.CardMinted(1, user1, GachardCard.CardStatus.Digital, GachardCard.Rarity.Common);
        vm.expectEmit(true, false, false, true);
        emit GachardCard.CardMinted(2, user1, GachardCard.CardStatus.Digital, GachardCard.Rarity.Legendary);

        card.mintBatch(user1, rarities);
    }

    function test_mintBatch_reverts_on_invalid_rarity() public {
        uint8[] memory rarities = new uint8[](2);
        rarities[0] = 0;
        rarities[1] = 4; // Invalid

        vm.expectRevert("Invalid rarity");
        card.mintBatch(user1, rarities);
    }

    function test_mintBatch_only_owner() public {
        uint8[] memory rarities = new uint8[](1);
        rarities[0] = 0;

        vm.prank(user1);
        vm.expectRevert("Not authorized");
        card.mintBatch(user1, rarities);
    }

    function test_mintBatch_empty_array_reverts() public {
        uint8[] memory rarities = new uint8[](0);

        vm.expectRevert("Empty rarities array");
        card.mintBatch(user1, rarities);
    }

    // ==================== requestPrint tests ====================

    function test_requestPrint_changes_status_to_vaulted() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash = keccak256("testcode123");

        card.requestPrint(tokenId, hash, user1);

        assertEq(uint8(card.cardStatus(tokenId)), uint8(GachardCard.CardStatus.Vaulted));
    }

    function test_requestPrint_stores_hash() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash = keccak256("testcode123");

        card.requestPrint(tokenId, hash, user1);

        assertEq(card.storedHash(tokenId), hash);
    }

    function test_requestPrint_keeps_card_with_user() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash = keccak256("testcode123");

        card.requestPrint(tokenId, hash, user1);

        // Kartu TETAP di wallet user, tidak dipindah ke vault
        assertEq(card.balanceOf(user1, tokenId), 1);
        assertEq(card.balanceOf(address(card), tokenId), 0);
    }

    function test_requestPrint_updates_last_owner() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash = keccak256("testcode123");

        card.requestPrint(tokenId, hash, user1);

        assertEq(card.lastOwner(tokenId), user1);
    }

    function test_requestPrint_emits_status_changed_event() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash = keccak256("testcode123");

        vm.expectEmit(true, false, false, true);
        emit GachardCard.CardStatusChanged(tokenId, GachardCard.CardStatus.Digital, GachardCard.CardStatus.Vaulted);
        card.requestPrint(tokenId, hash, user1);
    }

    function test_requestPrint_reverts_when_already_vaulted() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash1 = keccak256("code1");
        bytes32 hash2 = keccak256("code2");

        card.requestPrint(tokenId, hash1, user1);

        vm.expectRevert("Card is not digital");
        card.requestPrint(tokenId, hash2, user1);
    }

    function test_requestPrint_only_owner() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash = keccak256("testcode");

        // user1 bukan owner — owner adalah deployer (address(this) di test)
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user1));
        card.requestPrint(tokenId, hash, user1);
    }

    // ==================== redeemCard tests ====================

    function test_redeemCard_transfers_to_recipient() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash = keccak256("code123");

        card.requestPrint(tokenId, hash, user1);
        card.redeemCard(tokenId, hash, user2);

        assertEq(card.balanceOf(user2, tokenId), 1);
        assertEq(card.balanceOf(address(card), tokenId), 0);
    }

    function test_redeemCard_changes_status_to_digital() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash = keccak256("code123");

        card.requestPrint(tokenId, hash, user1);
        card.redeemCard(tokenId, hash, user2);

        assertEq(uint8(card.cardStatus(tokenId)), uint8(GachardCard.CardStatus.Digital));
    }

    function test_redeemCard_updates_last_owner() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash = keccak256("code123");

        card.requestPrint(tokenId, hash, user1);
        card.redeemCard(tokenId, hash, user2);

        assertEq(card.lastOwner(tokenId), user2);
    }

    function test_redeemCard_emits_status_changed_event() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash = keccak256("code123");

        card.requestPrint(tokenId, hash, user1);

        vm.expectEmit(true, false, false, true);
        emit GachardCard.CardStatusChanged(tokenId, GachardCard.CardStatus.Vaulted, GachardCard.CardStatus.Digital);
        card.redeemCard(tokenId, hash, user2);
    }

    function test_redeemCard_reverts_when_not_vaulted() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash = keccak256("code123");

        vm.expectRevert("Card is not vaulted");
        card.redeemCard(tokenId, hash, user2);
    }

    function test_redeemCard_reverts_on_wrong_code() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash = keccak256("correctcode");
        bytes32 wrongHash = keccak256("wrongcode");

        card.requestPrint(tokenId, hash, user1);

        vm.expectRevert("Invalid redeem code");
        card.redeemCard(tokenId, wrongHash, user2);
    }

    function test_redeemCard_reverts_when_called_by_non_owner() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash = keccak256("code123");

        card.requestPrint(tokenId, hash, user1);

        // user2 mencoba memanggil — harus revert karena onlyOwner
        vm.prank(user2);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user2));
        card.redeemCard(tokenId, hash, user1);
    }

    // ==================== Full loop tests ====================

    function test_old_code_invalid_after_new_print() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash1 = keccak256("code_siklus_1");
        bytes32 hash2 = keccak256("code_siklus_2");

        // Siklus 1
        card.requestPrint(tokenId, hash1, user1);
        card.redeemCard(tokenId, hash1, user2);
        assertEq(card.balanceOf(user2, tokenId), 1);

        // Siklus 2
        card.requestPrint(tokenId, hash2, user2);

        // Coba redeem dengan kode lama — HARUS GAGAL
        vm.expectRevert("Invalid redeem code");
        card.redeemCard(tokenId, hash1, user1);

        // Redeem dengan kode baru — HARUS BERHASIL
        card.redeemCard(tokenId, hash2, user1);
        assertEq(card.balanceOf(user1, tokenId), 1);
    }

    function test_requestPrint_overwrites_old_hash() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash1 = keccak256("code1");
        bytes32 hash2 = keccak256("code2");

        // Siklus 1
        card.requestPrint(tokenId, hash1, user1);
        assertEq(card.storedHash(tokenId), hash1);

        // Redeem dulu supaya bisa print lagi
        card.redeemCard(tokenId, hash1, user2);

        // Siklus 2 — hash HARUS ditimpa
        card.requestPrint(tokenId, hash2, user2);
        assertEq(card.storedHash(tokenId), hash2);
        assertTrue(card.storedHash(tokenId) != hash1);
    }

    function test_full_loop_three_cycles() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32[3] memory hashes = [
            keccak256("cycle_1_code"),
            keccak256("cycle_2_code"),
            keccak256("cycle_3_code")
        ];
        address[3] memory owners = [user1, user2, user1];
        address[3] memory recipients = [user2, user1, user2];

        for (uint256 i = 0; i < 3; i++) {
            // Print
            card.requestPrint(tokenId, hashes[i], owners[i]);
            assertEq(uint8(card.cardStatus(tokenId)), uint8(GachardCard.CardStatus.Vaulted));
            assertEq(card.storedHash(tokenId), hashes[i]);
            assertEq(card.lastOwner(tokenId), owners[i]);

            // Redeem
            card.redeemCard(tokenId, hashes[i], recipients[i]);
            assertEq(uint8(card.cardStatus(tokenId)), uint8(GachardCard.CardStatus.Digital));
            assertEq(card.balanceOf(recipients[i], tokenId), 1);
            assertEq(card.lastOwner(tokenId), recipients[i]);
        }
    }

    // ==================== marketplaceTransfer tests ====================

    function test_marketplaceTransfer_moves_token_to_buyer() public {
        uint256 tokenId = card.mintCard(user1, 0);

        card.marketplaceTransfer(tokenId, user1, user2);

        assertEq(card.balanceOf(user1, tokenId), 0);
        assertEq(card.balanceOf(user2, tokenId), 1);
    }

    function test_marketplaceTransfer_updates_last_owner() public {
        uint256 tokenId = card.mintCard(user1, 0);

        card.marketplaceTransfer(tokenId, user1, user2);

        assertEq(card.lastOwner(tokenId), user2);
    }

    function test_marketplaceTransfer_keeps_digital_status() public {
        uint256 tokenId = card.mintCard(user1, 0);

        card.marketplaceTransfer(tokenId, user1, user2);

        assertEq(uint8(card.cardStatus(tokenId)), uint8(GachardCard.CardStatus.Digital));
    }

    function test_marketplaceTransfer_emits_event() public {
        uint256 tokenId = card.mintCard(user1, 0);

        vm.expectEmit(true, true, false, true);
        emit GachardCard.MarketplaceTransfer(tokenId, user1, user2);
        card.marketplaceTransfer(tokenId, user1, user2);
    }

    function test_marketplaceTransfer_reverts_when_vaulted() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash = keccak256("code");
        card.requestPrint(tokenId, hash, user1);

        vm.expectRevert("Card is not digital");
        card.marketplaceTransfer(tokenId, user1, user2);
    }

    function test_marketplaceTransfer_reverts_when_not_owner() public {
        uint256 tokenId = card.mintCard(user1, 0);

        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user1));
        card.marketplaceTransfer(tokenId, user1, user2);
    }

    function test_marketplaceTransfer_reverts_when_from_not_holder() public {
        uint256 tokenId = card.mintCard(user1, 0);

        vm.expectRevert("Sender does not own card");
        card.marketplaceTransfer(tokenId, user2, user1);
    }

    // ==================== recordVerification tests ====================

    function test_recordVerification_stores_risk_score() public {
        uint256 tokenId = card.mintCard(user1, 0);

        card.recordVerification(tokenId, 75, true);

        assertEq(card.lastRiskScore(tokenId), 75);
    }

    function test_recordVerification_stores_flagged_true() public {
        uint256 tokenId = card.mintCard(user1, 0);

        card.recordVerification(tokenId, 85, true);

        assertTrue(card.flaggedSuspicious(tokenId));
    }

    function test_recordVerification_stores_flagged_false() public {
        uint256 tokenId = card.mintCard(user1, 0);

        card.recordVerification(tokenId, 20, false);

        assertFalse(card.flaggedSuspicious(tokenId));
    }

    function test_recordVerification_emits_event() public {
        uint256 tokenId = card.mintCard(user1, 0);

        vm.expectEmit(true, false, false, true);
        emit GachardCard.VerificationRecorded(tokenId, 75, true);
        card.recordVerification(tokenId, 75, true);
    }

    function test_recordVerification_reverts_when_not_owner() public {
        uint256 tokenId = card.mintCard(user1, 0);

        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user1));
        card.recordVerification(tokenId, 50, false);
    }

    function test_recordVerification_reverts_on_score_above_100() public {
        uint256 tokenId = card.mintCard(user1, 0);

        vm.expectRevert("Risk score out of range");
        card.recordVerification(tokenId, 101, false);
    }

    function test_recordVerification_overwrites_previous_score() public {
        uint256 tokenId = card.mintCard(user1, 0);

        card.recordVerification(tokenId, 30, false);
        assertEq(card.lastRiskScore(tokenId), 30);
        assertFalse(card.flaggedSuspicious(tokenId));

        card.recordVerification(tokenId, 90, true);
        assertEq(card.lastRiskScore(tokenId), 90);
        assertTrue(card.flaggedSuspicious(tokenId));
    }

    function test_recordVerification_score_0_and_100_boundary() public {
        uint256 id1 = card.mintCard(user1, 0);
        uint256 id2 = card.mintCard(user1, 0);

        card.recordVerification(id1, 0, false);
        assertEq(card.lastRiskScore(id1), 0);
        assertFalse(card.flaggedSuspicious(id1));

        card.recordVerification(id2, 100, true);
        assertEq(card.lastRiskScore(id2), 100);
        assertTrue(card.flaggedSuspicious(id2));
    }

    // ============================================
    // Section 8: burnCard tests
    // ============================================

    function test_burnCard_removes_token() public {
        uint256 tokenId = card.mintCard(user1, 0); // Common
        card.burnCard(tokenId, user1);
        assertEq(card.balanceOf(user1, tokenId), 0);
    }

    function test_burnCard_cannot_transfer_after_burn() public {
        uint256 tokenId = card.mintCard(user1, 0);
        card.burnCard(tokenId, user1);

        // Attempting to transfer burned token should revert (balance is 0)
        vm.expectRevert();
        card.marketplaceTransfer(tokenId, user1, user2);
    }

    function test_burnCard_emits_event_with_rarity() public {
        uint256 tokenId = card.mintCard(user1, 2); // Epic

        vm.expectEmit(true, false, false, true);
        emit GachardCard.CardBurned(tokenId, user1, 2);
        card.burnCard(tokenId, user1);
    }

    function test_burnCard_emits_event_all_rarities() public {
        // Common=0
        uint256 t1 = card.mintCard(user1, 0);
        vm.expectEmit(true, false, false, true);
        emit GachardCard.CardBurned(t1, user1, 0);
        card.burnCard(t1, user1);

        // Rare=1
        uint256 t2 = card.mintCard(user1, 1);
        vm.expectEmit(true, false, false, true);
        emit GachardCard.CardBurned(t2, user1, 1);
        card.burnCard(t2, user1);

        // Legendary=3
        uint256 t3 = card.mintCard(user1, 3);
        vm.expectEmit(true, false, false, true);
        emit GachardCard.CardBurned(t3, user1, 3);
        card.burnCard(t3, user1);
    }

    function test_burnCard_reverts_when_vaulted() public {
        uint256 tokenId = card.mintCard(user1, 0);
        bytes32 hash = keccak256("test");
        card.requestPrint(tokenId, hash, user1); // status -> Vaulted

        vm.expectRevert("Card is not digital");
        card.burnCard(tokenId, user1);
    }

    function test_burnCard_reverts_when_not_owner() public {
        uint256 tokenId = card.mintCard(user1, 0);

        vm.prank(user2);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user2));
        card.burnCard(tokenId, user1);
    }

    function test_burnCard_reverts_when_not_holder() public {
        uint256 tokenId = card.mintCard(user1, 0);

        // user2 doesn't hold the card
        vm.expectRevert("Owner does not hold card");
        card.burnCard(tokenId, user2);
    }

    function test_burnCard_reverts_when_already_burned() public {
        uint256 tokenId = card.mintCard(user1, 0);
        card.burnCard(tokenId, user1);

        // Second burn attempt — balance is 0
        vm.expectRevert("Owner does not hold card");
        card.burnCard(tokenId, user1);
    }

    // ==================== authorized minter tests ====================

    function test_authorized_minter_can_call_mintBatch() public {
        address minter = address(0xBEEF);
        card.setAuthorizedMinter(minter, true);

        uint8[] memory rarities = new uint8[](2);
        rarities[0] = 0;
        rarities[1] = 1;

        vm.prank(minter);
        uint256[] memory tokenIds = card.mintBatch(user1, rarities);

        assertEq(tokenIds.length, 2);
        assertEq(card.balanceOf(user1, tokenIds[0]), 1);
        assertEq(card.balanceOf(user1, tokenIds[1]), 1);
    }

    function test_unauthorized_address_cannot_call_mintBatch() public {
        uint8[] memory rarities = new uint8[](1);
        rarities[0] = 0;

        vm.prank(user1);
        vm.expectRevert("Not authorized");
        card.mintBatch(user1, rarities);
    }

    function test_owner_can_still_call_mintBatch() public {
        uint8[] memory rarities = new uint8[](2);
        rarities[0] = 0;
        rarities[1] = 2;

        uint256[] memory tokenIds = card.mintBatch(user1, rarities);

        assertEq(tokenIds.length, 2);
        assertEq(uint8(card.cardRarity(tokenIds[0])), 0);
        assertEq(uint8(card.cardRarity(tokenIds[1])), 2);
    }

    function test_setAuthorizedMinter_only_owner() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user1));
        card.setAuthorizedMinter(address(0xBEEF), true);
    }
}
