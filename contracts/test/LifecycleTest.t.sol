// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {ArenaRegistry} from "../src/ArenaRegistry.sol";
import {EloSystem} from "../src/EloSystem.sol";
import {StableRegistry} from "../src/StableRegistry.sol";
import {SeasonManager} from "../src/SeasonManager.sol";
import {Treasury} from "../src/Treasury.sol";
import {ScoringOracle} from "../src/ScoringOracle.sol";
import {BountyRound} from "../src/BountyRound.sol";
import {BountyFactory} from "../src/BountyFactory.sol";
import {Constants} from "../src/Constants.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

/**
 * @title Full Lifecycle Test
 * @notice Walks through EVERY phase transition:
 *         OPEN → FUNDED → COMMIT → SCORING → SETTLED → CLAIM
 *         This is the test that would have caught the missing startCommitPhase.
 */
contract LifecycleTest is Test {
    // Actors
    address admin = makeAddr("admin");
    address operator = makeAddr("operator");
    address scorer = makeAddr("scorer");
    address sponsor = makeAddr("sponsor");
    address agent1Owner = makeAddr("agent1Owner");

    // Contracts
    ArenaRegistry registry;
    EloSystem elo;
    StableRegistry stableReg;
    SeasonManager season;
    Treasury treasury;
    ScoringOracle oracle;
    BountyRound roundImpl;
    BountyFactory factory;

    function setUp() public {
        vm.startPrank(admin);

        // Deploy all contracts (simplified — no proxies for test speed)
        elo = new EloSystem();

        roundImpl = new BountyRound();

        // Proxied contracts
        Treasury treasuryImpl = new Treasury();
        treasury = Treasury(payable(address(new ERC1967Proxy(
            address(treasuryImpl),
            abi.encodeCall(Treasury.initialize, (admin))
        ))));

        ScoringOracle oracleImpl = new ScoringOracle();
        oracle = ScoringOracle(address(new ERC1967Proxy(
            address(oracleImpl),
            abi.encodeCall(ScoringOracle.initialize, (admin, scorer))
        )));

        ArenaRegistry registryImpl = new ArenaRegistry();
        registry = ArenaRegistry(payable(address(new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(ArenaRegistry.initialize, (
                admin, admin, address(0xdead), Constants.REGISTRATION_FEE, 0
            ))
        ))));

        StableRegistry stableImpl = new StableRegistry();
        stableReg = StableRegistry(payable(address(new ERC1967Proxy(
            address(stableImpl),
            abi.encodeCall(StableRegistry.initialize, (admin, admin, address(registry)))
        ))));


        BountyFactory factoryImpl = new BountyFactory();
        factory = BountyFactory(address(new ERC1967Proxy(
            address(factoryImpl),
            abi.encodeCall(BountyFactory.initialize, (admin, admin))
        )));

        SeasonManager seasonImpl = new SeasonManager();
        season = SeasonManager(address(new ERC1967Proxy(
            address(seasonImpl),
            abi.encodeCall(SeasonManager.initialize, (admin, admin, address(treasury), address(factory)))
        )));

        // Wire
        factory.setRoundImplementation(address(roundImpl));
        factory.setContractAddresses(
            address(registry), address(elo), address(treasury),
            address(stableReg), address(season), address(0xdead), address(oracle)
        );

        // Grant roles
        factory.grantRole(Constants.BOUNTY_CREATOR_ROLE, operator);
        factory.grantRole(Constants.OPERATOR_ROLE, operator);
        elo.grantRole(elo.ROUND_ROLE(), address(factory));
        IAccessControl(address(registry)).grantRole(Constants.OPERATOR_ROLE, operator);

        vm.stopPrank();

        // Fund actors
        vm.deal(sponsor, 10 ether);
        vm.deal(agent1Owner, 1 ether);
        vm.deal(operator, 1 ether);
    }

    function test_fullLifecycle_OPEN_to_CLAIMED() public {
        // ═══════════════════════════════════════════
        //  Register agent
        // ═══════════════════════════════════════════
        vm.prank(agent1Owner);
        registry.registerWithETH{value: Constants.REGISTRATION_FEE}(keccak256("agent1"));
        uint256 agentId = registry.nextAgentId() - 1;
        assertEq(agentId, 1, "Agent ID should be 1");

        // ═══════════════════════════════════════════
        //  Create bounty (operator)
        // ═══════════════════════════════════════════
        uint16[] memory prizes = new uint16[](1);
        prizes[0] = 10000; // 100% to winner

        BountyFactory.BountyConfig memory config = BountyFactory.BountyConfig({
            problemCid: keccak256("test-problem"),
            entryFee: 0.003 ether,
            commitDuration: 1 hours,
            prizeDistribution: prizes,
            maxAgents: 10,
            tier: 0,
            acceptanceThreshold: 5000,
            graduatedPayouts: true,
            active: false,    // set by contract
            createdAt: 0,     // set by contract
            creator: address(0) // set by contract
        });

        vm.prank(operator);
        uint256 bountyId = factory.createBounty(config);

        // ═══════════════════════════════════════════
        //  Spawn round → OPEN
        // ═══════════════════════════════════════════
        vm.prank(operator);
        address roundAddr = factory.spawnRound(bountyId);
        BountyRound round = BountyRound(payable(roundAddr));

        assertEq(uint256(round.phase()), 0, "Should be OPEN");

        // Grant cross-contract roles to the new round
        // In production, the factory should auto-grant these during spawnRound
        vm.startPrank(admin);
        elo.grantRole(elo.ROUND_ROLE(), roundAddr);
        IAccessControl(address(registry)).grantRole(Constants.BOUNTY_ROUND_ROLE, roundAddr);
        vm.stopPrank();

        // ═══════════════════════════════════════════
        //  Deposit → FUNDED
        // ═══════════════════════════════════════════
        vm.prank(operator);  // operator is sponsor (creator)
        round.depositBounty{value: Constants.MIN_BOUNTY_DEPOSIT}();

        assertEq(uint256(round.phase()), 1, "Should be FUNDED");

        // ═══════════════════════════════════════════
        //  Agent enters
        // ═══════════════════════════════════════════
        vm.prank(agent1Owner);
        round.enter{value: 0.003 ether}(agentId);

        assertTrue(round.isParticipant(agentId), "Agent should be participant");

        // ═══════════════════════════════════════════
        //  Start commit phase → COMMIT
        //  THIS IS THE TRANSITION THAT WAS MISSING!
        // ═══════════════════════════════════════════
        vm.prank(operator);
        factory.startCommitPhase(bountyId, 0);

        assertEq(uint256(round.phase()), 2, "Should be COMMIT");

        // ═══════════════════════════════════════════
        //  Commit solution
        // ═══════════════════════════════════════════
        bytes32 solutionHash = keccak256(abi.encodePacked("my-solution", "my-salt"));

        vm.prank(agent1Owner);
        round.commitSolution(agentId, solutionHash);

        (bytes32 storedHash,) = round.getCommitment(agentId);
        assertEq(storedHash, solutionHash, "Solution hash should match");

        // ═══════════════════════════════════════════
        //  Warp past commit deadline → SCORING
        // ═══════════════════════════════════════════
        vm.warp(block.timestamp + 1 hours + 1);

        round.startScoringPhase();
        assertEq(uint256(round.phase()), 3, "Should be SCORING");

        // ═══════════════════════════════════════════
        //  Submit scores via ScoringOracle
        // ═══════════════════════════════════════════
        uint256[] memory agentIds = new uint256[](1);
        agentIds[0] = agentId;
        uint256[] memory scores = new uint256[](1);
        scores[0] = 8000; // 80%

        vm.prank(scorer);
        oracle.submitScores(roundAddr, agentIds, scores);

        assertTrue(oracle.isResultVerified(roundAddr), "Scores should be verified");

        // ═══════════════════════════════════════════
        //  Finalize → SETTLED
        // ═══════════════════════════════════════════
        round.finalize();
        assertEq(uint256(round.phase()), 4, "Should be SETTLED");

        // ═══════════════════════════════════════════
        //  Claim winnings
        // ═══════════════════════════════════════════
        uint256 claimable = round.getClaimable(agent1Owner);
        assertGt(claimable, 0, "Should have claimable amount");

        uint256 balBefore = agent1Owner.balance;
        round.claim(agent1Owner);
        uint256 balAfter = agent1Owner.balance;

        assertEq(balAfter - balBefore, claimable, "Should receive full claimable amount");

        console2.log("=== FULL LIFECYCLE COMPLETE ===");
        console2.log("Prize claimed:", claimable);
    }

    function test_cannotSkipPhases() public {
        // Register agent
        vm.prank(agent1Owner);
        registry.registerWithETH{value: Constants.REGISTRATION_FEE}(keccak256("agent1"));

        // Create + spawn
        uint16[] memory prizes = new uint16[](1);
        prizes[0] = 10000;
        BountyFactory.BountyConfig memory config = BountyFactory.BountyConfig({
            problemCid: keccak256("test"), entryFee: 0.003 ether,
            commitDuration: 1 hours, prizeDistribution: prizes,
            maxAgents: 10, tier: 0, acceptanceThreshold: 5000,
            graduatedPayouts: true, active: false, createdAt: 0, creator: address(0)
        });
        vm.prank(operator);
        uint256 bountyId = factory.createBounty(config);
        vm.prank(operator);
        address roundAddr = factory.spawnRound(bountyId);
        BountyRound round = BountyRound(payable(roundAddr));

        // Cannot enter in OPEN (need FUNDED)
        vm.prank(agent1Owner);
        vm.expectRevert();
        round.enter{value: 0.003 ether}(1);

        // Cannot commit in OPEN
        vm.prank(agent1Owner);
        vm.expectRevert();
        round.commitSolution(1, keccak256("x"));

        // Cannot start scoring in OPEN
        vm.expectRevert();
        round.startScoringPhase();

        // Cannot finalize in OPEN
        vm.expectRevert();
        round.finalize();
    }
}
