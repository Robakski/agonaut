// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ScoringOracle} from "../src/ScoringOracle.sol";
import {Constants} from "../src/Constants.sol";

/**
 * @title DeployScoringOracle
 * @notice Standalone deployment of ScoringOracle (UUPS proxy).
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... \
 *   ADMIN_ADDRESS=0x... \
 *   SCORER_ADDRESS=0x... \
 *   forge script script/DeployScoringOracle.s.sol:DeployScoringOracle \
 *     --rpc-url https://sepolia.base.org --broadcast -vvv
 */
contract DeployScoringOracle is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address scorer = vm.envAddress("SCORER_ADDRESS");
        address deployer = vm.addr(deployerKey);

        console2.log("=== ScoringOracle Deployment ===");
        console2.log("Deployer:", deployer);
        console2.log("Admin:   ", admin);
        console2.log("Scorer:  ", scorer);
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerKey);

        // Deploy implementation
        ScoringOracle impl = new ScoringOracle();

        // Deploy proxy
        address proxy = address(new ERC1967Proxy(
            address(impl),
            abi.encodeCall(ScoringOracle.initialize, (deployer, scorer))
        ));

        console2.log("Implementation:", address(impl));
        console2.log("Proxy:         ", proxy);

        // Transfer admin to multisig/admin address
        ScoringOracle oracle = ScoringOracle(proxy);
        oracle.grantRole(0x00, admin); // DEFAULT_ADMIN_ROLE
        oracle.grantRole(Constants.UPGRADER_ROLE, admin);
        oracle.revokeRole(Constants.UPGRADER_ROLE, deployer);
        oracle.revokeRole(0x00, deployer);

        console2.log("Admin roles transferred to:", admin);

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== ScoringOracle Deployed ===");
        console2.log("Set SCORING_ORACLE=%s in backend .env", proxy);
    }
}
