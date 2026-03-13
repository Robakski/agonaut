// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/*
 * ██████╗ ███████╗██╗      ███████╗ ██████╗  █████╗ ████████╗██╗ ██████╗ ███╗   ██╗
 * ██╔══██╗██╔════╝██║      ██╔════╝██╔════╝ ██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║
 * ██║  ██║█████╗  ██║      █████╗  ██║  ███╗███████║   ██║   ██║██║   ██║██╔██╗ ██║
 * ██║  ██║██╔══╝  ██║      ██╔══╝  ██║   ██║██╔══██║   ██║   ██║██║   ██║██║╚██╗██║
 * ██████╔╝███████╗███████╗ ███████╗╚██████╔╝██║  ██║   ██║   ██║╚██████╔╝██║ ╚████║
 * ╚═════╝ ╚══════╝╚══════╝ ╚══════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
 *
 * DelegationVault — Comprehensive Test Suite
 *
 * Covers:
 *   1.  Delegate to agent
 *   2.  Multiple delegators — proportional shares
 *   3.  Profit distribution (pull-based) — proportional amounts
 *   4.  Claim profits (balance verified after push)
 *   5.  24-hour withdrawal cooldown — cannot withdraw early
 *   6.  Withdrawal after cooldown — success
 *   7.  Cannot withdraw more than delegated (NothingToWithdraw)
 *   8.  Performance fee to agent
 *   9.  Zero delegators edge case
 *  10.  Access control — only BOUNTY_ROUND_ROLE may call distributeProfits
 *  11.  Re-delegation — additional stake for an existing delegator
 *  12.  Multiple profit distributions — accumulation
 */

import {Test} from "forge-std/Test.sol";

import {ERC1967Proxy}    from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl}  from "@openzeppelin/contracts/access/IAccessControl.sol";

import {DelegationVault} from "../../src/phase2/DelegationVault.sol";
import {Constants}       from "../../src/Constants.sol";

// ═══════════════════════════════════════════════════════════════════════
//  MOCK ArenaRegistry
// ═══════════════════════════════════════════════════════════════════════

/// @dev Minimal IArenaRegistry stub — only implements the two methods that
///      DelegationVault calls: isActive and getAgent.
contract MockArenaRegistry {
    mapping(uint256 => address)  public agentWallets;
    mapping(uint256 => bool)     public activeAgents;

    function setAgent(uint256 agentId, address wallet, bool active) external {
        agentWallets[agentId] = wallet;
        activeAgents[agentId] = active;
    }

    function isActive(uint256 agentId) external view returns (bool) {
        return activeAgents[agentId];
    }

    function getAgent(uint256 agentId)
        external
        view
        returns (
            address  wallet,
            bytes32  metadataHash,
            uint64   registeredAt,
            uint64   deregisteredAt,
            uint16   stableId,
            uint16   eloRating,
            uint256  totalWinnings,
            uint32   roundsEntered,
            uint32   roundsWon
        )
    {
        wallet        = agentWallets[agentId];
        metadataHash  = bytes32(0);
        registeredAt  = uint64(block.timestamp);
        deregisteredAt = 0;
        stableId      = 0;
        eloRating     = 1200;
        totalWinnings = 0;
        roundsEntered = 0;
        roundsWon     = 0;
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN TEST CONTRACT
// ═══════════════════════════════════════════════════════════════════════

contract DelegationVaultTest is Test {

    // ── Contracts ──────────────────────────────────────────────────────
    DelegationVault   public vault;
    MockArenaRegistry public mockRegistry;

    // ── Actors ────────────────────────────────────────────────────────
    address admin       = address(this);       // test contract is admin
    address bountyRound = makeAddr("bountyRound");

    address delegator1  = makeAddr("delegator1");
    address delegator2  = makeAddr("delegator2");
    address delegator3  = makeAddr("delegator3");

    address agentWallet1 = makeAddr("agentWallet1");
    address agentWallet2 = makeAddr("agentWallet2");

    // ── Fixed agent IDs ───────────────────────────────────────────────
    uint256 constant AGENT_ID_1 = 1;
    uint256 constant AGENT_ID_2 = 2;

    // ── ETH amounts ───────────────────────────────────────────────────
    uint256 constant MIN_DEL     = 0.001 ether;
    uint256 constant ONE_ETHER   = 1 ether;
    uint256 constant TWO_ETHER   = 2 ether;
    uint256 constant THREE_ETHER = 3 ether;

    // ══════════════════════════════════════════════════════════════════
    //  SET UP
    // ══════════════════════════════════════════════════════════════════

    function setUp() public {
        // 1. Deploy mock ArenaRegistry and register two agents
        mockRegistry = new MockArenaRegistry();
        mockRegistry.setAgent(AGENT_ID_1, agentWallet1, true);
        mockRegistry.setAgent(AGENT_ID_2, agentWallet2, true);

        // 2. Deploy DelegationVault behind a UUPS proxy
        DelegationVault impl = new DelegationVault();
        bytes memory initData = abi.encodeCall(
            DelegationVault.initialize,
            (admin, address(mockRegistry))
        );
        vault = DelegationVault(
            payable(address(new ERC1967Proxy(address(impl), initData)))
        );

        // 3. Grant BOUNTY_ROUND_ROLE to the mock bountyRound address
        vault.grantRole(Constants.BOUNTY_ROUND_ROLE, bountyRound);

        // 4. Fund actors
        vm.deal(delegator1,  100 ether);
        vm.deal(delegator2,  100 ether);
        vm.deal(delegator3,  100 ether);
        vm.deal(bountyRound, 100 ether);
    }

    // ══════════════════════════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════════════════════════

    /// @dev Perform a single delegation and return the delegationId.
    function _delegate(address delegator, uint256 agentId, uint256 amount)
        internal
        returns (uint256 delegationId)
    {
        delegationId = vault.nextDelegationId();
        vm.prank(delegator);
        vault.delegate{value: amount}(agentId);
    }

    /// @dev Grant BOUNTY_ROUND_ROLE and call distributeProfits from bountyRound.
    function _distribute(uint256 agentId, uint256 profit) internal {
        vm.prank(bountyRound);
        vault.distributeProfits{value: profit}(agentId);
    }

    // ══════════════════════════════════════════════════════════════════
    //  TEST 1: Delegate to agent
    // ══════════════════════════════════════════════════════════════════

    function test_DelegateToAgent() public {
        uint256 amount = ONE_ETHER;
        uint256 delegationId = _delegate(delegator1, AGENT_ID_1, amount);

        // Contract should hold the ETH
        assertEq(address(vault).balance, amount, "vault should hold deposited ETH");

        // Delegation struct must be correctly populated
        DelegationVault.Delegation memory d = vault.getDelegation(delegationId);
        assertEq(d.delegator,             delegator1, "delegator mismatch");
        assertEq(d.agentId,               AGENT_ID_1, "agentId mismatch");
        assertEq(d.amount,                amount,     "amount mismatch");
        assertEq(d.withdrawRequestedAt,   0,          "should not have withdraw request");

        // AgentVault totals
        DelegationVault.AgentVault memory av = vault.getAgentVault(AGENT_ID_1);
        assertEq(av.totalDelegated, amount, "totalDelegated mismatch");
        assertEq(av.delegationIds.length, 1, "expected one delegationId");

        // Delegator history
        uint256[] memory history = vault.getDelegatorDelegations(delegator1);
        assertEq(history.length, 1,            "expected one history entry");
        assertEq(history[0],    delegationId,  "history entry mismatch");

        // getAvailableFunds should reflect the full delegation
        assertEq(vault.getAvailableFunds(AGENT_ID_1), amount, "availableFunds mismatch");
    }

    /// @dev Below MIN_DELEGATION must revert.
    function test_DelegateToAgent_TooSmall() public {
        vm.prank(delegator1);
        vm.expectRevert(
            abi.encodeWithSelector(
                DelegationVault.DelegationTooSmall.selector,
                MIN_DEL - 1,
                MIN_DEL
            )
        );
        vault.delegate{value: MIN_DEL - 1}(AGENT_ID_1);
    }

    /// @dev Inactive agent must revert.
    function test_DelegateToAgent_InactiveAgent() public {
        uint256 inactiveId = 99;
        vm.prank(delegator1);
        vm.expectRevert(
            abi.encodeWithSelector(DelegationVault.AgentNotActive.selector, inactiveId)
        );
        vault.delegate{value: ONE_ETHER}(inactiveId);
    }

    // ══════════════════════════════════════════════════════════════════
    //  TEST 2: Multiple delegators — proportional shares
    // ══════════════════════════════════════════════════════════════════

    function test_MultipleDelegators() public {
        uint256 id1 = _delegate(delegator1, AGENT_ID_1, ONE_ETHER);
        uint256 id2 = _delegate(delegator2, AGENT_ID_1, TWO_ETHER);
        uint256 id3 = _delegate(delegator3, AGENT_ID_1, THREE_ETHER);

        uint256 totalExpected = ONE_ETHER + TWO_ETHER + THREE_ETHER;

        // Vault ETH balance
        assertEq(address(vault).balance, totalExpected, "vault balance mismatch");

        // AgentVault total
        DelegationVault.AgentVault memory av = vault.getAgentVault(AGENT_ID_1);
        assertEq(av.totalDelegated,    totalExpected, "totalDelegated mismatch");
        assertEq(av.delegationIds.length, 3,          "expected 3 delegationIds");

        // Individual delegation amounts
        assertEq(vault.getDelegation(id1).amount, ONE_ETHER,   "d1 amount mismatch");
        assertEq(vault.getDelegation(id2).amount, TWO_ETHER,   "d2 amount mismatch");
        assertEq(vault.getDelegation(id3).amount, THREE_ETHER, "d3 amount mismatch");

        // getAvailableFunds = all three (none pending withdrawal)
        assertEq(vault.getAvailableFunds(AGENT_ID_1), totalExpected, "availableFunds mismatch");
    }

    // ══════════════════════════════════════════════════════════════════
    //  TEST 3: Profit distribution (pull-based) — proportional amounts
    // ══════════════════════════════════════════════════════════════════

    function test_ProfitDistribution_Proportional() public {
        // Stakes: 1 : 2 : 3  (total = 6 ETH)
        _delegate(delegator1, AGENT_ID_1, ONE_ETHER);
        _delegate(delegator2, AGENT_ID_1, TWO_ETHER);
        _delegate(delegator3, AGENT_ID_1, THREE_ETHER);

        uint256 profit = 6 ether;

        uint256 bal1Before = delegator1.balance;
        uint256 bal2Before = delegator2.balance;
        uint256 bal3Before = delegator3.balance;

        vm.expectEmit(true, false, false, false, address(vault));
        emit DelegationVault.ProfitsDistributed(AGENT_ID_1, profit, 0, profit, 3);

        _distribute(AGENT_ID_1, profit);

        // With no performance fee:
        //   delegator1 → 6 eth × 1/6 = 1 eth
        //   delegator2 → 6 eth × 2/6 = 2 eth
        //   delegator3 → 6 eth × 3/6 = 3 eth
        assertEq(delegator1.balance - bal1Before, ONE_ETHER,   "delegator1 profit mismatch");
        assertEq(delegator2.balance - bal2Before, TWO_ETHER,   "delegator2 profit mismatch");
        assertEq(delegator3.balance - bal3Before, THREE_ETHER, "delegator3 profit mismatch");

        // totalProfits accumulates
        DelegationVault.AgentVault memory av = vault.getAgentVault(AGENT_ID_1);
        assertEq(av.totalProfits, profit, "totalProfits should equal distributed profit");
    }

    // ══════════════════════════════════════════════════════════════════
    //  TEST 4: Claim profits — delegator receives ETH directly on distribution
    // ══════════════════════════════════════════════════════════════════

    function test_ClaimProfits_BalanceIncreasedAfterDistribution() public {
        _delegate(delegator1, AGENT_ID_1, ONE_ETHER);

        uint256 profit = 0.5 ether;
        uint256 balBefore = delegator1.balance;

        _distribute(AGENT_ID_1, profit);

        // Push-based: delegator1 receives their share immediately
        assertEq(
            delegator1.balance - balBefore,
            profit,
            "delegator1 should receive full profit (sole delegator)"
        );
    }

    // ══════════════════════════════════════════════════════════════════
    //  TEST 5: 24-hour withdrawal cooldown — cannot withdraw early
    // ══════════════════════════════════════════════════════════════════

    function test_WithdrawCooldown_CannotWithdrawBeforeElapsed() public {
        uint256 delegationId = _delegate(delegator1, AGENT_ID_1, ONE_ETHER);

        vm.prank(delegator1);
        vault.requestWithdraw(delegationId);

        // canWithdraw should return false immediately after request
        assertFalse(vault.canWithdraw(delegationId), "should not be withdrawable yet");

        // Attempt to execute one second before the cooldown expires
        uint64 requestedAt = vault.getDelegation(delegationId).withdrawRequestedAt;
        uint64 eligibleAt  = requestedAt + Constants.DELEGATION_COOLDOWN;
        vm.warp(eligibleAt - 1);

        vm.prank(delegator1);
        vm.expectRevert(
            abi.encodeWithSelector(
                DelegationVault.CooldownNotElapsed.selector,
                delegationId,
                eligibleAt
            )
        );
        vault.executeWithdraw(delegationId);
    }

    /// @dev Also verifies that getAvailableFunds removes the pending delegation.
    function test_WithdrawCooldown_AvailableFundsExcludesPendingWithdrawal() public {
        _delegate(delegator1, AGENT_ID_1, ONE_ETHER);
        uint256 delegationId2 = _delegate(delegator2, AGENT_ID_1, TWO_ETHER);

        // delegator2 requests withdrawal → their stake should be excluded from availableFunds
        vm.prank(delegator2);
        vault.requestWithdraw(delegationId2);

        // Only delegator1's 1 ETH should be "available"
        assertEq(
            vault.getAvailableFunds(AGENT_ID_1),
            ONE_ETHER,
            "pending-withdrawal stake should be excluded"
        );
    }

    // ══════════════════════════════════════════════════════════════════
    //  TEST 6: Withdrawal after cooldown — success
    // ══════════════════════════════════════════════════════════════════

    function test_WithdrawalAfterCooldown_Success() public {
        uint256 amount = ONE_ETHER;
        uint256 delegationId = _delegate(delegator1, AGENT_ID_1, amount);

        vm.prank(delegator1);
        vault.requestWithdraw(delegationId);

        // Warp past cooldown
        vm.warp(block.timestamp + Constants.DELEGATION_COOLDOWN + 1);

        assertTrue(vault.canWithdraw(delegationId), "should be withdrawable after cooldown");

        uint256 balBefore = delegator1.balance;

        vm.expectEmit(true, true, true, true, address(vault));
        emit DelegationVault.WithdrawExecuted(delegationId, delegator1, AGENT_ID_1, amount);

        vm.prank(delegator1);
        vault.executeWithdraw(delegationId);

        // Delegator should receive their principal back
        assertEq(delegator1.balance - balBefore, amount, "principal not returned");

        // Delegation amount zeroed
        DelegationVault.Delegation memory d = vault.getDelegation(delegationId);
        assertEq(d.amount, 0, "amount should be zero after withdrawal");

        // AgentVault total reduced
        DelegationVault.AgentVault memory av = vault.getAgentVault(AGENT_ID_1);
        assertEq(av.totalDelegated, 0, "totalDelegated should be zero");

        // Vault contract balance also zero (all ETH returned)
        assertEq(address(vault).balance, 0, "vault should be empty");
    }

    // ══════════════════════════════════════════════════════════════════
    //  TEST 7: Cannot withdraw more than delegated (NothingToWithdraw)
    // ══════════════════════════════════════════════════════════════════

    function test_CannotWithdrawMoreThanDelegated_NothingToWithdraw() public {
        uint256 delegationId = _delegate(delegator1, AGENT_ID_1, ONE_ETHER);

        // Request and execute the first withdrawal (cooldown elapse)
        vm.prank(delegator1);
        vault.requestWithdraw(delegationId);
        vm.warp(block.timestamp + Constants.DELEGATION_COOLDOWN + 1);

        vm.prank(delegator1);
        vault.executeWithdraw(delegationId);

        // Attempt a second withdrawal of the same delegation — nothing left
        vm.prank(delegator1);
        vm.expectRevert(
            abi.encodeWithSelector(DelegationVault.NothingToWithdraw.selector, delegationId)
        );
        vault.executeWithdraw(delegationId);
    }

    /// @dev Also test that requesting withdrawal twice reverts.
    function test_CannotRequestWithdrawTwice() public {
        uint256 delegationId = _delegate(delegator1, AGENT_ID_1, ONE_ETHER);

        vm.prank(delegator1);
        vault.requestWithdraw(delegationId);

        vm.prank(delegator1);
        vm.expectRevert(
            abi.encodeWithSelector(
                DelegationVault.WithdrawAlreadyRequested.selector,
                delegationId
            )
        );
        vault.requestWithdraw(delegationId);
    }

    /// @dev A third party cannot request withdrawal for another delegator's position.
    function test_CannotWithdrawSomeoneElsesDelegation() public {
        uint256 delegationId = _delegate(delegator1, AGENT_ID_1, ONE_ETHER);

        vm.prank(delegator2);
        vm.expectRevert(
            abi.encodeWithSelector(
                DelegationVault.NotDelegator.selector,
                delegationId,
                delegator2
            )
        );
        vault.requestWithdraw(delegationId);
    }

    // ══════════════════════════════════════════════════════════════════
    //  TEST 8: Performance fee to agent
    // ══════════════════════════════════════════════════════════════════

    function test_PerformanceFee_AgentReceivesCorrectCut() public {
        // Agent sets a 20% performance fee (2000 bps)
        uint16 feeBps = 2_000;
        vm.prank(agentWallet1);
        vault.setPerformanceFee(AGENT_ID_1, feeBps);

        // Verify fee was stored
        DelegationVault.AgentVault memory avBefore = vault.getAgentVault(AGENT_ID_1);
        assertEq(avBefore.performanceFeeBps, feeBps, "performanceFeeBps not stored");

        // Delegate 1 ETH so there is at least one active delegation
        _delegate(delegator1, AGENT_ID_1, ONE_ETHER);

        uint256 profit = 10 ether;
        uint256 expectedAgentFee    = profit * feeBps / 10_000;   // 2 ETH
        uint256 expectedDelegatorShare = profit - expectedAgentFee; // 8 ETH

        uint256 agentBalBefore     = agentWallet1.balance;
        uint256 delegatorBalBefore = delegator1.balance;

        vm.expectEmit(true, false, false, true, address(vault));
        emit DelegationVault.ProfitsDistributed(
            AGENT_ID_1,
            profit,
            expectedAgentFee,
            expectedDelegatorShare,
            1
        );

        _distribute(AGENT_ID_1, profit);

        // Agent wallet received their performance fee
        assertEq(
            agentWallet1.balance - agentBalBefore,
            expectedAgentFee,
            "agent fee mismatch"
        );

        // Delegator received the remainder (sole delegator → full delegatorShare)
        assertEq(
            delegator1.balance - delegatorBalBefore,
            expectedDelegatorShare,
            "delegator share mismatch"
        );
    }

    /// @dev Performance fee above 50% (5000 bps) must revert.
    function test_PerformanceFee_TooHighReverts() public {
        uint16 tooHigh = 5_001;
        vm.prank(agentWallet1);
        vm.expectRevert(
            abi.encodeWithSelector(
                DelegationVault.FeeTooHigh.selector,
                tooHigh,
                DelegationVault(vault).MAX_PERFORMANCE_FEE_BPS()
            )
        );
        vault.setPerformanceFee(AGENT_ID_1, tooHigh);
    }

    /// @dev Only the agent's registered wallet may set the performance fee.
    function test_PerformanceFee_OnlyAgentOwner() public {
        vm.prank(delegator1);
        vm.expectRevert(
            abi.encodeWithSelector(
                DelegationVault.NotAgentOwner.selector,
                AGENT_ID_1,
                delegator1
            )
        );
        vault.setPerformanceFee(AGENT_ID_1, 500);
    }

    // ══════════════════════════════════════════════════════════════════
    //  TEST 9: Zero delegators edge case
    // ══════════════════════════════════════════════════════════════════

    function test_DistributeProfits_ZeroDelegators() public {
        // No delegations exist for AGENT_ID_1
        uint256 profit = ONE_ETHER;

        uint256 agentBalBefore   = agentWallet1.balance;
        uint256 vaultBalBefore   = address(vault).balance;

        // No performance fee → delegatorPool = full profit, but no active delegators
        // → entire profit remains in the vault contract (dust accumulation path)
        vm.expectEmit(true, false, false, false, address(vault));
        emit DelegationVault.ProfitsDistributed(AGENT_ID_1, profit, 0, profit, 0);

        _distribute(AGENT_ID_1, profit);

        // Agent wallet unchanged (no fee configured)
        assertEq(agentWallet1.balance, agentBalBefore, "agent balance should not change");

        // Profit remains in vault (no delegators to push to)
        assertEq(
            address(vault).balance - vaultBalBefore,
            profit,
            "unallocated profit should stay in vault"
        );

        // totalProfits still accumulates
        assertEq(vault.getAgentVault(AGENT_ID_1).totalProfits, profit);
    }

    /// @dev When all delegations are mid-cooldown, profits stay in vault.
    function test_DistributeProfits_AllDelegationsPendingWithdrawal() public {
        uint256 delegationId = _delegate(delegator1, AGENT_ID_1, ONE_ETHER);

        vm.prank(delegator1);
        vault.requestWithdraw(delegationId);

        uint256 profit = 0.5 ether;
        uint256 balBefore = delegator1.balance;

        _distribute(AGENT_ID_1, profit);

        // Delegator should NOT have received anything (excluded mid-cooldown)
        assertEq(delegator1.balance, balBefore, "mid-cooldown delegator must not receive profit");
    }

    // ══════════════════════════════════════════════════════════════════
    //  TEST 10: Access control — only BOUNTY_ROUND_ROLE
    // ══════════════════════════════════════════════════════════════════

    function test_AccessControl_OnlyBountyRoundRoleCanDistribute() public {
        address unauthorized = makeAddr("unauthorized");
        vm.deal(unauthorized, 1 ether);

        vm.prank(unauthorized);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                unauthorized,
                Constants.BOUNTY_ROUND_ROLE
            )
        );
        vault.distributeProfits{value: ONE_ETHER}(AGENT_ID_1);
    }

    /// @dev Verify zero-value profit call reverts.
    function test_AccessControl_ZeroProfitReverts() public {
        vm.prank(bountyRound);
        vm.expectRevert(DelegationVault.ZeroProfitAmount.selector);
        vault.distributeProfits{value: 0}(AGENT_ID_1);
    }

    /// @dev UPGRADER_ROLE is required to upgrade implementation.
    function test_AccessControl_OnlyUpgraderRoleCanUpgrade() public {
        // Deploy a new implementation (same contract, simulating a new version)
        DelegationVault newImpl = new DelegationVault();

        address unauthorized = makeAddr("notUpgrader");

        vm.prank(unauthorized);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                unauthorized,
                Constants.UPGRADER_ROLE
            )
        );
        vault.upgradeToAndCall(address(newImpl), "");
    }

    // ══════════════════════════════════════════════════════════════════
    //  TEST 11: Re-delegation — additional stake for an existing delegator
    // ══════════════════════════════════════════════════════════════════

    function test_Redelegation_AddMoreStake() public {
        // First delegation
        uint256 delegationId1 = _delegate(delegator1, AGENT_ID_1, ONE_ETHER);

        // Re-delegate (creates a new delegation entry for the same delegator)
        uint256 delegationId2 = _delegate(delegator1, AGENT_ID_1, TWO_ETHER);

        // Both delegation IDs should be distinct
        assertFalse(delegationId1 == delegationId2, "delegation IDs must differ");

        // AgentVault total = 1 + 2 = 3 ETH
        assertEq(vault.getAgentVault(AGENT_ID_1).totalDelegated, THREE_ETHER);

        // Delegator history should record both entries
        uint256[] memory history = vault.getDelegatorDelegations(delegator1);
        assertEq(history.length, 2, "expected two history entries");
        assertEq(history[0], delegationId1, "first history entry mismatch");
        assertEq(history[1], delegationId2, "second history entry mismatch");

        // getAvailableFunds reflects the combined stake
        assertEq(vault.getAvailableFunds(AGENT_ID_1), THREE_ETHER);

        // Each delegation has the correct individual amount
        assertEq(vault.getDelegation(delegationId1).amount, ONE_ETHER);
        assertEq(vault.getDelegation(delegationId2).amount, TWO_ETHER);
    }

    /// @dev Re-delegation and profit are split across all active positions.
    function test_Redelegation_ProfitSplitAcrossBothPositions() public {
        _delegate(delegator1, AGENT_ID_1, ONE_ETHER);
        _delegate(delegator1, AGENT_ID_1, TWO_ETHER);  // same delegator, 2nd position

        // Total active = 3 ETH; all belonging to delegator1 (two separate pushes)
        uint256 profit = 3 ether;
        uint256 balBefore = delegator1.balance;

        _distribute(AGENT_ID_1, profit);

        // delegator1 should receive all 3 ETH (1 ETH for first position, 2 ETH for second)
        assertEq(delegator1.balance - balBefore, profit, "full profit not returned to delegator");
    }

    // ══════════════════════════════════════════════════════════════════
    //  TEST 12: Multiple profit distributions — accumulation
    // ══════════════════════════════════════════════════════════════════

    function test_MultipleProfitDistributions_Accumulation() public {
        _delegate(delegator1, AGENT_ID_1, ONE_ETHER);
        _delegate(delegator2, AGENT_ID_1, TWO_ETHER);

        uint256 profit      = 3 ether;

        // ── Round 1 ──────────────────────────────────────────────────
        uint256 d1BalBefore = delegator1.balance;
        uint256 d2BalBefore = delegator2.balance;

        _distribute(AGENT_ID_1, profit);

        // delegator1 → 3 eth × 1/3 = 1 eth
        // delegator2 → 3 eth × 2/3 = 2 eth
        assertEq(delegator1.balance - d1BalBefore, ONE_ETHER,   "round1 delegator1 share");
        assertEq(delegator2.balance - d2BalBefore, TWO_ETHER,   "round1 delegator2 share");

        // totalProfits after round 1
        assertEq(vault.getAgentVault(AGENT_ID_1).totalProfits, profit, "totalProfits after round1");

        // ── Round 2 ──────────────────────────────────────────────────
        d1BalBefore = delegator1.balance;
        d2BalBefore = delegator2.balance;

        _distribute(AGENT_ID_1, profit);

        // Same proportions again
        assertEq(delegator1.balance - d1BalBefore, ONE_ETHER, "round2 delegator1 share");
        assertEq(delegator2.balance - d2BalBefore, TWO_ETHER, "round2 delegator2 share");

        // totalProfits accumulates correctly
        assertEq(
            vault.getAgentVault(AGENT_ID_1).totalProfits,
            profit * 2,
            "totalProfits should be sum of both rounds"
        );

        // ── Round 3 — mixed fee + delegators ─────────────────────────
        uint16 feeBps = 1_000; // 10 %
        vm.prank(agentWallet1);
        vault.setPerformanceFee(AGENT_ID_1, feeBps);

        uint256 round3Profit  = 9 ether;
        uint256 agentFee      = round3Profit * feeBps / 10_000;       // 0.9 ETH
        uint256 delPool       = round3Profit - agentFee;               // 8.1 ETH

        uint256 agentBalBefore = agentWallet1.balance;
        d1BalBefore = delegator1.balance;
        d2BalBefore = delegator2.balance;

        _distribute(AGENT_ID_1, round3Profit);

        assertEq(agentWallet1.balance - agentBalBefore, agentFee, "round3 agent fee");

        // delegator1 → delPool × 1/3 ; delegator2 → delPool × 2/3
        assertEq(delegator1.balance - d1BalBefore, delPool / 3, "round3 delegator1");
        assertEq(delegator2.balance - d2BalBefore, (delPool * 2) / 3, "round3 delegator2");

        // totalProfits = round1 + round2 + round3
        assertEq(
            vault.getAgentVault(AGENT_ID_1).totalProfits,
            profit * 2 + round3Profit,
            "totalProfits after round3"
        );
    }

    // ══════════════════════════════════════════════════════════════════
    //  ADDITIONAL EDGE CASES
    // ══════════════════════════════════════════════════════════════════

    /// @dev Direct ETH send (not via delegate()) must revert.
    function test_DirectEthSendReverts() public {
        vm.prank(delegator1);
        vm.expectRevert(bytes("DelegationVault: use delegate()"));
        (bool ok,) = address(vault).call{value: ONE_ETHER}("");
        // Suppress unused variable warning — revert caught above via expectRevert
        (ok);
    }

    /// @dev Delegation ID 0 is a null sentinel; getDelegation must revert.
    function test_GetDelegation_ZeroIdReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(DelegationVault.DelegationNotFound.selector, 0)
        );
        vault.getDelegation(0);
    }

    /// @dev nextDelegationId starts at 1 (0 is null sentinel).
    function test_NextDelegationIdStartsAtOne() public view {
        assertEq(vault.nextDelegationId(), 1, "nextDelegationId should start at 1");
    }

    /// @dev Execute withdraw without requesting first must revert.
    function test_ExecuteWithdraw_WithoutRequest() public {
        uint256 delegationId = _delegate(delegator1, AGENT_ID_1, ONE_ETHER);

        vm.prank(delegator1);
        vm.expectRevert(
            abi.encodeWithSelector(
                DelegationVault.WithdrawNotRequested.selector,
                delegationId
            )
        );
        vault.executeWithdraw(delegationId);
    }

    /// @dev After requestWithdraw, the delegation is excluded from getAvailableFunds.
    function test_GetAvailableFunds_ExcludesPendingWithdrawal() public {
        uint256 delegationId = _delegate(delegator1, AGENT_ID_1, ONE_ETHER);
        assertEq(vault.getAvailableFunds(AGENT_ID_1), ONE_ETHER, "before request");

        vm.prank(delegator1);
        vault.requestWithdraw(delegationId);

        assertEq(vault.getAvailableFunds(AGENT_ID_1), 0, "after request - should be excluded");
    }

    /// @dev canWithdraw returns false for a non-existent delegation.
    function test_CanWithdraw_NonExistentDelegationReturnsFalse() public view {
        assertFalse(vault.canWithdraw(999), "non-existent delegation should not be withdrawable");
    }

    /// @dev canWithdraw returns true exactly at the eligibility boundary.
    function test_CanWithdraw_TrueAtEligibleAt() public {
        uint256 delegationId = _delegate(delegator1, AGENT_ID_1, ONE_ETHER);

        vm.prank(delegator1);
        vault.requestWithdraw(delegationId);

        uint64 requestedAt = vault.getDelegation(delegationId).withdrawRequestedAt;
        uint64 eligibleAt  = requestedAt + Constants.DELEGATION_COOLDOWN;

        // One second before — not yet
        vm.warp(eligibleAt - 1);
        assertFalse(vault.canWithdraw(delegationId), "should not be ready 1s early");

        // Exactly at eligibleAt
        vm.warp(eligibleAt);
        assertTrue(vault.canWithdraw(delegationId), "should be ready at eligibleAt");
    }

    /// @dev Two agents can have independent vaults without interfering.
    function test_TwoAgentVaults_Independent() public {
        _delegate(delegator1, AGENT_ID_1, ONE_ETHER);
        _delegate(delegator2, AGENT_ID_2, TWO_ETHER);

        assertEq(vault.getAgentVault(AGENT_ID_1).totalDelegated, ONE_ETHER,  "agent1 vault");
        assertEq(vault.getAgentVault(AGENT_ID_2).totalDelegated, TWO_ETHER,  "agent2 vault");

        // Distribute to agent1 only
        uint256 profit = ONE_ETHER;
        _distribute(AGENT_ID_1, profit);

        // agent2's vault untouched
        assertEq(vault.getAgentVault(AGENT_ID_2).totalProfits, 0, "agent2 profits should be 0");

        // delegator2 received nothing
        // (their initial balance minus TWO_ETHER delegation = current balance)
        assertEq(delegator2.balance, 100 ether - TWO_ETHER, "delegator2 should have no profit");
    }

    /// @dev Profit distribution with performance fee and zero delegators
    ///      sends the fee to agent and the delegator pool stays in the contract.
    function test_DistributeProfits_FeeOnlyNoDelegators() public {
        uint16 feeBps = 3_000; // 30%
        vm.prank(agentWallet1);
        vault.setPerformanceFee(AGENT_ID_1, feeBps);

        uint256 profit = 10 ether;
        uint256 expectedAgentFee = profit * feeBps / 10_000; // 3 ETH

        uint256 agentBalBefore = agentWallet1.balance;
        uint256 vaultBalBefore = address(vault).balance;

        _distribute(AGENT_ID_1, profit);

        assertEq(agentWallet1.balance - agentBalBefore, expectedAgentFee, "agent fee");
        // Remaining 7 ETH stays in vault (no delegators)
        assertEq(address(vault).balance - vaultBalBefore, profit - expectedAgentFee, "remainder in vault");
    }

    // ══════════════════════════════════════════════════════════════════
    //  PULL-BASED CLAIMS TESTS
    // ══════════════════════════════════════════════════════════════════

    /// @dev receive() accepts ETH from BOUNTY_ROUND_ROLE holders and tracks pendingProfits.
    function test_ReceiveFromBountyRound() public {
        uint256 amount = 1 ether;
        vm.prank(bountyRound);
        (bool ok,) = address(vault).call{value: amount}("");
        assertTrue(ok, "receive should accept from bountyRound");
        assertEq(vault.pendingProfits(), amount, "pendingProfits should track received ETH");
    }

    /// @dev allocateProfits distributes pendingProfits to delegators proportionally.
    function test_AllocateProfits_Proportional() public {
        // Stakes: 1 : 2 (total = 3 ETH)
        _delegate(delegator1, AGENT_ID_1, ONE_ETHER);
        _delegate(delegator2, AGENT_ID_1, TWO_ETHER);

        // Send 3 ETH from bountyRound
        vm.prank(bountyRound);
        (bool ok,) = address(vault).call{value: THREE_ETHER}("");
        assertTrue(ok);

        // Allocate
        vault.allocateProfits(AGENT_ID_1);

        // Check claimable balances
        assertEq(vault.getClaimable(delegator1), ONE_ETHER,  "delegator1 claimable");
        assertEq(vault.getClaimable(delegator2), TWO_ETHER,  "delegator2 claimable");
        assertEq(vault.pendingProfits(), 0, "pendingProfits zeroed");
        assertEq(vault.totalClaimable(), THREE_ETHER, "totalClaimable");
    }

    /// @dev allocateProfits with performance fee: agent's share goes to agent wallet claimable.
    function test_AllocateProfits_WithPerformanceFee() public {
        uint16 feeBps = 2_000; // 20%
        vm.prank(agentWallet1);
        vault.setPerformanceFee(AGENT_ID_1, feeBps);

        _delegate(delegator1, AGENT_ID_1, ONE_ETHER);

        uint256 profit = 10 ether;
        vm.prank(bountyRound);
        (bool ok,) = address(vault).call{value: profit}("");
        assertTrue(ok);

        vault.allocateProfits(AGENT_ID_1);

        uint256 expectedAgentFee = 2 ether; // 20% of 10
        uint256 expectedDelegatorShare = 8 ether;

        assertEq(vault.getClaimable(agentWallet1), expectedAgentFee, "agent claimable");
        assertEq(vault.getClaimable(delegator1), expectedDelegatorShare, "delegator claimable");
    }

    /// @dev claim() withdraws claimable balance.
    function test_Claim_Success() public {
        _delegate(delegator1, AGENT_ID_1, ONE_ETHER);

        vm.prank(bountyRound);
        (bool ok,) = address(vault).call{value: ONE_ETHER}("");
        assertTrue(ok);

        vault.allocateProfits(AGENT_ID_1);

        uint256 balBefore = delegator1.balance;
        vault.claim(delegator1);

        assertEq(delegator1.balance - balBefore, ONE_ETHER, "claimed amount");
        assertEq(vault.getClaimable(delegator1), 0, "claimable zeroed");
        assertEq(vault.totalClaimable(), 0, "totalClaimable zeroed");
    }

    /// @dev claim() reverts when nothing to claim.
    function test_Claim_NothingToClaim() public {
        vm.expectRevert(DelegationVault.NothingToClaim.selector);
        vault.claim(delegator1);
    }

    /// @dev claimBatch processes multiple recipients.
    function test_ClaimBatch_Success() public {
        _delegate(delegator1, AGENT_ID_1, ONE_ETHER);
        _delegate(delegator2, AGENT_ID_1, TWO_ETHER);

        vm.prank(bountyRound);
        (bool ok,) = address(vault).call{value: THREE_ETHER}("");
        assertTrue(ok);

        vault.allocateProfits(AGENT_ID_1);

        uint256 bal1Before = delegator1.balance;
        uint256 bal2Before = delegator2.balance;

        address[] memory recipients = new address[](2);
        recipients[0] = delegator1;
        recipients[1] = delegator2;
        vault.claimBatch(recipients);

        assertEq(delegator1.balance - bal1Before, ONE_ETHER, "batch delegator1");
        assertEq(delegator2.balance - bal2Before, TWO_ETHER, "batch delegator2");
        assertEq(vault.totalClaimable(), 0, "totalClaimable zeroed");
    }

    /// @dev claim() reverts after 90-day expiry.
    function test_Claim_ExpiredReverts() public {
        _delegate(delegator1, AGENT_ID_1, ONE_ETHER);

        vm.prank(bountyRound);
        (bool ok,) = address(vault).call{value: ONE_ETHER}("");
        assertTrue(ok);

        vault.allocateProfits(AGENT_ID_1);

        // Warp past 90 days
        vm.warp(block.timestamp + 90 days + 1);

        vm.expectRevert(DelegationVault.ClaimsExpired.selector);
        vault.claim(delegator1);
    }

    /// @dev sweepExpiredClaims sends unclaimed funds to treasury after 90 days.
    function test_SweepExpiredClaims() public {
        // Set treasury to a payable address (test contract can't receive ETH)
        address payable treasuryAddr = payable(makeAddr("treasury"));
        vault.setTreasury(treasuryAddr);

        _delegate(delegator1, AGENT_ID_1, ONE_ETHER);

        vm.prank(bountyRound);
        (bool ok,) = address(vault).call{value: ONE_ETHER}("");
        assertTrue(ok);

        vault.allocateProfits(AGENT_ID_1);

        uint256 treasuryBalBefore = treasuryAddr.balance;

        // Before expiry — should revert
        vm.expectRevert(DelegationVault.ClaimsNotExpired.selector);
        vault.sweepExpiredClaims();

        // Warp past 90 days
        vm.warp(block.timestamp + 90 days + 1);

        vault.sweepExpiredClaims();

        assertEq(treasuryAddr.balance - treasuryBalBefore, ONE_ETHER, "treasury received swept funds");
        assertEq(vault.totalClaimable(), 0, "totalClaimable zeroed after sweep");
    }

    /// @dev allocateProfits reverts when no pending profits.
    function test_AllocateProfits_ZeroPendingReverts() public {
        vm.expectRevert(DelegationVault.ZeroProfitAmount.selector);
        vault.allocateProfits(AGENT_ID_1);
    }

    /// @dev setTreasury updates the treasury address.
    function test_SetTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        vault.setTreasury(newTreasury);
        assertEq(vault.treasury(), newTreasury, "treasury updated");
    }

    /// @dev setTreasury rejects zero address.
    function test_SetTreasury_ZeroAddressReverts() public {
        vm.expectRevert(DelegationVault.ZeroAddress.selector);
        vault.setTreasury(address(0));
    }

    /// @dev Multiple allocateProfits accumulate claimable balances.
    function test_AllocateProfits_AccumulatesClaimable() public {
        _delegate(delegator1, AGENT_ID_1, ONE_ETHER);

        // First allocation
        vm.prank(bountyRound);
        (bool ok,) = address(vault).call{value: ONE_ETHER}("");
        assertTrue(ok);
        vault.allocateProfits(AGENT_ID_1);

        // Second allocation
        vm.prank(bountyRound);
        (ok,) = address(vault).call{value: TWO_ETHER}("");
        assertTrue(ok);
        vault.allocateProfits(AGENT_ID_1);

        assertEq(vault.getClaimable(delegator1), THREE_ETHER, "accumulated claimable");
    }
}
