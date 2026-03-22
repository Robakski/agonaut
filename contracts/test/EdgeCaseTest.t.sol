// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {ArenaRegistry} from "../src/ArenaRegistry.sol";
import {EloSystem} from "../src/EloSystem.sol";
import {StableRegistry} from "../src/StableRegistry.sol";
import {SeasonManager} from "../src/SeasonManager.sol";
import {Treasury} from "../src/Treasury.sol";
import {ScoringOracle} from "../src/ScoringOracle.sol";
import {BountyRound} from "../src/BountyRound.sol";
import {BountyFactory} from "../src/BountyFactory.sol";
import {Constants} from "../src/Constants.sol";

/**
 * @title EdgeCaseTest
 * @notice Covers the remaining 6 edge cases from the security analysis:
 *
 *   3. Sponsor overcapitalization — what if sponsor deposits way more ETH than needed?
 *   5. Scorer input validation — malformed scores (>10000, uint overflow, zero-length)
 *   7. Multiple rounds per bounty — second round after first completes
 *  10. Scorer gas with many agents — submitScores with max realistic agent count
 *  14. Commit deadline race — commit at exact deadline timestamp
 *  15. Fuzz testing — fuzz entry fees, scores, agent counts, deposit amounts
 */
contract EdgeCaseTest is Test {
    // ── Actors ──
    address admin = makeAddr("admin");
    address operator = makeAddr("operator");
    address scorer = makeAddr("scorer");
    address sponsor = makeAddr("sponsor");
    address[] agentOwners;

    // ── Contracts ──
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

        elo = new EloSystem();
        roundImpl = new BountyRound();

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

        // Wire factory
        factory.setRoundImplementation(address(roundImpl));
        factory.setContractAddresses(
            address(registry), address(elo), address(treasury),
            address(stableReg), address(season), address(0xdead), address(oracle)
        );

        // Grant roles
        factory.grantRole(Constants.BOUNTY_CREATOR_ROLE, operator);
        factory.grantRole(Constants.OPERATOR_ROLE, operator);
        elo.grantRole(elo.DEFAULT_ADMIN_ROLE(), address(factory));
        IAccessControl(address(registry)).grantRole(0x00, address(factory));
        IAccessControl(address(registry)).grantRole(Constants.OPERATOR_ROLE, operator);

        vm.stopPrank();

        // Create 20 agent owners for gas tests
        for (uint256 i = 0; i < 20; i++) {
            address owner = makeAddr(string(abi.encodePacked("agent", vm.toString(i))));
            agentOwners.push(owner);
            vm.deal(owner, 10 ether);
        }

        vm.deal(operator, 100 ether);
        vm.deal(sponsor, 100 ether);
    }

    // ── Helpers ──
    function _registerAgent(address owner, string memory name) internal returns (uint256) {
        vm.prank(owner);
        registry.registerWithETH{value: Constants.REGISTRATION_FEE}(keccak256(bytes(name)));
        return registry.nextAgentId() - 1;
    }

    function _createRound(uint256 deposit, uint8 maxAgents, uint16 threshold)
        internal returns (BountyRound round, uint256 bountyId)
    {
        uint16[] memory prizes = new uint16[](3);
        prizes[0] = 5000;
        prizes[1] = 3000;
        prizes[2] = 2000;

        BountyFactory.BountyConfig memory config = BountyFactory.BountyConfig({
            problemCid: keccak256("test-problem"),
            entryFee: Constants.ENTRY_FEE,
            commitDuration: 1 hours,
            prizeDistribution: prizes,
            maxAgents: maxAgents,
            tier: 0,
            acceptanceThreshold: threshold,
            graduatedPayouts: true,
            active: false,
            createdAt: 0,
            creator: address(0)
        });

        vm.prank(operator);
        bountyId = factory.createBounty(config);
        vm.prank(operator);
        address roundAddr = factory.spawnRound(bountyId);
        round = BountyRound(payable(roundAddr));
    }

    function _createSingleWinnerRound(uint256 deposit, uint8 maxAgents)
        internal returns (BountyRound round, uint256 bountyId)
    {
        uint16[] memory prizes = new uint16[](1);
        prizes[0] = 10000;

        BountyFactory.BountyConfig memory config = BountyFactory.BountyConfig({
            problemCid: keccak256("test-problem-single"),
            entryFee: Constants.ENTRY_FEE,
            commitDuration: 1 hours,
            prizeDistribution: prizes,
            maxAgents: maxAgents,
            tier: 0,
            acceptanceThreshold: 7000,
            graduatedPayouts: false,
            active: false,
            createdAt: 0,
            creator: address(0)
        });

        vm.prank(operator);
        bountyId = factory.createBounty(config);
        vm.prank(operator);
        address roundAddr = factory.spawnRound(bountyId);
        round = BountyRound(payable(roundAddr));
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE 3: Sponsor Overcapitalization
    // ═══════════════════════════════════════════════════════════════

    /// @notice Sponsor deposits exactly the minimum — should work
    function test_sponsorDepositsMinimum() public {
        (BountyRound round, uint256 bountyId) = _createRound(1 ether, 10, 7000);
        vm.prank(operator);
        round.depositBounty{value: Constants.MIN_BOUNTY_DEPOSIT}();
        assertGe(address(round).balance, Constants.MIN_BOUNTY_DEPOSIT);
    }

    /// @notice Sponsor deposits 100x the minimum — excess stays in contract, distributed to winners
    function test_sponsorDepositsExcess_distributedToWinners() public {
        (BountyRound round, uint256 bountyId) = _createSingleWinnerRound(1 ether, 10);
        uint256 largeDeposit = 10 ether;

        vm.prank(operator);
        round.depositBounty{value: largeDeposit}();

        // Register + enter agent
        uint256 agentId = _registerAgent(agentOwners[0], "agent0");
        vm.prank(agentOwners[0]);
        round.enter{value: Constants.ENTRY_FEE}(agentId);

        // Fund → Commit
        vm.prank(operator);
        factory.startCommitPhase(bountyId, 0);

        // Commit
        vm.prank(agentOwners[0]);
        round.commitSolution(agentId, keccak256("solution1"));

        // Fast forward past deadline
        vm.warp(block.timestamp + 2 hours);

        // Score
        uint256[] memory ids = new uint256[](1);
        ids[0] = agentId;
        uint256[] memory scores = new uint256[](1);
        scores[0] = 8000;

        vm.prank(scorer);
        oracle.submitScores(address(round), ids, scores);

        // Advance to SCORING phase
        round.startScoringPhase();

        // Finalize
        round.finalize();

        // Claim — winner should get their share of the FULL deposit (minus protocol fee)
        uint256 balBefore = agentOwners[0].balance;
        vm.prank(agentOwners[0]);
        round.claim(agentOwners[0]);
        uint256 received = agentOwners[0].balance - balBefore;

        // Winner gets: (deposit + entryFees) * (1 - protocolFee) * prizeShare
        // With 10 ETH deposit + 0.003 entry fee, 2% protocol fee:
        // Pool = (10 + 0.003) * 0.98 = ~9.80294
        // Single winner gets 100%
        assertGt(received, 9 ether, "Winner should receive majority of large deposit");
    }

    /// @notice Cannot deposit zero ETH
    function test_cannotDepositZero() public {
        (BountyRound round, uint256 bountyId) = _createRound(1 ether, 10, 7000);
        vm.prank(operator);
        vm.expectRevert();
        round.depositBounty{value: 0}();
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE 5: Scorer Input Validation — Malformed Scores
    // ═══════════════════════════════════════════════════════════════

    /// @notice Score exceeding 10000 BPS should still be accepted by ScoringOracle
    ///         (Oracle stores raw scores; BountyRound interprets them)
    function test_scorerSubmitsScoreAbove10000() public {
        (BountyRound round, uint256 bountyId) = _createSingleWinnerRound(1 ether, 10);
        vm.prank(operator);
        round.depositBounty{value: 1 ether}();

        uint256 agentId = _registerAgent(agentOwners[0], "agent0");
        vm.prank(agentOwners[0]);
        round.enter{value: Constants.ENTRY_FEE}(agentId);
        vm.prank(operator);
        factory.startCommitPhase(bountyId, 0);
        vm.prank(agentOwners[0]);
        round.commitSolution(agentId, keccak256("solution"));
        vm.warp(block.timestamp + 2 hours);

        // Submit score > 10000
        uint256[] memory ids = new uint256[](1);
        ids[0] = agentId;
        uint256[] memory scores = new uint256[](1);
        scores[0] = 99999; // Way above max

        vm.prank(scorer);
        oracle.submitScores(address(round), ids, scores);

        // Oracle stores it — verify
        (uint256[] memory retIds, uint256[] memory retScores) = oracle.getScores(address(round));
        assertEq(retScores[0], 99999, "Oracle should store raw score");
    }

    /// @notice Empty arrays should revert
    function test_scorerSubmitsEmptyArrays() public {
        uint256[] memory ids = new uint256[](0);
        uint256[] memory scores = new uint256[](0);

        vm.prank(scorer);
        vm.expectRevert();
        oracle.submitScores(address(0x1234), ids, scores);
    }

    /// @notice Mismatched array lengths should revert
    function test_scorerSubmitsMismatchedArrays() public {
        uint256[] memory ids = new uint256[](2);
        ids[0] = 1;
        ids[1] = 2;
        uint256[] memory scores = new uint256[](1);
        scores[0] = 5000;

        vm.prank(scorer);
        vm.expectRevert();
        oracle.submitScores(address(0x5678), ids, scores);
    }

    /// @notice Zero address round should revert
    function test_scorerSubmitsToZeroAddress() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        uint256[] memory scores = new uint256[](1);
        scores[0] = 5000;

        vm.prank(scorer);
        vm.expectRevert();
        oracle.submitScores(address(0), ids, scores);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE 7: Multiple Rounds Per Bounty
    // ═══════════════════════════════════════════════════════════════

    /// @notice Operator can spawn a second round for the same bounty
    function test_multipleRoundsPerBounty() public {
        uint16[] memory prizes = new uint16[](1);
        prizes[0] = 10000;

        BountyFactory.BountyConfig memory config = BountyFactory.BountyConfig({
            problemCid: keccak256("multi-round-problem"),
            entryFee: Constants.ENTRY_FEE,
            commitDuration: 1 hours,
            prizeDistribution: prizes,
            maxAgents: 10,
            tier: 0,
            acceptanceThreshold: 7000,
            graduatedPayouts: false,
            active: false,
            createdAt: 0,
            creator: address(0)
        });

        vm.prank(operator);
        uint256 bountyId = factory.createBounty(config);

        // Spawn round 1
        vm.prank(operator);
        address round1 = factory.spawnRound(bountyId);

        // Spawn round 2
        vm.prank(operator);
        address round2 = factory.spawnRound(bountyId);

        // Both should exist and be different
        assertTrue(round1 != round2, "Rounds should be different contracts");
        assertEq(factory.getRoundCount(bountyId), 2, "Should have 2 rounds");
        assertEq(factory.getRoundAddress(bountyId, 0), round1);
        assertEq(factory.getRoundAddress(bountyId, 1), round2);
    }

    /// @notice Agents in round 2 are independent from round 1
    function test_multipleRounds_independentState() public {
        uint16[] memory prizes = new uint16[](1);
        prizes[0] = 10000;

        BountyFactory.BountyConfig memory config = BountyFactory.BountyConfig({
            problemCid: keccak256("independent-rounds"),
            entryFee: Constants.ENTRY_FEE,
            commitDuration: 1 hours,
            prizeDistribution: prizes,
            maxAgents: 10,
            tier: 0,
            acceptanceThreshold: 7000,
            graduatedPayouts: false,
            active: false,
            createdAt: 0,
            creator: address(0)
        });

        vm.prank(operator);
        uint256 bountyId = factory.createBounty(config);

        vm.prank(operator);
        BountyRound round1 = BountyRound(payable(factory.spawnRound(bountyId)));
        vm.prank(operator);
        BountyRound round2 = BountyRound(payable(factory.spawnRound(bountyId)));

        // Fund both
        vm.prank(operator);
        round1.depositBounty{value: 1 ether}();
        vm.prank(operator);
        round2.depositBounty{value: 1 ether}();

        // Register agent — can enter both rounds
        uint256 agentId = _registerAgent(agentOwners[0], "multiAgent");

        vm.prank(agentOwners[0]);
        round1.enter{value: Constants.ENTRY_FEE}(agentId);
        vm.prank(agentOwners[0]);
        round2.enter{value: Constants.ENTRY_FEE}(agentId);

        // Both rounds have the agent
        assertEq(round1.getParticipantCount(), 1);
        assertEq(round2.getParticipantCount(), 1);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE 10: Scorer Gas with Many Agents
    // ═══════════════════════════════════════════════════════════════

    /// @notice submitScores with 20 agents should succeed (gas test)
    function test_submitScores_20agents_gasOk() public {
        (BountyRound round, uint256 bountyId) = _createSingleWinnerRound(1 ether, 30);
        vm.prank(operator);
        round.depositBounty{value: 5 ether}();

        // Register and enter 20 agents
        uint256[] memory agentIds = new uint256[](20);
        for (uint256 i = 0; i < 20; i++) {
            agentIds[i] = _registerAgent(agentOwners[i], string(abi.encodePacked("massAgent", vm.toString(i))));
            vm.prank(agentOwners[i]);
            round.enter{value: Constants.ENTRY_FEE}(agentIds[i]);
        }

        vm.prank(operator);
        factory.startCommitPhase(bountyId, 0);

        // All commit
        for (uint256 i = 0; i < 20; i++) {
            vm.prank(agentOwners[i]);
            round.commitSolution(agentIds[i], keccak256(abi.encodePacked("solution", i)));
        }

        vm.warp(block.timestamp + 2 hours);

        // Submit all 20 scores at once
        uint256[] memory scores = new uint256[](20);
        for (uint256 i = 0; i < 20; i++) {
            scores[i] = 5000 + i * 200; // Spread of scores
        }

        uint256 gasBefore = gasleft();
        vm.prank(scorer);
        oracle.submitScores(address(round), agentIds, scores);
        uint256 gasUsed = gasBefore - gasleft();

        console2.log("Gas used for 20-agent submitScores:", gasUsed);
        assertTrue(gasUsed < 1_000_000, "submitScores for 20 agents should use < 1M gas");

        // Verify stored correctly
        assertTrue(oracle.isResultVerified(address(round)));
        (uint256[] memory retIds, uint256[] memory retScores) = oracle.getScores(address(round));
        assertEq(retIds.length, 20);
        assertEq(retScores.length, 20);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE 14: Commit Deadline Race Condition
    // ═══════════════════════════════════════════════════════════════

    /// @notice Commit at exact deadline succeeds (boundary is inclusive: <=)
    function test_commitAtExactDeadline_succeeds() public {
        (BountyRound round, uint256 bountyId) = _createSingleWinnerRound(1 ether, 10);
        vm.prank(operator);
        round.depositBounty{value: 1 ether}();

        uint256 agentId = _registerAgent(agentOwners[0], "deadlineAgent");
        vm.prank(agentOwners[0]);
        round.enter{value: Constants.ENTRY_FEE}(agentId);
        vm.prank(operator);
        factory.startCommitPhase(bountyId, 0);

        // Warp to exact deadline (inclusive — should still work)
        vm.warp(block.timestamp + 1 hours);

        vm.prank(agentOwners[0]);
        round.commitSolution(agentId, keccak256("at-deadline"));
    }

    /// @notice Commit 1 second AFTER deadline should fail
    function test_commitAfterDeadline_reverts() public {
        (BountyRound round, uint256 bountyId) = _createSingleWinnerRound(1 ether, 10);
        vm.prank(operator);
        round.depositBounty{value: 1 ether}();

        uint256 agentId = _registerAgent(agentOwners[0], "lateAgent");
        vm.prank(agentOwners[0]);
        round.enter{value: Constants.ENTRY_FEE}(agentId);
        vm.prank(operator);
        factory.startCommitPhase(bountyId, 0);

        // Warp 1 second past deadline
        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(agentOwners[0]);
        vm.expectRevert();
        round.commitSolution(agentId, keccak256("too-late"));
    }

    /// @notice Commit 1 second before deadline should succeed
    function test_commitOneSecondBeforeDeadline_succeeds() public {
        (BountyRound round, uint256 bountyId) = _createSingleWinnerRound(1 ether, 10);
        vm.prank(operator);
        round.depositBounty{value: 1 ether}();

        uint256 agentId = _registerAgent(agentOwners[0], "earlyAgent");
        vm.prank(agentOwners[0]);
        round.enter{value: Constants.ENTRY_FEE}(agentId);
        vm.prank(operator);
        factory.startCommitPhase(bountyId, 0);

        // Warp to 1 second before deadline
        vm.warp(block.timestamp + 1 hours - 1);

        // Should succeed
        vm.prank(agentOwners[0]);
        round.commitSolution(agentId, keccak256("just-in-time"));
    }

    // ═══════════════════════════════════════════════════════════════
    //  EDGE CASE 15: Fuzz Testing
    // ═══════════════════════════════════════════════════════════════

    /// @notice Fuzz: ScoringOracle accepts any uint256 score value
    function testFuzz_scorerSubmitsArbitraryScore(uint256 score) public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        uint256[] memory scores = new uint256[](1);
        scores[0] = score;

        // Use a unique round address per fuzz run to avoid "already submitted"
        address fakeRound = address(uint160(uint256(keccak256(abi.encodePacked(score, block.timestamp)))));

        vm.prank(scorer);
        oracle.submitScores(fakeRound, ids, scores);

        assertTrue(oracle.isResultVerified(fakeRound));
        (, uint256[] memory retScores) = oracle.getScores(fakeRound);
        assertEq(retScores[0], score);
    }

    /// @notice Fuzz: deposit amounts above minimum should always work
    function testFuzz_sponsorDeposit(uint256 amount) public {
        // Bound to reasonable range: min deposit to 1000 ETH
        amount = bound(amount, Constants.MIN_BOUNTY_DEPOSIT, 100 ether);

        (BountyRound round, uint256 bountyId) = _createSingleWinnerRound(1 ether, 10);
        vm.deal(sponsor, amount + 1 ether);
        vm.prank(operator);
        round.depositBounty{value: amount}();
        assertGe(address(round).balance, amount);
    }

    /// @notice Fuzz: agent count from 1 to maxAgents all work correctly
    function testFuzz_agentCount(uint8 numAgents) public {
        numAgents = uint8(bound(numAgents, 1, 15)); // Cap at 15 for gas

        (BountyRound round, uint256 bountyId) = _createSingleWinnerRound(1 ether, 20);
        vm.prank(operator);
        round.depositBounty{value: 5 ether}();

        // Register and enter agents
        uint256[] memory agentIds = new uint256[](numAgents);
        for (uint8 i = 0; i < numAgents; i++) {
            address owner = makeAddr(string(abi.encodePacked("fuzzAgent", vm.toString(i))));
            vm.deal(owner, 10 ether);
            vm.prank(owner);
            registry.registerWithETH{value: Constants.REGISTRATION_FEE}(keccak256(abi.encodePacked("fuzz", i)));
            agentIds[i] = registry.nextAgentId() - 1;
            vm.prank(owner);
            round.enter{value: Constants.ENTRY_FEE}(agentIds[i]);
        }

        assertEq(round.getParticipantCount(), numAgents);
    }

    /// @notice Fuzz: acceptance threshold from 1000-9500 all valid
    function testFuzz_acceptanceThreshold(uint16 threshold) public {
        threshold = uint16(bound(threshold, 1000, 9500));

        uint16[] memory prizes = new uint16[](1);
        prizes[0] = 10000;

        BountyFactory.BountyConfig memory config = BountyFactory.BountyConfig({
            problemCid: keccak256(abi.encodePacked("fuzz-threshold", threshold)),
            entryFee: Constants.ENTRY_FEE,
            commitDuration: 1 hours,
            prizeDistribution: prizes,
            maxAgents: 10,
            tier: 0,
            acceptanceThreshold: threshold,
            graduatedPayouts: true,
            active: false,
            createdAt: 0,
            creator: address(0)
        });

        vm.prank(operator);
        uint256 bountyId = factory.createBounty(config);
        vm.prank(operator);
        address roundAddr = factory.spawnRound(bountyId);
        assertTrue(roundAddr != address(0), "Round should deploy for any valid threshold");
    }
}
