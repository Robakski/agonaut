// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/*
 * ██████╗  ██████╗ ██╗   ██╗███╗   ██╗████████╗██╗   ██╗
 * ██╔══██╗██╔═══██╗██║   ██║████╗  ██║╚══██╔══╝╚██╗ ██╔╝
 * ██████╔╝██║   ██║██║   ██║██╔██╗ ██║   ██║    ╚████╔╝
 * ██╔══██╗██║   ██║██║   ██║██║╚██╗██║   ██║     ╚██╔╝
 * ██████╔╝╚██████╔╝╚██████╔╝██║ ╚████║   ██║      ██║
 * ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝   ╚═╝      ╚═╝
 *
 * ███╗   ███╗ █████╗ ██████╗ ██╗  ██╗███████╗████████╗██████╗ ██╗      █████╗  ██████╗███████╗
 * ████╗ ████║██╔══██╗██╔══██╗██║ ██╔╝██╔════╝╚══██╔══╝██╔══██╗██║     ██╔══██╗██╔════╝██╔════╝
 * ██╔████╔██║███████║██████╔╝█████╔╝ █████╗     ██║   ██████╔╝██║     ███████║██║     █████╗
 * ██║╚██╔╝██║██╔══██║██╔══██╗██╔═██╗ ██╔══╝     ██║   ██╔═══╝ ██║     ██╔══██║██║     ██╔══╝
 * ██║ ╚═╝ ██║██║  ██║██║  ██║██║  ██╗███████╗   ██║   ██║     ███████╗██║  ██║╚██████╗███████╗
 * ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝ ╚═════╝╚══════╝
 */

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import {Constants} from "./Constants.sol";

// ═══════════════════════════════════════════════════════════════════════════════
//  EXTERNAL INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @title IBountyFactory
 * @notice Minimal interface used by BountyMarketplace to create and spawn bounties.
 *
 * @dev `BountyConfig` must remain ABI-compatible with `BountyFactory.BountyConfig`.
 *      Fields `active`, `createdAt`, and `creator` are overwritten by BountyFactory
 *      on creation — pass zero / false values.
 *
 *      BountyMarketplace must hold `Constants.BOUNTY_CREATOR_ROLE` on BountyFactory
 *      for `createBounty` and `spawnRound` to succeed.
 */
interface IBountyFactory {
    /// @dev Mirror of BountyFactory.BountyConfig. Must stay in sync.
    struct BountyConfig {
        bytes32  problemCid;
        uint256  entryFee;
        uint32   commitDuration;
        uint16[] prizeDistribution;
        uint8    maxAgents;
        uint8    tier;
        uint16   acceptanceThreshold;
        bool     graduatedPayouts;
        bool     active;    // overwritten by BountyFactory — pass false
        bool     isPrivate; // false for crowdfunded bounties (v1)
        uint64   createdAt; // overwritten by BountyFactory — pass 0
        address  creator;   // overwritten by BountyFactory — pass address(0)
    }

    /**
     * @notice Register a new bounty configuration in BountyFactory.
     * @param config Full bounty configuration.
     * @return bountyId The newly assigned bounty ID (≥ 1).
     */
    function createBounty(BountyConfig calldata config) external returns (uint256 bountyId);

    /**
     * @notice Deploy a new BountyRound clone for the given bounty.
     * @param bountyId The parent bounty ID.
     * @return roundAddr The address of the freshly deployed BountyRound clone.
     */
    function spawnRound(uint256 bountyId) external returns (address roundAddr);
}

/**
 * @title IBountyRound
 * @notice Minimal interface for funding a freshly spawned BountyRound.
 */
interface IBountyRound {
    /**
     * @notice Deposit the bounty prize into the round's escrow.
     *         Transitions the round from OPEN → FUNDED.
     *         Only callable by the round's sponsor (BountyMarketplace).
     */
    function depositBounty() external payable;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BOUNTY MARKETPLACE  (crowdfunded model)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @title BountyMarketplace
 * @author Agonaut
 * @notice Permissionless crowdfunded bounty pipeline for the Agonaut protocol.
 *
 * @dev Architecture overview
 *      ┌──────────────────────────────────────────────────────────────────────────┐
 *      │  BountyMarketplace  (UUPS upgradeable, AccessControl, ReentrancyGuard)   │
 *      │                                                                          │
 *      │  proposeBounty()    ──stores──►  proposals[id]  (BountyProposal)         │
 *      │  contribute()       ──records──► contributions[id][addr]                 │
 *      │  activateBounty()   ──calls──►  IBountyFactory.createBounty()            │
 *      │                     ──calls──►  IBountyFactory.spawnRound()              │
 *      │                     ──funds──►  IBountyRound.depositBounty()             │
 *      │  claimRefund()      ──returns ETH to contributors on expiry              │
 *      │  cancelProposal()   ──returns deposit to proposer (0 contributors only)  │
 *      └──────────────────────────────────────────────────────────────────────────┘
 *
 *      Lifecycle
 *      ─────────────────────────────────────────────────────────────────────────────
 *       FUNDING  → contributions accepted, deadline not yet passed
 *       ACTIVE   → BountyRound created and funded; competition running
 *       SETTLED  → Round settled; solution access available to all contributors
 *       EXPIRED  → Deadline passed, funding goal not met; refunds available
 *       CANCELLED→ Proposer cancelled before any contributors joined
 *      ─────────────────────────────────────────────────────────────────────────────
 *
 *      Economics (per proposal)
 *      • Proposer pays Constants.PROPOSAL_DEPOSIT (0.01 ETH) as anti-spam.
 *        Refunded on activation; forfeited to treasury on expiry.
 *      • 2% protocol fee deducted from totalFunded on activation → treasury.
 *      • Remaining 98% deposited into BountyRound as prize pool.
 *      • BountyMarketplace becomes the "sponsor" of the BountyRound.
 *      • All contributors get private solution access after settlement (off-chain).
 *
 *      Role matrix
 *      ─────────────────────────────────────────────────────────────────────────────
 *       DEFAULT_ADMIN_ROLE  │ Protocol multisig — grants / revokes all roles
 *       OPERATOR_ROLE       │ Set contract addresses
 *       UPGRADER_ROLE       │ Authorise UUPS implementation upgrades
 *      ─────────────────────────────────────────────────────────────────────────────
 *
 *      ⚠ Deployment note
 *         Grant `Constants.BOUNTY_CREATOR_ROLE` to this contract on BountyFactory so
 *         that {activateBounty} can call `createBounty` and `spawnRound`.
 *
 *      Invariants enforced (see INVARIANTS.md §7)
 *       INV-7.2  minContribution >= Constants.MIN_BOUNTY_DEPOSIT (0.125 ETH)
 *       INV-7.3  fundingDeadline 1–10 days, fundingGoal >= MIN_BOUNTY_DEPOSIT,
 *                fundingCap >= fundingGoal (if set)
 *       INV-7.4  2% protocol fee deducted on activation
 *       INV-7.6  MIN_FUNDING_DURATION = 1 day, MAX_FUNDING_DURATION = 10 days
 */
contract BountyMarketplace is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    // ─────────────────────────────────────────────────────────────────────────
    //  TYPES
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Lifecycle states a crowdfunded bounty proposal passes through.
    enum ProposalStatus {
        FUNDING,   // Accepting contributions; deadline not yet passed
        ACTIVE,    // BountyRound created and funded; competition running
        SETTLED,   // Round settled; solution access available to all contributors
        EXPIRED,   // Deadline passed, funding goal not met; refunds available
        CANCELLED  // Proposer cancelled before any contributor joined
    }

    /**
     * @notice Full on-chain record for a crowdfunded bounty proposal.
     *
     * Competition parameters
     * @param proposer             Address that submitted the proposal.
     * @param problemCid           IPFS CID (bytes32) of the problem dataset.
     * @param commitDuration       Length of the agent commit phase (seconds).
     * @param prizeDistribution    Basis-point prize shares for 1st, 2nd, … (must sum to 10 000).
     * @param maxAgents            Maximum agent slots; 0 = unlimited.
     * @param requiredTier         Minimum agent tier required (0 = Bronze … 4 = Prometheus).
     * @param acceptanceThreshold  Min score (0–10 000 BPS) for full payout.
     * @param graduatedPayouts     Whether partial payouts below threshold are enabled.
     *
     * Funding parameters (proposer-configurable)
     * @param fundingDeadline    Unix timestamp by which the goal must be met.
     *                           Must be 1–10 days from proposal creation.
     * @param fundingGoal        Minimum ETH required to activate the bounty (>= 0.125 ETH).
     * @param fundingCap         Maximum ETH accepted; 0 = unlimited. If set, must be >= fundingGoal.
     *                           Reaching the cap triggers immediate activation.
     * @param maxContributors    Maximum number of funders; 0 = unlimited.
     * @param minContribution    Minimum ETH per contributor (>= 0.125 ETH).
     *
     * State (written by the contract)
     * @param status            Current lifecycle state.
     * @param totalFunded       Running total of contributions received (wei).
     * @param contributorCount  Number of distinct contributors so far.
     * @param createdAt         Block timestamp at creation.
     * @param roundAddr         Address of the BountyRound once activated (address(0) before).
     */
    struct BountyProposal {
        // ── Competition parameters ──────────────────────────────────────────
        address  proposer;
        bytes32  problemCid;
        uint32   commitDuration;
        uint16[] prizeDistribution;
        uint8    maxAgents;
        uint8    requiredTier;
        uint16   acceptanceThreshold;
        bool     graduatedPayouts;
        // ── Funding parameters ──────────────────────────────────────────────
        uint64   fundingDeadline;
        uint256  fundingGoal;
        uint256  fundingCap;
        uint16   maxContributors;
        uint256  minContribution;
        // ── State ───────────────────────────────────────────────────────────
        ProposalStatus status;
        uint256  totalFunded;
        uint16   contributorCount;
        uint64   createdAt;
        address  roundAddr;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Address of the BountyFactory contract.
    /// @dev BountyMarketplace must hold BOUNTY_CREATOR_ROLE on this contract.
    address public bountyFactory;

    /// @notice Address of the protocol Treasury.
    /// @dev Receives protocol fees on activation and forfeited proposal deposits on expiry.
    address public treasury;

    /// @notice Auto-incrementing counter; the next proposal will receive this ID.
    ///         Starts at 1 — ID 0 is reserved as a null sentinel.
    uint256 public nextProposalId;

    /// @notice Mapping from proposal ID to full proposal data.
    mapping(uint256 => BountyProposal) public proposals;

    /// @notice ETH contributed per (proposal, contributor) pair.
    /// @dev    Zeroed out when a refund is claimed (so isContributor also becomes false).
    mapping(uint256 => mapping(address => uint256)) public contributions;

    /// @notice Ordered list of contributor addresses per proposal.
    /// @dev    Used for solution-access queries and iterative refund processing.
    mapping(uint256 => address[]) public contributors;

    // ─────────────────────────────────────────────────────────────────────────
    //  CUSTOM ERRORS
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Thrown when querying or acting on a proposal ID that does not exist.
    error ProposalNotFound(uint256 proposalId);

    /// @notice Thrown when `msg.value` is not exactly Constants.PROPOSAL_DEPOSIT.
    error IncorrectDeposit(uint256 provided, uint256 required);

    /// @notice Thrown when fundingDeadline is outside the allowed 1–10 day window.
    error InvalidFundingDeadline(uint64 provided);

    /// @notice Thrown when fundingGoal < Constants.MIN_BOUNTY_DEPOSIT.
    error InvalidFundingGoal(uint256 provided);

    /// @notice Thrown when minContribution < Constants.MIN_BOUNTY_DEPOSIT.
    error InvalidMinContribution(uint256 provided);

    /// @notice Thrown when prizeDistribution does not sum to BPS_DENOMINATOR.
    error InvalidPrizeDistribution(uint256 actual);

    /// @notice Thrown when commitDuration is outside [MIN_COMMIT_DURATION, MAX_COMMIT_DURATION].
    error InvalidCommitDuration(uint32 provided);

    /// @notice Thrown when acceptanceThreshold is outside the allowed range.
    error InvalidAcceptanceThreshold(uint16 provided);

    /// @notice Thrown when fundingCap > 0 but fundingCap < fundingGoal.
    error InvalidFundingCap(uint256 fundingCap, uint256 fundingGoal);

    /// @notice Thrown when a state-changing call is invalid for the current proposal status.
    error WrongStatus(uint256 proposalId, ProposalStatus current);

    /// @notice Thrown when trying to contribute after the funding deadline.
    error FundingDeadlinePassed(uint256 proposalId, uint64 deadline);

    /// @notice Thrown when trying to activate a proposal whose deadline has not yet passed.
    error FundingStillOpen(uint256 proposalId, uint64 deadline);

    /// @notice Thrown when trying to activate but the funding goal has not been met.
    error FundingGoalNotMet(uint256 proposalId, uint256 funded, uint256 goal);

    /// @notice Thrown when a contribution would exceed the funding cap.
    error FundingCapExceeded(uint256 proposalId, uint256 fundingCap);

    /// @notice Thrown when maxContributors is set and already reached.
    error MaxContributorsReached(uint256 proposalId);

    /// @notice Thrown when `msg.value` is below the proposal's minContribution.
    error BelowMinContribution(uint256 proposalId, uint256 provided, uint256 minimum);

    /// @notice Thrown when an address tries to contribute to a proposal twice.
    error AlreadyContributed(uint256 proposalId, address contributor);

    /// @notice Thrown when a proposer-only action is called by a non-proposer.
    error NotProposer(uint256 proposalId, address caller);

    /// @notice Thrown when cancelProposal is called but contributors already exist.
    error HasContributors(uint256 proposalId);

    /// @notice Thrown when claimRefund is called by an address with no contribution.
    error NoContributionToRefund(uint256 proposalId, address contributor);

    /// @notice Thrown when a required contract address is the zero address.
    error ZeroAddress(string name);

    /// @notice Thrown when a low-level ETH transfer fails.
    error TransferFailed(address recipient, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────
    //  EVENTS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when a new crowdfunded bounty proposal is submitted.
     * @param proposalId      Assigned proposal ID (monotonically increasing from 1).
     * @param proposer        Address of the submitter.
     * @param problemCid      IPFS CID of the problem dataset.
     * @param fundingDeadline Unix timestamp by which the goal must be reached.
     * @param fundingGoal     Minimum ETH required to activate the bounty.
     */
    event BountyProposed(
        uint256 indexed proposalId,
        address indexed proposer,
        bytes32         problemCid,
        uint64          fundingDeadline,
        uint256         fundingGoal
    );

    /**
     * @notice Emitted when a contributor funds a proposal.
     * @param proposalId   The funded proposal.
     * @param contributor  Address of the contributor.
     * @param amount       ETH contributed in this call (wei).
     * @param totalFunded  Running total after this contribution.
     */
    event ContributionMade(
        uint256 indexed proposalId,
        address indexed contributor,
        uint256         amount,
        uint256         totalFunded
    );

    /**
     * @notice Emitted when a proposal is activated and a BountyRound is created.
     * @param proposalId The activated proposal.
     * @param roundAddr  Address of the deployed BountyRound.
     * @param prizePool  ETH deposited into the round (totalFunded minus 2% fee).
     */
    event BountyActivated(
        uint256 indexed proposalId,
        address indexed roundAddr,
        uint256         prizePool
    );

    /**
     * @notice Emitted when a contributor reclaims their contribution after expiry.
     * @param proposalId  The expired proposal.
     * @param contributor Address of the refund recipient.
     * @param amount      ETH refunded (wei).
     */
    event RefundClaimed(
        uint256 indexed proposalId,
        address indexed contributor,
        uint256         amount
    );

    /**
     * @notice Emitted when the first claimRefund call lazily marks a proposal EXPIRED
     *         and forfeits the proposer's anti-spam deposit to treasury.
     * @param proposalId The newly expired proposal.
     */
    event ProposalExpired(uint256 indexed proposalId);

    /**
     * @notice Emitted when a proposer cancels a proposal before any contributions.
     * @param proposalId       The cancelled proposal.
     * @param proposer         Address of the proposer (deposit recipient).
     * @param depositRefunded  ETH returned to proposer (Constants.PROPOSAL_DEPOSIT).
     */
    event ProposalCancelled(
        uint256 indexed proposalId,
        address indexed proposer,
        uint256         depositRefunded
    );

    /**
     * @notice Emitted when core contract addresses are updated.
     * @param bountyFactory New BountyFactory address.
     * @param treasury      New Treasury address.
     */
    event ContractAddressesUpdated(
        address bountyFactory,
        address treasury
    );

    // ─────────────────────────────────────────────────────────────────────────
    //  INITIALIZER
    // ─────────────────────────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialise the BountyMarketplace proxy.
     *
     * @dev Grants DEFAULT_ADMIN_ROLE and UPGRADER_ROLE to `admin`.
     *      Grants OPERATOR_ROLE to `operator`.
     *      Sets nextProposalId to 1.
     *
     *      After deployment, grant `Constants.BOUNTY_CREATOR_ROLE` to this contract
     *      on BountyFactory so that {activateBounty} can create bounties and spawn rounds.
     *
     * @param admin          Protocol multisig — controls role administration.
     * @param operator       Initial operational address.
     * @param _bountyFactory Address of the deployed BountyFactory proxy.
     * @param _treasury      Address of the deployed Treasury proxy.
     */
    function initialize(
        address admin,
        address operator,
        address _bountyFactory,
        address _treasury
    )
        external
        initializer
    {
        if (admin          == address(0)) revert ZeroAddress("admin");
        if (operator       == address(0)) revert ZeroAddress("operator");
        if (_bountyFactory == address(0)) revert ZeroAddress("bountyFactory");
        if (_treasury      == address(0)) revert ZeroAddress("treasury");

        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE,       admin);
        _grantRole(Constants.UPGRADER_ROLE,  admin);
        _grantRole(Constants.OPERATOR_ROLE,  operator);

        bountyFactory  = _bountyFactory;
        treasury       = _treasury;
        nextProposalId = 1;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL — PROPOSER
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Submit a new crowdfunded bounty proposal.
     *
     * @dev The proposer pays exactly `Constants.PROPOSAL_DEPOSIT` (0.01 ETH) as an
     *      anti-spam measure.
     *        • Refunded if the funding goal is met and the round is activated.
     *        • Forfeited to treasury if the proposal expires without meeting the goal.
     *        • Refunded immediately if the proposer cancels before any contribution.
     *
     *      The proposal enters {ProposalStatus.FUNDING} immediately.
     *
     * Requirements
     *  • `msg.value == Constants.PROPOSAL_DEPOSIT` (exactly 0.01 ETH).
     *  • `fundingDeadline` ∈ [now + 1 day, now + 10 days].
     *  • `fundingGoal >= Constants.MIN_BOUNTY_DEPOSIT` (0.125 ETH).
     *  • `minContribution >= Constants.MIN_BOUNTY_DEPOSIT` (0.125 ETH).
     *  • `fundingCap == 0` OR `fundingCap >= fundingGoal`.
     *  • `commitDuration` ∈ [MIN_COMMIT_DURATION, MAX_COMMIT_DURATION].
     *  • `acceptanceThreshold` ∈ [MIN_ACCEPTANCE_THRESHOLD, MAX_ACCEPTANCE_THRESHOLD].
     *  • `prizeDistribution` sums to exactly BPS_DENOMINATOR (10 000).
     *
     * @param problemCid           IPFS CID (bytes32) of the problem dataset.
     * @param commitDuration       Competition commit-phase duration in seconds.
     * @param prizeDistribution    Basis-point prize shares (must sum to 10 000).
     * @param maxAgents            Max agent slots; 0 = unlimited.
     * @param requiredTier         Minimum agent tier (0 = Bronze … 4 = Prometheus).
     * @param acceptanceThreshold  Min score for full payout (1 000–9 500 BPS).
     * @param graduatedPayouts     Enable partial payouts below threshold.
     * @param fundingDeadline      Unix timestamp by which the goal must be reached.
     * @param fundingGoal          Minimum ETH to activate the bounty (>= 0.125 ETH).
     * @param fundingCap           Max ETH accepted; 0 = unlimited. Auto-activates when hit.
     * @param maxContributors      Max funders; 0 = unlimited.
     * @param minContribution      Min ETH per funder (>= 0.125 ETH).
     *
     * @return proposalId The ID assigned to this proposal (always ≥ 1).
     *
     * @custom:emits BountyProposed
     */
    function proposeBounty(
        bytes32           problemCid,
        uint32            commitDuration,
        uint16[] calldata prizeDistribution,
        uint8             maxAgents,
        uint8             requiredTier,
        uint16            acceptanceThreshold,
        bool              graduatedPayouts,
        uint64            fundingDeadline,
        uint256           fundingGoal,
        uint256           fundingCap,
        uint16            maxContributors,
        uint256           minContribution
    )
        external
        payable
        returns (uint256 proposalId)
    {
        // ── Anti-spam deposit ─────────────────────────────────────────────────
        if (msg.value != Constants.PROPOSAL_DEPOSIT) {
            revert IncorrectDeposit(msg.value, Constants.PROPOSAL_DEPOSIT);
        }

        // ── Funding deadline: 1–10 days from now ─────────────────────────────
        {
            uint64 earliest = uint64(block.timestamp) + uint64(Constants.MIN_FUNDING_DURATION);
            uint64 latest   = uint64(block.timestamp) + uint64(Constants.MAX_FUNDING_DURATION);
            if (fundingDeadline < earliest || fundingDeadline > latest) {
                revert InvalidFundingDeadline(fundingDeadline);
            }
        }

        // ── Funding goal ──────────────────────────────────────────────────────
        if (fundingGoal < Constants.MIN_BOUNTY_DEPOSIT) {
            revert InvalidFundingGoal(fundingGoal);
        }

        // ── Min contribution ──────────────────────────────────────────────────
        if (minContribution < Constants.MIN_BOUNTY_DEPOSIT) {
            revert InvalidMinContribution(minContribution);
        }

        // ── Funding cap consistency ───────────────────────────────────────────
        if (fundingCap > 0 && fundingCap < fundingGoal) {
            revert InvalidFundingCap(fundingCap, fundingGoal);
        }

        // ── Commit duration ───────────────────────────────────────────────────
        if (
            commitDuration < Constants.MIN_COMMIT_DURATION ||
            commitDuration > Constants.MAX_COMMIT_DURATION
        ) {
            revert InvalidCommitDuration(commitDuration);
        }

        // ── Acceptance threshold ─────────────────────────────────────────────
        if (
            acceptanceThreshold < Constants.MIN_ACCEPTANCE_THRESHOLD ||
            acceptanceThreshold > Constants.MAX_ACCEPTANCE_THRESHOLD
        ) {
            revert InvalidAcceptanceThreshold(acceptanceThreshold);
        }

        // ── Prize distribution: must sum to 10 000 ───────────────────────────
        {
            uint256 total;
            uint256 pdLen = prizeDistribution.length;
            for (uint256 i = 0; i < pdLen; ) {
                total += prizeDistribution[i];
                unchecked { ++i; }
            }
            if (total != Constants.BPS_DENOMINATOR) {
                revert InvalidPrizeDistribution(total);
            }
        }

        // ── Assign ID and advance counter ─────────────────────────────────────
        proposalId = nextProposalId;
        unchecked { nextProposalId = proposalId + 1; }

        // ── Store proposal ────────────────────────────────────────────────────
        BountyProposal storage p = proposals[proposalId];
        p.proposer            = msg.sender;
        p.problemCid          = problemCid;
        p.commitDuration      = commitDuration;
        p.maxAgents           = maxAgents;
        p.requiredTier        = requiredTier;
        p.acceptanceThreshold = acceptanceThreshold;
        p.graduatedPayouts    = graduatedPayouts;
        p.fundingDeadline     = fundingDeadline;
        p.fundingGoal         = fundingGoal;
        p.fundingCap          = fundingCap;
        p.maxContributors     = maxContributors;
        p.minContribution     = minContribution;
        p.status              = ProposalStatus.FUNDING;
        p.totalFunded         = 0;
        p.contributorCount    = 0;
        p.createdAt           = uint64(block.timestamp);
        p.roundAddr           = address(0);

        // Dynamic array must be pushed element-by-element into storage
        uint256 pdLen2 = prizeDistribution.length;
        for (uint256 i = 0; i < pdLen2; ) {
            p.prizeDistribution.push(prizeDistribution[i]);
            unchecked { ++i; }
        }

        emit BountyProposed(proposalId, msg.sender, problemCid, fundingDeadline, fundingGoal);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL — CONTRIBUTOR
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Fund a crowdfunded bounty proposal.
     *
     * @dev Contributions are locked until either activation (goal met) or expiry.
     *      One contribution per address per proposal (INV-7.2).
     *
     *      If the contribution causes `totalFunded` to reach `fundingCap`, the
     *      proposal is immediately activated (BountyRound created and funded).
     *
     * Requirements
     *  • `proposal.status == FUNDING`.
     *  • `block.timestamp <= proposal.fundingDeadline`.
     *  • `msg.value >= proposal.minContribution`.
     *  • `maxContributors == 0 || contributorCount < maxContributors`.
     *  • `msg.sender` has not already contributed to this proposal.
     *  • `fundingCap == 0 || totalFunded + msg.value <= fundingCap`.
     *
     * @param proposalId The proposal to fund.
     *
     * @custom:emits ContributionMade
     * @custom:emits BountyActivated (if fundingCap is reached)
     */
    function contribute(uint256 proposalId) external payable nonReentrant {
        BountyProposal storage p = proposals[proposalId];

        if (p.proposer == address(0)) revert ProposalNotFound(proposalId);
        if (p.status != ProposalStatus.FUNDING) revert WrongStatus(proposalId, p.status);
        if (block.timestamp > p.fundingDeadline) revert FundingDeadlinePassed(proposalId, p.fundingDeadline);
        if (msg.value < p.minContribution) revert BelowMinContribution(proposalId, msg.value, p.minContribution);
        if (p.maxContributors > 0 && p.contributorCount >= p.maxContributors) {
            revert MaxContributorsReached(proposalId);
        }
        if (contributions[proposalId][msg.sender] > 0) {
            revert AlreadyContributed(proposalId, msg.sender);
        }

        // Cap check: revert if contribution would exceed the cap (no partial fills)
        if (p.fundingCap > 0 && p.totalFunded + msg.value > p.fundingCap) {
            revert FundingCapExceeded(proposalId, p.fundingCap);
        }

        // ── Record contribution ───────────────────────────────────────────────
        contributions[proposalId][msg.sender] = msg.value;
        contributors[proposalId].push(msg.sender);
        p.totalFunded       += msg.value;
        p.contributorCount  += 1;

        emit ContributionMade(proposalId, msg.sender, msg.value, p.totalFunded);

        // ── Auto-activate if funding cap is reached ───────────────────────────
        if (p.fundingCap > 0 && p.totalFunded >= p.fundingCap) {
            _activateBounty(proposalId);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL — ACTIVATOR  (permissionless keeper)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Create a BountyRound from a fully-funded proposal after its deadline.
     *
     * @dev Anyone may call this once the funding deadline has passed AND the
     *      funding goal has been met.  Auto-activation (via `contribute`) also
     *      happens when `fundingCap` is reached, so this function is the fallback
     *      path for when the cap is 0 or was never triggered automatically.
     *
     *      Flow inside `_activateBounty`:
     *        1. 2 % protocol fee from totalFunded → treasury.
     *        2. Proposer anti-spam deposit → proposer (refunded on success).
     *        3. createBounty() on BountyFactory → bountyId.
     *        4. spawnRound(bountyId) on BountyFactory → roundAddr.
     *        5. depositBounty{value: prizePool}() on BountyRound.
     *        6. Proposal status → ACTIVE, roundAddr stored.
     *
     * Requirements
     *  • `proposal.status == FUNDING`.
     *  • `block.timestamp > proposal.fundingDeadline`.
     *  • `proposal.totalFunded >= proposal.fundingGoal`.
     *
     * @param proposalId The proposal to activate.
     *
     * @custom:emits BountyActivated
     */
    function activateBounty(uint256 proposalId) external nonReentrant {
        BountyProposal storage p = proposals[proposalId];

        if (p.proposer == address(0))        revert ProposalNotFound(proposalId);
        if (p.status != ProposalStatus.FUNDING) revert WrongStatus(proposalId, p.status);
        if (block.timestamp <= p.fundingDeadline) revert FundingStillOpen(proposalId, p.fundingDeadline);
        if (p.totalFunded < p.fundingGoal) {
            revert FundingGoalNotMet(proposalId, p.totalFunded, p.fundingGoal);
        }

        _activateBounty(proposalId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL — REFUND
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Claim a full refund if the funding goal was not met by the deadline.
     *
     * @dev If the proposal is still in {ProposalStatus.FUNDING} but the deadline
     *      has passed AND the goal was not met, this function lazily transitions the
     *      status to {ProposalStatus.EXPIRED} and forfeits the proposer's
     *      anti-spam deposit to treasury, then processes the caller's refund.
     *
     *      Subsequent callers find the status already EXPIRED and skip the lazy
     *      transition (the deposit is only sent to treasury once).
     *
     *      Pull-based: each contributor calls this individually to reclaim their
     *      contribution (INV-2.5 compliant).
     *
     * Requirements
     *  • Proposal must be in EXPIRED status, OR in FUNDING with deadline passed
     *    and goal not met (lazy expiry path).
     *  • `msg.sender` must have a non-zero contribution on this proposal.
     *
     * @param proposalId The proposal to claim a refund from.
     *
     * @custom:emits ProposalExpired (on first call via the lazy path)
     * @custom:emits RefundClaimed
     */
    function claimRefund(uint256 proposalId) external nonReentrant {
        BountyProposal storage p = proposals[proposalId];

        if (p.proposer == address(0)) revert ProposalNotFound(proposalId);

        // ── Lazy expiry transition ────────────────────────────────────────────
        if (p.status == ProposalStatus.FUNDING) {
            // Both conditions must be true to expire: deadline passed AND goal unmet
            if (block.timestamp <= p.fundingDeadline || p.totalFunded >= p.fundingGoal) {
                revert WrongStatus(proposalId, p.status);
            }
            // Mark expired and forfeit proposer's anti-spam deposit to treasury
            p.status = ProposalStatus.EXPIRED;
            _safeTransferEth(treasury, Constants.PROPOSAL_DEPOSIT);
            emit ProposalExpired(proposalId);
        } else if (p.status != ProposalStatus.EXPIRED) {
            revert WrongStatus(proposalId, p.status);
        }

        // ── Refund contributor ────────────────────────────────────────────────
        uint256 amount = contributions[proposalId][msg.sender];
        if (amount == 0) revert NoContributionToRefund(proposalId, msg.sender);

        // Zero out before transfer (CEI)
        contributions[proposalId][msg.sender] = 0;

        _safeTransferEth(msg.sender, amount);

        emit RefundClaimed(proposalId, msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL — PROPOSER CANCEL
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Cancel a proposal before any contributor has joined.
     *
     * @dev Only the proposer can cancel, and only while `contributorCount == 0`.
     *      This prevents rug-pulling contributors by cancelling after funds arrive.
     *      The anti-spam deposit is returned to the proposer on cancel.
     *
     * Requirements
     *  • `proposal.status == FUNDING`.
     *  • `msg.sender == proposal.proposer`.
     *  • `proposal.contributorCount == 0`.
     *
     * @param proposalId The proposal to cancel.
     *
     * @custom:emits ProposalCancelled
     */
    function cancelProposal(uint256 proposalId) external nonReentrant {
        BountyProposal storage p = proposals[proposalId];

        if (p.proposer == address(0))           revert ProposalNotFound(proposalId);
        if (p.status != ProposalStatus.FUNDING) revert WrongStatus(proposalId, p.status);
        if (msg.sender != p.proposer)           revert NotProposer(proposalId, msg.sender);
        if (p.contributorCount > 0)             revert HasContributors(proposalId);

        p.status = ProposalStatus.CANCELLED;

        // Refund anti-spam deposit to proposer
        _safeTransferEth(msg.sender, Constants.PROPOSAL_DEPOSIT);

        emit ProposalCancelled(proposalId, msg.sender, Constants.PROPOSAL_DEPOSIT);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL — OPERATOR
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Update the core protocol contract addresses.
     *
     * Requirements
     *  • Caller must hold {Constants.OPERATOR_ROLE}.
     *  • Neither address may be `address(0)`.
     *
     * @param _bountyFactory New BountyFactory address.
     * @param _treasury      New Treasury address.
     *
     * @custom:emits ContractAddressesUpdated
     */
    function setContractAddresses(
        address _bountyFactory,
        address _treasury
    )
        external
        onlyRole(Constants.OPERATOR_ROLE)
    {
        if (_bountyFactory == address(0)) revert ZeroAddress("bountyFactory");
        if (_treasury      == address(0)) revert ZeroAddress("treasury");

        bountyFactory = _bountyFactory;
        treasury      = _treasury;

        emit ContractAddressesUpdated(_bountyFactory, _treasury);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL VIEW
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Return the full {BountyProposal} struct for a given proposal ID,
     *         including the dynamic `prizeDistribution` array.
     *
     * @param proposalId The proposal to query.
     * @return           Memory copy of the stored {BountyProposal}.
     */
    function getProposal(uint256 proposalId)
        external
        view
        returns (BountyProposal memory)
    {
        if (proposals[proposalId].proposer == address(0)) revert ProposalNotFound(proposalId);
        return proposals[proposalId];
    }

    /**
     * @notice Return the ETH amount contributed by `contributor` to a proposal.
     *
     * @param proposalId  The proposal to query.
     * @param contributor The address to query.
     * @return            Amount contributed in wei (0 if never contributed or already refunded).
     */
    function getContribution(uint256 proposalId, address contributor)
        external
        view
        returns (uint256)
    {
        return contributions[proposalId][contributor];
    }

    /**
     * @notice Return the ordered list of contributor addresses for a proposal.
     *
     * @param proposalId The proposal to query.
     * @return           Array of contributor addresses in contribution order.
     */
    function getContributors(uint256 proposalId)
        external
        view
        returns (address[] memory)
    {
        return contributors[proposalId];
    }

    /**
     * @notice Returns true if `contributor` has a non-zero contribution on a proposal.
     *
     * @dev Returns false after the contributor claims a refund (zeroed-out entry).
     *      This is intentional: refunded contributors lose solution-access rights.
     *
     * @param proposalId  The proposal to query.
     * @param contributor The address to check.
     * @return            True if the address has an active (non-refunded) contribution.
     */
    function isContributor(uint256 proposalId, address contributor)
        external
        view
        returns (bool)
    {
        return contributions[proposalId][contributor] > 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  INTERNAL — ACTIVATION LOGIC
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Core activation routine shared by {activateBounty} and the auto-activate
     *      path in {contribute}.
     *
     *      Called only when status == FUNDING and the goal / cap condition is met.
     *      Marks status ACTIVE first (CEI), then performs ETH movements and factory calls.
     *      If any external call reverts, the whole transaction reverts atomically.
     *
     *      ETH flows:
     *        treasury  ← protocolFee  (2% of totalFunded)
     *        proposer  ← PROPOSAL_DEPOSIT  (anti-spam refund)
     *        round     ← prizePool  (totalFunded − protocolFee)
     */
    function _activateBounty(uint256 proposalId) internal {
        BountyProposal storage p = proposals[proposalId];

        // ── Fee computation ───────────────────────────────────────────────────
        uint256 totalFunded_  = p.totalFunded;
        uint256 protocolFee   = (totalFunded_ * Constants.PROTOCOL_FEE_BPS) / Constants.BPS_DENOMINATOR;
        uint256 prizePool     = totalFunded_ - protocolFee;

        // Cache proposer address before storage changes
        address proposer_     = p.proposer;

        // ── Mark active (CEI — state before external calls) ───────────────────
        p.status = ProposalStatus.ACTIVE;

        // ── ETH to treasury ───────────────────────────────────────────────────
        _safeTransferEth(treasury, protocolFee);

        // ── Refund anti-spam deposit to proposer ──────────────────────────────
        _safeTransferEth(proposer_, Constants.PROPOSAL_DEPOSIT);

        // ── Build BountyFactory config ────────────────────────────────────────
        // Copy prizeDistribution from storage to memory for the external call
        uint16[] memory prizeDist = p.prizeDistribution;

        IBountyFactory.BountyConfig memory cfg = IBountyFactory.BountyConfig({
            problemCid:          p.problemCid,
            entryFee:            Constants.ENTRY_FEE,    // fixed per INV-2.1
            commitDuration:      p.commitDuration,
            prizeDistribution:   prizeDist,
            maxAgents:           p.maxAgents,
            tier:                p.requiredTier,
            acceptanceThreshold: p.acceptanceThreshold,
            graduatedPayouts:    p.graduatedPayouts,
            active:              false,      // overwritten by BountyFactory
            isPrivate:           false,      // crowdfunded bounties are always public (v1)
            createdAt:           0,          // overwritten by BountyFactory
            creator:             address(0)  // overwritten by BountyFactory → becomes address(this)
        });

        // ── Create bounty and spawn round via BountyFactory ───────────────────
        // BountyFactory.createBounty sets creator = msg.sender = address(this),
        // so the spawned round's sponsor will be address(this).
        uint256 bountyId   = IBountyFactory(bountyFactory).createBounty(cfg);
        address roundAddr_ = IBountyFactory(bountyFactory).spawnRound(bountyId);

        // Store round address
        p.roundAddr = roundAddr_;

        // ── Deposit prize pool into BountyRound (this contract is the sponsor) ─
        IBountyRound(roundAddr_).depositBounty{value: prizePool}();

        emit BountyActivated(proposalId, roundAddr_, prizePool);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  INTERNAL HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Transfer ETH to `recipient` via a low-level call.
     *      Reverts with {TransferFailed} if the transfer fails.
     *      Using `call` avoids out-of-gas issues with smart-contract recipients.
     */
    function _safeTransferEth(address recipient, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed(recipient, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  UUPS UPGRADE AUTHORISATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Restrict UUPS implementation upgrades to addresses holding
     *      {Constants.UPGRADER_ROLE}.
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(Constants.UPGRADER_ROLE)
    {}
}
