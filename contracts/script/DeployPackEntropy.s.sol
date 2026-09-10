// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PackEntropy.sol";
import "../src/GachardCard.sol";

/// @notice Deploy PackEntropy.sol and authorize it as minter on GachardCard
/// @dev Usage:
///   forge script script/DeployPackEntropy.s.sol --rpc-url monad_testnet --broadcast
///
/// Required env vars:
///   ADMIN_PRIVATE_KEY — deployer/admin wallet private key
///   GACHARD_CARD_ADDRESS — address of deployed GachardCard contract
///   PYTH_ENTROPY_ADDRESS — Pyth Entropy contract on Monad testnet (0x825c0390f379c631f3cf11a82a37d20bddf93c07)
contract DeployPackEntropyScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("ADMIN_PRIVATE_KEY");
        address gachardCardAddress = vm.envAddress("GACHARD_CARD_ADDRESS");
        address pythEntropyAddress = vm.envAddress("PYTH_ENTROPY_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy PackEntropy
        PackEntropy packEntropy = new PackEntropy(pythEntropyAddress, gachardCardAddress);
        console.log("PackEntropy deployed at:", address(packEntropy));

        // Authorize PackEntropy as minter on GachardCard
        GachardCard card = GachardCard(gachardCardAddress);
        card.setAuthorizedMinter(address(packEntropy), true);
        console.log("PackEntropy authorized as minter on GachardCard");

        // Fund PackEntropy with initial MON for entropy fees
        // (can also be done separately via: cast send <addr> --value 1ether)

        vm.stopBroadcast();
    }
}
