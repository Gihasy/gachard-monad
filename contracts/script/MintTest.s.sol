// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/GachardCard.sol";

contract MintTestScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("ADMIN_PRIVATE_KEY");
        address contractAddress = vm.envAddress("CONTRACT_ADDRESS");
        address testUser = vm.envAddress("ADMIN_WALLET_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        GachardCard card = GachardCard(contractAddress);

        // Mint 3 test cards with different rarities
        uint256 id1 = card.mintCard(testUser, 0); // Common
        uint256 id2 = card.mintCard(testUser, 1); // Rare
        uint256 id3 = card.mintCard(testUser, 2); // Epic

        vm.stopBroadcast();
    }
}
