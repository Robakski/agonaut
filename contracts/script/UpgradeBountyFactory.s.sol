// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {BountyFactory} from "../src/BountyFactory.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract UpgradeBountyFactory is Script {
    function run() external {
        // Admin wallet has UPGRADER_ROLE
        uint256 adminKey = vm.envUint("ADMIN_PRIVATE_KEY");
        address proxy = 0x99C1500edfD3CbD70B6be258dB033c7A8dd5A8B8;

        vm.startBroadcast(adminKey);

        // 1. Deploy new implementation
        BountyFactory newImpl = new BountyFactory();
        console.log("New implementation:", address(newImpl));

        // 2. Upgrade proxy to new implementation
        UUPSUpgradeable(proxy).upgradeToAndCall(address(newImpl), "");
        console.log("Proxy upgraded!");

        vm.stopBroadcast();
    }
}
