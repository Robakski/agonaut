// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {BountyMarketplace} from "../src/BountyMarketplace.sol";
import {Constants} from "../src/Constants.sol";

// ═══════════════════════════════════════════════════════════════
//  MOCKS
// ═══════════════════════════════════════════════════════════════

/**
 * @notice Minimal mock BountyRound that accepts depositBounty() calls.
 *         Tracks deposited ETH for assertion purposes.
 */
contract MockBountyRound {
    uint256 public deposited;

    function depositBounty() external payable {
        deposited += msg.value;
    }

    receive() external payable {}
}

/**
 * @notice Mock BountyFactory that implements createBounty() + spawnRound().
 *         Deploys a fresh MockBountyRound on every spawnRound call.
 *         No access control — all callers succeed.
 */
contract MockBountyFactory {
    // ABI-compatible with IBountyFactory.BountyConfig
    struct BountyConfig {
        bytes32  problemCid;
        uint256  entryFee;
        uint32   commitDuration;
        uint16[] prizeDistribution;
        uint8    maxAgents;
        uint8    tier;
        uint16   acceptanceThreshold;
        bool     graduatedPayouts;
        bool     active;
        uint64   createdAt;
        address  creator;
    }

    uint256 public nextBountyId = 1;
    address public lastRound;

    function createBounty(BountyConfig calldata) external returns (uint256 bountyId) {
        bountyId = nextBountyId++;
    }

    function spawnRound(uint256) external returns (address roundAddr) {
        MockBountyRound r = new MockBountyRound();
        lastRound = address(r);
        return address(r);
    }
}

// ═══════════════════════════════════════════════════════════════
//  BOUNTY MARKETPLACE TESTS (crowdfunded model)
// ═══════════════════════════════════════════════════════════════

contract MarketplaceTest is Test {
    BountyMarketplace public marketplace;
    MockBountyFactory  public factory;

    address admin        = address(this);
    address operator     = makeAddr("operator");
    address treasury;
    address proposer     = makeAddr("proposer");
    address contributor1 = makeAddr("contributor1");
    address contributor2 = makeAddr("contributor2");
    address contributor3 = makeAddr("contributor3");

    bytes32 constant PROBLEM_CID = keccak256("test-problem");
    uint32  constant COMMIT_DUR  = 2 hours;

    // ── Setup ─────────────────────────────────────────────────────────────────

    function setUp() public {
        treasury = makeAddr("treasury");
        vm.deal(treasury, 0);

        factory = new MockBountyFactory();

        BountyMarketplace impl = new BountyMarketplace();
        bytes memory init = abi.encodeCall(
            BountyMarketplace.initialize,
            (admin, operator, address(factory), treasury)
        );
        marketplace = BountyMarketplace(
            address(new ERC1967Proxy(address(impl), init))
        );

        vm.deal(proposer,      10 ether);
        vm.deal(contributor1,  10 ether);
        vm.deal(contributor2,  10 ether);
        vm.deal(contributor3,  10 ether);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _prizeDist() internal pure returns (uint16[] memory d) {
        d = new uint16[](3);
        d[0] = 5000;
        d[1] = 3000;
        d[2] = 2000;
    }

    /**
     * @dev Propose a bounty with default competition parameters.
     *      `fundingGoal` and `fundingCap` are customisable; deadline = now + 2 days.
     */
    function _propose(
        uint256 fundingGoal,
        uint256 fundingCap
    )
        internal
        returns (uint256 proposalId)
    {
        vm.prank(proposer);
        proposalId = marketplace.proposeBounty{value: Constants.PROPOSAL_DEPOSIT}(
            PROBLEM_CID,
            COMMIT_DUR,
            _prizeDist(),
            0,     // maxAgents — unlimited
            0,     // requiredTier — Bronze
            5000,  // acceptanceThreshold
            false, // graduatedPayouts
            uint64(block.timestamp + 2 days),
            fundingGoal,
            fundingCap,
            0,     // maxContributors — unlimited
            Constants.MIN_BOUNTY_DEPOSIT  // minContribution
        );
    }

    // ── Test 1: Propose → contribute → activate → verify round created ────────

    function test_ProposeContributeActivate() public {
        uint256 id = _propose(0.25 ether, 0);

        // Contribute enough to meet the funding goal
        vm.prank(contributor1);
        marketplace.contribute{value: 0.25 ether}(id);

        // Verify contribution is tracked
        assertEq(marketplace.getContribution(id, contributor1), 0.25 ether);

        // Warp past the funding deadline
        BountyMarketplace.BountyProposal memory snap = marketplace.getProposal(id);
        vm.warp(uint256(snap.fundingDeadline) + 1);

        uint256 treasuryBefore = treasury.balance;
        uint256 proposerBefore = proposer.balance;

        // Anyone can activate
        marketplace.activateBounty(id);

        // Status must be ACTIVE
        BountyMarketplace.BountyProposal memory p = marketplace.getProposal(id);
        assertEq(uint8(p.status), uint8(BountyMarketplace.ProposalStatus.ACTIVE));
        assertTrue(p.roundAddr != address(0), "roundAddr should be set");

        // Protocol fee: 2% of 0.25 ether = 0.005 ether
        uint256 expectedFee   = 0.005 ether;
        uint256 expectedPrize = 0.245 ether;

        assertEq(treasury.balance, treasuryBefore + expectedFee, "treasury fee mismatch");
        assertEq(proposer.balance, proposerBefore + 0.01 ether,  "deposit not refunded");

        // Prize pool deposited into the round
        MockBountyRound round = MockBountyRound(payable(p.roundAddr));
        assertEq(round.deposited(), expectedPrize, "prize pool mismatch");
    }

    // ── Test 2: Propose → deadline passes → goal not met → refund ─────────────

    function test_DeadlineExpiredGoalNotMet() public {
        uint256 id = _propose(1 ether, 0);  // goal is 1 ETH

        // Contribute less than the goal
        vm.prank(contributor1);
        marketplace.contribute{value: 0.125 ether}(id);

        // Warp past deadline
        BountyMarketplace.BountyProposal memory snap = marketplace.getProposal(id);
        vm.warp(uint256(snap.fundingDeadline) + 1);

        uint256 balBefore = contributor1.balance;

        // Claim refund — should lazily mark EXPIRED
        vm.prank(contributor1);
        marketplace.claimRefund(id);

        // Full contribution returned
        assertEq(contributor1.balance - balBefore, 0.125 ether, "refund amount mismatch");

        // Status must now be EXPIRED
        BountyMarketplace.BountyProposal memory p = marketplace.getProposal(id);
        assertEq(uint8(p.status), uint8(BountyMarketplace.ProposalStatus.EXPIRED));

        // Proposer deposit should have gone to treasury
        assertEq(treasury.balance, Constants.PROPOSAL_DEPOSIT, "treasury should have proposer deposit");
    }

    // ── Test 3: Propose → funding cap reached → auto-activate ─────────────────

    function test_FundingCapAutoActivate() public {
        // cap = 0.5 ETH, goal = 0.25 ETH — two contributors of 0.25 each
        uint256 id = _propose(0.25 ether, 0.5 ether);

        vm.prank(contributor1);
        marketplace.contribute{value: 0.25 ether}(id);

        // Status still FUNDING after first contribution (cap not yet hit)
        {
            BountyMarketplace.BountyProposal memory mid = marketplace.getProposal(id);
            assertEq(uint8(mid.status), uint8(BountyMarketplace.ProposalStatus.FUNDING));
        }

        // Second contribution hits the cap → auto-activate triggers
        vm.prank(contributor2);
        marketplace.contribute{value: 0.25 ether}(id);

        BountyMarketplace.BountyProposal memory p = marketplace.getProposal(id);
        assertEq(uint8(p.status), uint8(BountyMarketplace.ProposalStatus.ACTIVE));
        assertTrue(p.roundAddr != address(0), "roundAddr should be set after auto-activate");

        // Prize pool: 0.5 ETH − 2% fee = 0.49 ETH
        uint256 expectedPrize = 0.49 ether;

        MockBountyRound round = MockBountyRound(payable(p.roundAddr));
        assertEq(round.deposited(), expectedPrize, "auto-activate prize pool mismatch");
    }

    // ── Test 4: Multiple contributors → all tracked correctly ─────────────────

    function test_MultipleContributors() public {
        uint256 id = _propose(0.375 ether, 0);

        vm.prank(contributor1);
        marketplace.contribute{value: 0.125 ether}(id);

        vm.prank(contributor2);
        marketplace.contribute{value: 0.125 ether}(id);

        vm.prank(contributor3);
        marketplace.contribute{value: 0.125 ether}(id);

        // Individual contribution amounts
        assertEq(marketplace.getContribution(id, contributor1), 0.125 ether);
        assertEq(marketplace.getContribution(id, contributor2), 0.125 ether);
        assertEq(marketplace.getContribution(id, contributor3), 0.125 ether);

        // isContributor flags
        assertTrue(marketplace.isContributor(id, contributor1));
        assertTrue(marketplace.isContributor(id, contributor2));
        assertTrue(marketplace.isContributor(id, contributor3));
        assertFalse(marketplace.isContributor(id, proposer), "proposer should not be a contributor");

        // Contributor address list
        address[] memory list = marketplace.getContributors(id);
        assertEq(list.length, 3);
        assertEq(list[0], contributor1);
        assertEq(list[1], contributor2);
        assertEq(list[2], contributor3);

        // Aggregate counters
        BountyMarketplace.BountyProposal memory p = marketplace.getProposal(id);
        assertEq(p.contributorCount, 3,          "contributorCount mismatch");
        assertEq(p.totalFunded,      0.375 ether, "totalFunded mismatch");
    }

    // ── Test 5: Cannot contribute after deadline ──────────────────────────────

    function test_CannotContributeAfterDeadline() public {
        uint256 id = _propose(0.25 ether, 0);

        BountyMarketplace.BountyProposal memory snap = marketplace.getProposal(id);
        uint64 deadline = snap.fundingDeadline;

        // Warp to one second after the deadline
        vm.warp(uint256(deadline) + 1);

        vm.prank(contributor1);
        vm.expectRevert(
            abi.encodeWithSelector(
                BountyMarketplace.FundingDeadlinePassed.selector,
                id,
                deadline
            )
        );
        marketplace.contribute{value: 0.125 ether}(id);
    }

    // ── Test 6: Cannot contribute above funding cap ───────────────────────────

    function test_CannotContributeAboveFundingCap() public {
        // cap = 0.25 ether, so a single 0.5 ether contribution should revert
        uint256 id = _propose(0.25 ether, 0.25 ether);

        vm.prank(contributor1);
        vm.expectRevert(
            abi.encodeWithSelector(
                BountyMarketplace.FundingCapExceeded.selector,
                id,
                uint256(0.25 ether)
            )
        );
        marketplace.contribute{value: 0.5 ether}(id);
    }

    // ── Test 7: Cannot claim refund before deadline (funds locked) ────────────

    function test_CannotRefundBeforeDeadline() public {
        uint256 id = _propose(0.25 ether, 0);

        // Contribute — deadline has NOT yet passed
        vm.prank(contributor1);
        marketplace.contribute{value: 0.125 ether}(id);

        // claimRefund must revert: status is FUNDING and deadline not passed
        vm.prank(contributor1);
        vm.expectRevert(
            abi.encodeWithSelector(
                BountyMarketplace.WrongStatus.selector,
                id,
                BountyMarketplace.ProposalStatus.FUNDING
            )
        );
        marketplace.claimRefund(id);
    }

    // ── Test 8: Proposer cancel with 0 contributors ───────────────────────────

    function test_ProposerCancelNoContributors() public {
        uint256 id = _propose(0.25 ether, 0);

        uint256 proposerBefore = proposer.balance;

        vm.prank(proposer);
        marketplace.cancelProposal(id);

        // Status must be CANCELLED
        BountyMarketplace.BountyProposal memory p = marketplace.getProposal(id);
        assertEq(uint8(p.status), uint8(BountyMarketplace.ProposalStatus.CANCELLED));

        // Proposer receives back the anti-spam deposit
        assertEq(
            proposer.balance - proposerBefore,
            Constants.PROPOSAL_DEPOSIT,
            "deposit should be refunded on cancel"
        );
    }

    // ── Additional: Non-proposer cannot cancel ────────────────────────────────

    function test_OnlyProposerCanCancel() public {
        uint256 id = _propose(0.25 ether, 0);

        vm.prank(contributor1);
        vm.expectRevert(
            abi.encodeWithSelector(
                BountyMarketplace.NotProposer.selector,
                id,
                contributor1
            )
        );
        marketplace.cancelProposal(id);
    }

    // ── Additional: Cannot cancel after a contributor joins ──────────────────

    function test_CannotCancelWithContributors() public {
        uint256 id = _propose(0.25 ether, 0);

        vm.prank(contributor1);
        marketplace.contribute{value: 0.125 ether}(id);

        vm.prank(proposer);
        vm.expectRevert(
            abi.encodeWithSelector(
                BountyMarketplace.HasContributors.selector,
                id
            )
        );
        marketplace.cancelProposal(id);
    }

    // ── Additional: Cannot contribute twice (same address) ────────────────────

    function test_CannotContributeTwice() public {
        uint256 id = _propose(0.5 ether, 0);

        vm.prank(contributor1);
        marketplace.contribute{value: 0.125 ether}(id);

        vm.prank(contributor1);
        vm.expectRevert(
            abi.encodeWithSelector(
                BountyMarketplace.AlreadyContributed.selector,
                id,
                contributor1
            )
        );
        marketplace.contribute{value: 0.125 ether}(id);
    }

    // ── Additional: Cannot activate before deadline ───────────────────────────

    function test_CannotActivateBeforeDeadline() public {
        uint256 id = _propose(0.25 ether, 0);

        vm.prank(contributor1);
        marketplace.contribute{value: 0.25 ether}(id);

        BountyMarketplace.BountyProposal memory snap = marketplace.getProposal(id);

        vm.expectRevert(
            abi.encodeWithSelector(
                BountyMarketplace.FundingStillOpen.selector,
                id,
                snap.fundingDeadline
            )
        );
        marketplace.activateBounty(id);
    }

    // ── Additional: Cannot activate when goal not met ─────────────────────────

    function test_CannotActivateGoalNotMet() public {
        uint256 id = _propose(1 ether, 0);

        vm.prank(contributor1);
        marketplace.contribute{value: 0.125 ether}(id);

        BountyMarketplace.BountyProposal memory snap = marketplace.getProposal(id);
        vm.warp(uint256(snap.fundingDeadline) + 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                BountyMarketplace.FundingGoalNotMet.selector,
                id,
                uint256(0.125 ether),
                uint256(1 ether)
            )
        );
        marketplace.activateBounty(id);
    }

    // ── Additional: Incorrect deposit amount reverts ──────────────────────────

    function test_IncorrectDepositReverts() public {
        vm.prank(proposer);
        vm.expectRevert(
            abi.encodeWithSelector(
                BountyMarketplace.IncorrectDeposit.selector,
                uint256(0.005 ether),
                Constants.PROPOSAL_DEPOSIT
            )
        );
        marketplace.proposeBounty{value: 0.005 ether}(
            PROBLEM_CID,
            COMMIT_DUR,
            _prizeDist(),
            0, 0, 5000, false,
            uint64(block.timestamp + 2 days),
            0.25 ether, 0, 0,
            Constants.MIN_BOUNTY_DEPOSIT
        );
    }

    // ── Additional: Multiple refunds all succeed (independent callers) ─────────

    function test_MultipleRefunds() public {
        uint256 id = _propose(1 ether, 0); // goal that won't be met

        vm.prank(contributor1);
        marketplace.contribute{value: 0.125 ether}(id);

        vm.prank(contributor2);
        marketplace.contribute{value: 0.125 ether}(id);

        BountyMarketplace.BountyProposal memory snap = marketplace.getProposal(id);
        vm.warp(uint256(snap.fundingDeadline) + 1);

        // contributor1 refunds first — lazily marks EXPIRED
        uint256 bal1Before = contributor1.balance;
        vm.prank(contributor1);
        marketplace.claimRefund(id);
        assertEq(contributor1.balance - bal1Before, 0.125 ether);

        // contributor2 refunds second — proposal already EXPIRED
        uint256 bal2Before = contributor2.balance;
        vm.prank(contributor2);
        marketplace.claimRefund(id);
        assertEq(contributor2.balance - bal2Before, 0.125 ether);
    }

    // Required so that this test contract can receive ETH (proposer deposit refunds etc.)
    receive() external payable {}
}
