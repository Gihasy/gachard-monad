// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/GachardCard.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("ADMIN_PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        GachardCard card = new GachardCard();

        vm.stopBroadcast();
    }
}
