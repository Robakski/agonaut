// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {ArenaRegistry} from "../src/ArenaRegistry.sol";
import {EloSystem} from "../src/EloSystem.sol";
import {StableRegistry} from "../src/StableRegistry.sol";
import {SeasonManager} from "../src/SeasonManager.sol";
import {Treasury} from "../src/Treasury.sol";
import {ScoringOracle} from "../src/ScoringOracle.sol";
import {BountyRound} from "../src/BountyRound.sol";
import {BountyFactory} from "../src/BountyFactory.sol";
import {BountyMarketplace} from "../src/BountyMarketplace.sol";
import {ArbitrationDAO} from "../src/ArbitrationDAO.sol";
import {TimelockGovernor} from "../src/TimelockGovernor.sol";
import {EmergencyGuardian} from "../src/EmergencyGuardian.sol";
import {Constants} from "../src/Constants.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

/**
 * @title Agonaut Full Protocol Deployment
 * @notice Deploys all v1 contracts to Base Sepolia (testnet) or Base Mainnet.
 *
 * Usage:
 *   # Dry run
 *   forge script script/Deploy.s.sol:Deploy --rpc-url base_sepolia -vvvv
 *
 *   # Real deployment
 *   forge script script/Deploy.s.sol:Deploy --rpc-url base_sepolia --broadcast --verify
 *
 * Environment:
 *   DEPLOYER_PRIVATE_KEY  — Private key for deployment
 *   ADMIN_ADDRESS         — Multisig / governance address
 *   OPERATOR_ADDRESS      — Operational address (optional, defaults to admin)
 *   SCORER_ADDRESS        — TEE scoring service wallet
 *   GUARDIAN_ADDRESS      — Emergency pause address (optional, defaults to admin)
 */
contract Deploy is Script {

    // Deployed addresses
    address public arenaRegistry;
    address public eloSystem;
    address public stableRegistry;
    address public seasonManager;
    address public treasury;
    address public scoringOracle;
    address public bountyRoundImpl;
    address public bountyFactory;
    address public bountyMarketplace;
    address public arbitrationDao;
    address public timelockGovernorAddr;
    address public emergencyGuardianAddr;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address operator = vm.envOr("OPERATOR_ADDRESS", admin);
        address scorer = vm.envAddress("SCORER_ADDRESS");
        address guardian = vm.envOr("GUARDIAN_ADDRESS", admin);
        address deployer = vm.addr(deployerKey);

        console2.log("=== Agonaut Protocol Deployment ===");
        console2.log("Deployer:", deployer);
        console2.log("Admin:   ", admin);
        console2.log("Operator:", operator);
        console2.log("Scorer:  ", scorer);
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerKey);

        // ════════════════════════════════════════════
        //  1. Non-upgradeable contracts
        // ════════════════════════════════════════════

        // EloSystem — plain AccessControl, no proxy
        EloSystem elo = new EloSystem();
        eloSystem = address(elo);

        // BountyRound — implementation for cloning (not proxied itself)
        BountyRound roundImpl = new BountyRound();
        bountyRoundImpl = address(roundImpl);

        // ════════════════════════════════════════════
        //  2. UUPS proxied contracts
        // ════════════════════════════════════════════

        // All contracts init with DEPLOYER as admin so we can wire them together.
        // Admin/operator roles are transferred at the end (step 6).

        // Treasury
        Treasury treasuryImpl = new Treasury();
        treasury = address(new ERC1967Proxy(
            address(treasuryImpl),
            abi.encodeCall(Treasury.initialize, (deployer))
        ));

        // ScoringOracle
        ScoringOracle oracleImpl = new ScoringOracle();
        scoringOracle = address(new ERC1967Proxy(
            address(oracleImpl),
            abi.encodeCall(ScoringOracle.initialize, (deployer, scorer))
        ));

        // ArenaRegistry
        ArenaRegistry registryImpl = new ArenaRegistry();
        arenaRegistry = address(new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(ArenaRegistry.initialize, (
                deployer,
                deployer,
                address(0xdead),              // usdcToken — placeholder, not used in ETH-only v1
                Constants.REGISTRATION_FEE,  // ethFee
                0                            // usdcFee — not used
            ))
        ));

        // StableRegistry
        StableRegistry stableImpl = new StableRegistry();
        stableRegistry = address(new ERC1967Proxy(
            address(stableImpl),
            abi.encodeCall(StableRegistry.initialize, (deployer, deployer, arenaRegistry))
        ));

        // BountyFactory
        BountyFactory factoryImpl = new BountyFactory();
        bountyFactory = address(new ERC1967Proxy(
            address(factoryImpl),
            abi.encodeCall(BountyFactory.initialize, (deployer, deployer))
        ));

        // SeasonManager
        SeasonManager seasonImpl = new SeasonManager();
        seasonManager = address(new ERC1967Proxy(
            address(seasonImpl),
            abi.encodeCall(SeasonManager.initialize, (deployer, deployer, treasury, bountyFactory))
        ));

        // BountyMarketplace
        BountyMarketplace marketplaceImpl = new BountyMarketplace();
        bountyMarketplace = address(new ERC1967Proxy(
            address(marketplaceImpl),
            abi.encodeCall(BountyMarketplace.initialize, (deployer, deployer, bountyFactory, treasury))
        ));

        // ArbitrationDAO
        ArbitrationDAO arbImpl = new ArbitrationDAO();
        arbitrationDao = address(new ERC1967Proxy(
            address(arbImpl),
            abi.encodeCall(ArbitrationDAO.initialize, (deployer))
        ));

        // ════════════════════════════════════════════
        //  3. Governance contracts
        // ════════════════════════════════════════════

        address[] memory proposers = new address[](1);
        proposers[0] = admin;
        address[] memory executors = new address[](1);
        executors[0] = admin;

        TimelockGovernor tg = new TimelockGovernor(
            proposers,
            executors,
            admin
        );
        timelockGovernorAddr = address(tg);

        address[] memory guardians = new address[](1);
        guardians[0] = guardian;
        EmergencyGuardian eg = new EmergencyGuardian(admin, guardians, timelockGovernorAddr);
        emergencyGuardianAddr = address(eg);

        // ════════════════════════════════════════════
        //  4. Wire contracts together
        // ════════════════════════════════════════════

        // Factory: set round implementation + all contract addresses
        BountyFactory(bountyFactory).setRoundImplementation(bountyRoundImpl);
        BountyFactory(bountyFactory).setContractAddresses(
            arenaRegistry,
            eloSystem,
            treasury,
            stableRegistry,
            seasonManager,
            arbitrationDao,
            scoringOracle
        );

        // ════════════════════════════════════════════
        //  5. Grant cross-contract roles
        // ════════════════════════════════════════════

        // Treasury: governance can withdraw
        Treasury(payable(treasury)).grantRole(Constants.GOVERNOR_ROLE, timelockGovernorAddr);

        // EloSystem & ArenaRegistry: factory needs DEFAULT_ADMIN_ROLE so it can
        // grant ROUND_ROLE / BOUNTY_ROUND_ROLE to each newly spawned round.
        elo.grantRole(0x00, bountyFactory);  // DEFAULT_ADMIN on EloSystem
        IAccessControl(arenaRegistry).grantRole(0x00, bountyFactory);  // DEFAULT_ADMIN on ArenaRegistry

        // ════════════════════════════════════════════
        //  6. Transfer all roles: deployer → admin/operator
        //     Then revoke deployer from everything.
        // ════════════════════════════════════════════

        bytes32 DEFAULT_ADMIN = 0x00;

        // --- EloSystem ---
        elo.grantRole(DEFAULT_ADMIN, admin);
        elo.revokeRole(elo.ROUND_ROLE(), deployer);
        elo.revokeRole(DEFAULT_ADMIN, deployer);

        // --- Treasury ---
        Treasury(payable(treasury)).grantRole(DEFAULT_ADMIN, admin);
        Treasury(payable(treasury)).grantRole(Constants.UPGRADER_ROLE, admin);
        Treasury(payable(treasury)).revokeRole(Constants.UPGRADER_ROLE, deployer);
        Treasury(payable(treasury)).revokeRole(Constants.GOVERNOR_ROLE, deployer);
        Treasury(payable(treasury)).revokeRole(DEFAULT_ADMIN, deployer);

        // --- ScoringOracle ---
        ScoringOracle(scoringOracle).grantRole(DEFAULT_ADMIN, admin);
        ScoringOracle(scoringOracle).grantRole(Constants.UPGRADER_ROLE, admin);
        ScoringOracle(scoringOracle).revokeRole(Constants.UPGRADER_ROLE, deployer);
        ScoringOracle(scoringOracle).revokeRole(DEFAULT_ADMIN, deployer);

        // --- ArenaRegistry ---
        IAccessControl(arenaRegistry).grantRole(DEFAULT_ADMIN, admin);
        IAccessControl(arenaRegistry).grantRole(Constants.UPGRADER_ROLE, admin);
        IAccessControl(arenaRegistry).grantRole(Constants.OPERATOR_ROLE, operator);
        IAccessControl(arenaRegistry).revokeRole(Constants.OPERATOR_ROLE, deployer);
        IAccessControl(arenaRegistry).revokeRole(Constants.UPGRADER_ROLE, deployer);
        IAccessControl(arenaRegistry).revokeRole(DEFAULT_ADMIN, deployer);

        // --- StableRegistry ---
        IAccessControl(stableRegistry).grantRole(DEFAULT_ADMIN, admin);
        IAccessControl(stableRegistry).grantRole(Constants.UPGRADER_ROLE, admin);
        IAccessControl(stableRegistry).grantRole(Constants.OPERATOR_ROLE, operator);
        IAccessControl(stableRegistry).revokeRole(Constants.OPERATOR_ROLE, deployer);
        IAccessControl(stableRegistry).revokeRole(Constants.UPGRADER_ROLE, deployer);
        IAccessControl(stableRegistry).revokeRole(DEFAULT_ADMIN, deployer);

        // --- BountyFactory ---
        BountyFactory(bountyFactory).grantRole(DEFAULT_ADMIN, admin);
        BountyFactory(bountyFactory).grantRole(Constants.UPGRADER_ROLE, admin);
        BountyFactory(bountyFactory).grantRole(Constants.OPERATOR_ROLE, operator);
        BountyFactory(bountyFactory).grantRole(Constants.BOUNTY_CREATOR_ROLE, operator);
        BountyFactory(bountyFactory).revokeRole(Constants.BOUNTY_CREATOR_ROLE, deployer);
        BountyFactory(bountyFactory).revokeRole(Constants.OPERATOR_ROLE, deployer);
        BountyFactory(bountyFactory).revokeRole(Constants.UPGRADER_ROLE, deployer);
        BountyFactory(bountyFactory).revokeRole(DEFAULT_ADMIN, deployer);

        // --- SeasonManager ---
        SeasonManager(seasonManager).grantRole(DEFAULT_ADMIN, admin);
        SeasonManager(seasonManager).grantRole(Constants.UPGRADER_ROLE, admin);
        SeasonManager(seasonManager).grantRole(Constants.OPERATOR_ROLE, operator);
        SeasonManager(seasonManager).revokeRole(Constants.OPERATOR_ROLE, deployer);
        SeasonManager(seasonManager).revokeRole(Constants.UPGRADER_ROLE, deployer);
        SeasonManager(seasonManager).revokeRole(DEFAULT_ADMIN, deployer);

        // --- BountyMarketplace ---
        BountyMarketplace(bountyMarketplace).grantRole(DEFAULT_ADMIN, admin);
        BountyMarketplace(bountyMarketplace).grantRole(Constants.UPGRADER_ROLE, admin);
        BountyMarketplace(bountyMarketplace).grantRole(Constants.OPERATOR_ROLE, operator);
        BountyMarketplace(bountyMarketplace).revokeRole(Constants.OPERATOR_ROLE, deployer);
        BountyMarketplace(bountyMarketplace).revokeRole(Constants.UPGRADER_ROLE, deployer);
        BountyMarketplace(bountyMarketplace).revokeRole(DEFAULT_ADMIN, deployer);

        // --- ArbitrationDAO ---
        ArbitrationDAO(arbitrationDao).grantRole(DEFAULT_ADMIN, admin);
        ArbitrationDAO(arbitrationDao).grantRole(Constants.UPGRADER_ROLE, admin);
        ArbitrationDAO(arbitrationDao).revokeRole(Constants.UPGRADER_ROLE, deployer);
        ArbitrationDAO(arbitrationDao).revokeRole(DEFAULT_ADMIN, deployer);

        vm.stopBroadcast();

        // ════════════════════════════════════════════
        //  6. Log deployment summary
        // ════════════════════════════════════════════

        console2.log("");
        console2.log("=== DEPLOYMENT COMPLETE ===");
        console2.log("");
        console2.log("ArenaRegistry:      ", arenaRegistry);
        console2.log("EloSystem:          ", eloSystem);
        console2.log("StableRegistry:     ", stableRegistry);
        console2.log("SeasonManager:      ", seasonManager);
        console2.log("Treasury:           ", treasury);
        console2.log("ScoringOracle:      ", scoringOracle);
        console2.log("BountyRound (impl): ", bountyRoundImpl);
        console2.log("BountyFactory:      ", bountyFactory);
        console2.log("BountyMarketplace:  ", bountyMarketplace);
        console2.log("ArbitrationDAO:     ", arbitrationDao);
        console2.log("TimelockGovernor:   ", timelockGovernorAddr);
        console2.log("EmergencyGuardian:  ", emergencyGuardianAddr);
    }
}
