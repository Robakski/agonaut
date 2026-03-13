// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ScorerRegistry} from "../src/deprecated/ScorerRegistry.sol";

/// @dev Mock treasury that accepts ETH.
contract MockTreasury {
    receive() external payable {}
}

contract ScorerRegistryTest is Test {
    ScorerRegistry public registry;
    MockTreasury public treasury;

    address admin = address(this);
    address roundCaller = makeAddr("roundCaller");
    address scorer1 = makeAddr("scorer1");
    address scorer2 = makeAddr("scorer2");
    address scorer3 = makeAddr("scorer3");
    address scorer4 = makeAddr("scorer4");
    address unauthorised = makeAddr("unauthorised");

    uint256 constant MIN_STAKE = 0.1 ether;

    function setUp() public {
        treasury = new MockTreasury();

        ScorerRegistry impl = new ScorerRegistry();
        bytes memory init = abi.encodeCall(ScorerRegistry.initialize, (admin));
        registry = ScorerRegistry(payable(address(new ERC1967Proxy(address(impl), init))));

        // Grant ROUND_ROLE to roundCaller
        registry.grantRole(registry.ROUND_ROLE(), roundCaller);

        // Fund wallets
        vm.deal(scorer1, 10 ether);
        vm.deal(scorer2, 10 ether);
        vm.deal(scorer3, 10 ether);
        vm.deal(scorer4, 10 ether);
        vm.deal(roundCaller, 10 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _register(address wallet) internal returns (uint256) {
        vm.prank(wallet);
        return registry.registerScorer{value: MIN_STAKE}();
    }

    function _register(address wallet, uint256 stake) internal returns (uint256) {
        vm.prank(wallet);
        return registry.registerScorer{value: stake}();
    }

    function _openRound(uint64 deadline) internal returns (uint256) {
        vm.prank(roundCaller);
        return registry.openScoringRound{value: 1 ether}(address(treasury), deadline);
    }

    function _submitScores(uint256 roundId, uint256 scorerId, address wallet, uint256[] memory scores) internal {
        uint256[] memory agentIds = new uint256[](scores.length);
        for (uint256 i = 0; i < scores.length; i++) agentIds[i] = i + 1;
        vm.prank(wallet);
        registry.submitScores(roundId, scorerId, agentIds, scores);
    }

    function _makeScores(uint256 a, uint256 b) internal pure returns (uint256[] memory s) {
        s = new uint256[](2);
        s[0] = a;
        s[1] = b;
    }

    // ═══════════════════════════════════════════════════════════════
    //  1. Register scorer with minimum stake
    // ═══════════════════════════════════════════════════════════════

    function test_RegisterScorerMinStake() public {
        uint256 id = _register(scorer1);
        assertEq(id, 1);

        ScorerRegistry.Scorer memory s = registry.getScorerInfo(id);
        assertEq(s.wallet, scorer1);
        assertEq(s.stakedAmount, MIN_STAKE);
        assertTrue(s.active);
        assertEq(s.totalScorings, 0);
        assertEq(registry.getScorerIdByWallet(scorer1), id);
        assertEq(registry.getScorerCount(), 1);
        assertEq(registry.getActiveScorerCount(), 1);
    }

    // ═══════════════════════════════════════════════════════════════
    //  2. Stake top-up
    // ═══════════════════════════════════════════════════════════════

    function test_StakeTopUp() public {
        uint256 id = _register(scorer1);

        vm.prank(scorer1);
        registry.topUpStake{value: 0.5 ether}(id);

        ScorerRegistry.Scorer memory s = registry.getScorerInfo(id);
        assertEq(s.stakedAmount, MIN_STAKE + 0.5 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  3. Revert if below min stake
    // ═══════════════════════════════════════════════════════════════

    function test_RevertBelowMinStake() public {
        vm.prank(scorer1);
        vm.expectRevert(
            abi.encodeWithSelector(ScorerRegistry.InsufficientStake.selector, 0.01 ether, MIN_STAKE)
        );
        registry.registerScorer{value: 0.01 ether}();
    }

    // ═══════════════════════════════════════════════════════════════
    //  4. Open scoring round (ROUND_ROLE)
    // ═══════════════════════════════════════════════════════════════

    function test_OpenScoringRound() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 roundId = _openRound(deadline);
        assertEq(roundId, 1);

        ScorerRegistry.ScoringRound memory r = registry.getRoundInfo(roundId);
        assertEq(r.roundAddr, address(treasury));
        assertEq(r.rewardPool, 1 ether);
        assertEq(r.deadline, deadline);
        assertFalse(r.finalized);
    }

    // ═══════════════════════════════════════════════════════════════
    //  5. Submit scores for a round
    // ═══════════════════════════════════════════════════════════════

    function test_SubmitScores() public {
        uint256 id1 = _register(scorer1);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 roundId = _openRound(deadline);

        uint256[] memory scores = _makeScores(100, 200);
        _submitScores(roundId, id1, scorer1, scores);

        ScorerRegistry.ScoringRound memory r = registry.getRoundInfo(roundId);
        assertEq(r.scorerCount, 1);
        assertEq(registry.getPendingRoundCount(id1), 1);
    }

    // ═══════════════════════════════════════════════════════════════
    //  6. Consensus reached — 2/3 majority
    // ═══════════════════════════════════════════════════════════════

    function test_ConsensusReached() public {
        // Need 3/4 (75%) to pass 66.67% threshold since 2/3 doesn't pass
        uint256 id1 = _register(scorer1);
        uint256 id2 = _register(scorer2);
        uint256 id3 = _register(scorer3);
        uint256 id4 = _register(scorer4);

        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 roundId = _openRound(deadline);

        uint256[] memory agree = _makeScores(100, 200);
        uint256[] memory disagree = _makeScores(999, 888);

        _submitScores(roundId, id1, scorer1, agree);
        _submitScores(roundId, id2, scorer2, agree);
        _submitScores(roundId, id3, scorer3, agree);
        _submitScores(roundId, id4, scorer4, disagree);

        vm.warp(block.timestamp + 1 hours + 1);

        uint256 bal1Before = scorer1.balance;
        uint256 bal2Before = scorer2.balance;

        registry.resolveConsensus(roundId);

        // Round finalized
        assertTrue(registry.getRoundInfo(roundId).finalized);
        assertTrue(registry.isInConsensus(roundId, id1));
        assertTrue(registry.isInConsensus(roundId, id2));
        assertTrue(registry.isInConsensus(roundId, id3));
        assertFalse(registry.isInConsensus(roundId, id4));

        // Consensus scores stored
        (, uint256[] memory scores) = registry.getConsensusScores(roundId);
        assertEq(scores[0], 100);
        assertEq(scores[1], 200);

        // Agreeing scorers got rewards
        assertTrue(scorer1.balance > bal1Before);
        assertTrue(scorer2.balance > bal2Before);
    }

    // ═══════════════════════════════════════════════════════════════
    //  7. Consensus NOT reached — disagreement
    // ═══════════════════════════════════════════════════════════════

    function test_ConsensusNotReached() public {
        uint256 id1 = _register(scorer1);
        uint256 id2 = _register(scorer2);
        uint256 id3 = _register(scorer3);

        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 roundId = _openRound(deadline);

        // All different scores → no 2/3 majority
        _submitScores(roundId, id1, scorer1, _makeScores(100, 200));
        _submitScores(roundId, id2, scorer2, _makeScores(300, 400));
        _submitScores(roundId, id3, scorer3, _makeScores(500, 600));

        vm.warp(block.timestamp + 1 hours + 1);
        registry.resolveConsensus(roundId);

        assertTrue(registry.getRoundInfo(roundId).finalized);
        // Funds stranded
        assertEq(registry.stranded(), 1 ether);
        // No one slashed — stakes intact
        assertEq(registry.getScorerInfo(id1).stakedAmount, MIN_STAKE);
        assertEq(registry.getScorerInfo(id2).stakedAmount, MIN_STAKE);
        assertEq(registry.getScorerInfo(id3).stakedAmount, MIN_STAKE);
    }

    // ═══════════════════════════════════════════════════════════════
    //  8. Slash dishonest scorer
    // ═══════════════════════════════════════════════════════════════

    function test_SlashDishonestScorer() public {
        // 3/4 agree → consensus reached, scorer4 slashed
        uint256 id1 = _register(scorer1);
        uint256 id2 = _register(scorer2);
        uint256 id3 = _register(scorer3);
        uint256 id4 = _register(scorer4);

        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 roundId = _openRound(deadline);

        uint256[] memory agree = _makeScores(100, 200);
        uint256[] memory disagree = _makeScores(999, 888);

        _submitScores(roundId, id1, scorer1, agree);
        _submitScores(roundId, id2, scorer2, agree);
        _submitScores(roundId, id3, scorer3, agree);
        _submitScores(roundId, id4, scorer4, disagree);

        vm.warp(block.timestamp + 1 hours + 1);
        registry.resolveConsensus(roundId);

        // Scorer4 slashed 50%
        ScorerRegistry.Scorer memory s4 = registry.getScorerInfo(id4);
        assertEq(s4.stakedAmount, MIN_STAKE / 2);
        assertEq(s4.slashedCount, 1);

        // Slash funds accumulated
        assertEq(registry.pendingSlashFunds(), MIN_STAKE / 2);
    }

    // ═══════════════════════════════════════════════════════════════
    //  9. Reward honest scorers
    // ═══════════════════════════════════════════════════════════════

    function test_RewardHonestScorers() public {
        uint256 id1 = _register(scorer1);
        uint256 id2 = _register(scorer2);
        uint256 id3 = _register(scorer3);

        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 roundId = _openRound(deadline);

        uint256[] memory agree = _makeScores(10, 20);

        _submitScores(roundId, id1, scorer1, agree);
        _submitScores(roundId, id2, scorer2, agree);
        _submitScores(roundId, id3, scorer3, agree);

        vm.warp(block.timestamp + 1 hours + 1);

        uint256 bal1Before = scorer1.balance;
        registry.resolveConsensus(roundId);

        // All 3 agreed, equal stake → each gets 1/3 of reward pool
        uint256 expectedReward = uint256(1 ether) / uint256(3);
        assertApproxEqAbs(scorer1.balance - bal1Before, expectedReward, 1);

        ScorerRegistry.Scorer memory s1 = registry.getScorerInfo(id1);
        assertEq(s1.correctScorings, 1);
        assertEq(s1.totalScorings, 1);
    }

    // ═══════════════════════════════════════════════════════════════
    //  10. Cannot unregister with pending rounds
    // ═══════════════════════════════════════════════════════════════

    function test_CannotUnregisterWithPendingRounds() public {
        uint256 id1 = _register(scorer1);
        // Need 3 scorers minimum
        _register(scorer2);
        _register(scorer3);

        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 roundId = _openRound(deadline);

        _submitScores(roundId, id1, scorer1, _makeScores(10, 20));

        vm.prank(scorer1);
        vm.expectRevert(
            abi.encodeWithSelector(ScorerRegistry.ScorerLockedInActiveRound.selector, id1, 1)
        );
        registry.unregisterScorer(id1);
    }

    // ═══════════════════════════════════════════════════════════════
    //  11. Unregister + withdraw after rounds settled
    // ═══════════════════════════════════════════════════════════════

    function test_UnregisterAfterRoundsSettled() public {
        uint256 id1 = _register(scorer1);
        uint256 id2 = _register(scorer2);
        uint256 id3 = _register(scorer3);

        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 roundId = _openRound(deadline);

        uint256[] memory scores = _makeScores(10, 20);
        _submitScores(roundId, id1, scorer1, scores);
        _submitScores(roundId, id2, scorer2, scores);
        _submitScores(roundId, id3, scorer3, scores);

        vm.warp(block.timestamp + 1 hours + 1);
        registry.resolveConsensus(roundId);

        // Now scorer1 can unregister
        uint256 balBefore = scorer1.balance;
        ScorerRegistry.Scorer memory info = registry.getScorerInfo(id1);
        uint256 stake = info.stakedAmount;

        vm.prank(scorer1);
        registry.unregisterScorer(id1);

        assertEq(scorer1.balance, balBefore + stake);
        assertFalse(registry.getScorerInfo(id1).active);
    }

    // ═══════════════════════════════════════════════════════════════
    //  12. Access control — only ROUND_ROLE can open rounds
    // ═══════════════════════════════════════════════════════════════

    function test_OnlyRoundRoleCanOpenRound() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);

        vm.deal(unauthorised, 2 ether);
        vm.prank(unauthorised);
        vm.expectRevert();
        registry.openScoringRound{value: 1 ether}(address(treasury), deadline);
    }

    // ═══════════════════════════════════════════════════════════════
    //  BONUS TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_CannotDoubleSubmit() public {
        uint256 id1 = _register(scorer1);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 roundId = _openRound(deadline);

        _submitScores(roundId, id1, scorer1, _makeScores(10, 20));

        vm.expectRevert(
            abi.encodeWithSelector(ScorerRegistry.AlreadySubmitted.selector, roundId, id1)
        );
        _submitScores(roundId, id1, scorer1, _makeScores(10, 20));
    }

    function test_CannotSubmitAfterDeadline() public {
        uint256 id1 = _register(scorer1);
        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 roundId = _openRound(deadline);

        vm.warp(block.timestamp + 1 hours + 1);

        vm.expectRevert();
        _submitScores(roundId, id1, scorer1, _makeScores(10, 20));
    }

    function test_SlashFundsRollIntoNextRound() public {
        // Round 1: create slash funds (need 3/4 for consensus)
        uint256 id1 = _register(scorer1);
        uint256 id2 = _register(scorer2);
        uint256 id3 = _register(scorer3);
        uint256 id4 = _register(scorer4);

        uint64 deadline = uint64(block.timestamp + 1 hours);
        uint256 roundId = _openRound(deadline);

        _submitScores(roundId, id1, scorer1, _makeScores(10, 20));
        _submitScores(roundId, id2, scorer2, _makeScores(10, 20));
        _submitScores(roundId, id3, scorer3, _makeScores(10, 20));
        _submitScores(roundId, id4, scorer4, _makeScores(99, 88));

        vm.warp(block.timestamp + 1 hours + 1);
        registry.resolveConsensus(roundId);

        uint256 slashFunds = registry.pendingSlashFunds();
        assertTrue(slashFunds > 0);

        // Round 2: slash funds absorbed into reward pool
        uint64 deadline2 = uint64(block.timestamp + 2 hours);
        vm.prank(roundCaller);
        uint256 roundId2 = registry.openScoringRound{value: 0.5 ether}(address(treasury), deadline2);

        ScorerRegistry.ScoringRound memory r2 = registry.getRoundInfo(roundId2);
        assertEq(r2.rewardPool, 0.5 ether + slashFunds);
        assertEq(registry.pendingSlashFunds(), 0);
    }
}
