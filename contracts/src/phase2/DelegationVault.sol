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
 * ██╗   ██╗ █████╗ ██╗   ██╗██╗  ████████╗
 * ██║   ██║██╔══██╗██║   ██║██║  ╚══██╔══╝
 * ██║   ██║███████║██║   ██║██║     ██║
 * ╚██╗ ██╔╝██╔══██║██║   ██║██║     ██║
 *  ╚████╔╝ ██║  ██║╚██████╔╝███████╗██║
 *   ╚═══╝  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝
 */

import {UUPSUpgradeable}           from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable}  from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {Initializable}             from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Constants} from "../Constants.sol";

// ─── Minimal ArenaRegistry interface ─────────────────────────────────────────
/// @dev We only need two calls from ArenaRegistry; a minimal interface avoids tight coupling.
interface IArenaRegistry {
    /// @notice Returns true when `agentId` exists and has not been deregistered.
    function isActive(uint256 agentId) external view returns (bool);

    /// @notice Minimal subset of the Agent struct fields we need.
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
        );
}

/**
 * @title  DelegationVault
 * @author Agonaut
 * @notice Allows humans to delegate ETH to AI agents they believe in.
 *         Agents use the delegated capital as backing for competition stakes.
 *         Winnings are distributed proportionally to delegators, net of a
 *         configurable per-agent performance fee.
 *
 * @dev    UUPS-upgradeable, uses OpenZeppelin 5.x AccessControl and ReentrancyGuard.
 *
 * ─── Architecture overview ────────────────────────────────────────────────────
 *  1.  Delegators call {delegate} to lock ETH into an agent's vault.
 *  2.  BountyRound queries {getAvailableFunds} to determine an agent's total
 *      backing (excluding delegations that are pending withdrawal).
 *  3.  When an agent wins, BountyRound calls {distributeProfits} with the ETH
 *      prize, which pushes the agent's performance fee to their wallet and
 *      splits the remainder proportionally among all active delegators.
 *  4.  Delegators wishing to exit call {requestWithdraw}, then after
 *      DELEGATION_COOLDOWN (24 h) call {executeWithdraw} to reclaim their
 *      principal.
 *
 * ─── Role layout ───────────────────────────────────────────────────────────
 *  DEFAULT_ADMIN_ROLE  — multisig; grants/revokes roles, owns upgrades
 *  UPGRADER_ROLE       — authorised to push new implementations
 *  BOUNTY_ROUND_ROLE   — granted to BountyRound; may call distributeProfits
 */
contract DelegationVault is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    // ═══════════════════════════════════════════════════════════════════════
    //  CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Minimum ETH that may be deposited in a single delegation.
    uint256 public constant MIN_DELEGATION = 0.001 ether;

    /// @notice Maximum performance fee an agent may charge (50 %).
    uint16 public constant MAX_PERFORMANCE_FEE_BPS = 5_000;

    /// @notice Pull-based claims expire after 90 days; unclaimed funds swept to treasury.
    uint64 public constant CLAIM_EXPIRY = 90 days;

    // ═══════════════════════════════════════════════════════════════════════
    //  STRUCTS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Represents a single delegator position in an agent's vault.
     * @param delegator            Address that funded this delegation.
     * @param agentId              Target agent ID.
     * @param amount               ETH principal in wei.
     * @param delegatedAt          Unix timestamp when the delegation was created.
     * @param withdrawRequestedAt  Unix timestamp when withdrawal was requested;
     *                             0 = no pending withdrawal request.
     */
    struct Delegation {
        address delegator;
        uint256 agentId;
        uint256 amount;
        uint64  delegatedAt;
        uint64  withdrawRequestedAt;
    }

    /**
     * @notice Aggregate state for a single agent's delegation pool.
     * @param totalDelegated   Sum of all active delegation principals (wei).
     * @param totalProfits     Cumulative ETH profits ever distributed to this vault.
     * @param performanceFeeBps Agent's share of each profit distribution (basis points).
     * @param delegationIds    Ordered list of delegation IDs belonging to this vault.
     */
    struct AgentVault {
        uint256   totalDelegated;
        uint256   totalProfits;
        uint16    performanceFeeBps;
        uint256[] delegationIds;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  STATE
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Address of the ArenaRegistry contract (used to verify agent activity).
    address public arenaRegistry;

    /// @notice Monotonically-increasing delegation ID counter; starts at 1.
    uint256 public nextDelegationId;

    /// @notice delegationId → Delegation
    mapping(uint256 => Delegation) public delegations;

    /// @notice agentId → AgentVault
    mapping(uint256 => AgentVault) public agentVaults;

    /// @notice delegator → list of delegationIds they have created
    mapping(address => uint256[]) public delegatorHistory;

    // ── Pull-based claims ─────────────────────────────────────────────────

    /// @notice Per-address claimable ETH balance (set by allocateProfits).
    mapping(address => uint256) public claimable;

    /// @notice Total ETH currently allocated to claims but not yet withdrawn.
    uint256 public totalClaimable;

    /// @notice Timestamp of the most recent allocateProfits call; used to enforce CLAIM_EXPIRY.
    uint64 public claimsAllocatedAt;

    /// @notice ETH received via receive() from BountyRound, awaiting allocateProfits.
    uint256 public pendingProfits;

    /// @notice Destination for swept unclaimed funds after CLAIM_EXPIRY elapses.
    address public treasury;

    // ═══════════════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Emitted when a new delegation is created.
     * @param delegationId Unique ID of the new delegation.
     * @param delegator    Address of the delegator.
     * @param agentId      Target agent.
     * @param amount       ETH delegated (wei).
     */
    event Delegated(
        uint256 indexed delegationId,
        address indexed delegator,
        uint256 indexed agentId,
        uint256 amount
    );

    /**
     * @notice Emitted when a delegator requests a withdrawal.
     * @param delegationId          The delegation whose withdrawal was requested.
     * @param delegator             Address of the delegator.
     * @param withdrawRequestedAt   Unix timestamp of the request.
     * @param eligibleAt            Earliest timestamp at which execution is allowed.
     */
    event WithdrawRequested(
        uint256 indexed delegationId,
        address indexed delegator,
        uint64  withdrawRequestedAt,
        uint64  eligibleAt
    );

    /**
     * @notice Emitted when a principal withdrawal is executed.
     * @param delegationId Delegation that was closed.
     * @param delegator    Recipient of the principal.
     * @param agentId      Agent whose vault was reduced.
     * @param amount       ETH returned (wei).
     */
    event WithdrawExecuted(
        uint256 indexed delegationId,
        address indexed delegator,
        uint256 indexed agentId,
        uint256 amount
    );

    /**
     * @notice Emitted when an agent's vault receives a profit distribution.
     * @param agentId         Agent that won the bounty round.
     * @param totalProfit     Total ETH received for distribution (wei).
     * @param agentFee        Portion sent to the agent's wallet (wei).
     * @param delegatorShare  Portion distributed among delegators (wei).
     * @param activeDelegations Number of delegations that received a share.
     */
    event ProfitsDistributed(
        uint256 indexed agentId,
        uint256 totalProfit,
        uint256 agentFee,
        uint256 delegatorShare,
        uint256 activeDelegations
    );

    /**
     * @notice Emitted when an agent updates their performance fee.
     * @param agentId   Agent whose fee changed.
     * @param oldFeeBps Previous fee in basis points.
     * @param newFeeBps New fee in basis points.
     */
    event PerformanceFeeUpdated(
        uint256 indexed agentId,
        uint16  oldFeeBps,
        uint16  newFeeBps
    );

    /**
     * @notice Emitted when pending ETH is allocated to delegator claimable balances.
     * @param agentId           Agent whose delegators received the allocation.
     * @param totalProfit       Total ETH distributed (wei).
     * @param agentFee          Portion allocated to the agent's wallet (wei).
     * @param delegatorShare    Portion split among delegators (wei).
     * @param activeDelegations Number of delegations that received a share.
     */
    event ProfitsAllocated(
        uint256 indexed agentId,
        uint256 totalProfit,
        uint256 agentFee,
        uint256 delegatorShare,
        uint256 activeDelegations
    );

    /**
     * @notice Emitted when a claimant withdraws their allocated funds.
     * @param recipient Address that received the ETH.
     * @param amount    ETH withdrawn (wei).
     */
    event FundsClaimed(address indexed recipient, uint256 amount);

    /**
     * @notice Emitted when expired unclaimed funds are swept to the treasury.
     * @param treasury  Destination address.
     * @param amount    ETH swept (wei).
     */
    event ExpiredFundsSwept(address indexed treasury, uint256 amount);

    // ═══════════════════════════════════════════════════════════════════════
    //  CUSTOM ERRORS
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Supplied address is the zero address.
    error ZeroAddress();

    /// @notice ETH sent is below MIN_DELEGATION.
    error DelegationTooSmall(uint256 sent, uint256 minimum);

    /// @notice The target agent is not currently active in the ArenaRegistry.
    error AgentNotActive(uint256 agentId);

    /// @notice The delegation ID does not exist.
    error DelegationNotFound(uint256 delegationId);

    /// @notice Caller is not the delegator for this delegation.
    error NotDelegator(uint256 delegationId, address caller);

    /// @notice A withdrawal has already been requested for this delegation.
    error WithdrawAlreadyRequested(uint256 delegationId);

    /// @notice No withdrawal has been requested; cannot execute yet.
    error WithdrawNotRequested(uint256 delegationId);

    /// @notice The cooldown period has not yet elapsed since the withdrawal request.
    error CooldownNotElapsed(uint256 delegationId, uint64 eligibleAt);

    /// @notice The delegation principal is zero; nothing to withdraw.
    error NothingToWithdraw(uint256 delegationId);

    /// @notice Performance fee exceeds the protocol maximum.
    error FeeTooHigh(uint16 feeBps, uint16 maximum);

    /// @notice Caller is not the registered owner (wallet) of the agent.
    error NotAgentOwner(uint256 agentId, address caller);

    /// @notice No profit value attached to the call.
    error ZeroProfitAmount();

    /// @notice An ETH transfer to a recipient failed.
    error EthTransferFailed(address recipient, uint256 amount);

    /// @notice Caller has no claimable balance.
    error NothingToClaim();

    /// @notice Claims have expired; only sweepExpiredClaims() may be called.
    error ClaimsExpired();

    /// @notice Sweep attempted before the 90-day expiry window has elapsed.
    error ClaimsNotExpired();

    // ═══════════════════════════════════════════════════════════════════════
    //  INITIALIZER
    // ═══════════════════════════════════════════════════════════════════════

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialise the DelegationVault proxy.
     * @dev Called once at deployment via the UUPS proxy.
     * @param admin_         Address granted DEFAULT_ADMIN_ROLE and UPGRADER_ROLE.
     * @param arenaRegistry_ Address of the deployed ArenaRegistry contract.
     */
    function initialize(address admin_, address arenaRegistry_) external initializer {
        if (admin_ == address(0) || arenaRegistry_ == address(0)) revert ZeroAddress();

        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE,        admin_);
        _grantRole(Constants.UPGRADER_ROLE,   admin_);

        arenaRegistry     = arenaRegistry_;
        nextDelegationId  = 1; // reserve 0 as null sentinel
        treasury          = admin_; // default treasury; updateable via setTreasury
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  DELEGATOR FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Delegate ETH to an AI agent.
     * @dev The agent must be active in the ArenaRegistry.
     *      The minimum delegation is MIN_DELEGATION (0.001 ETH).
     *      Emits {Delegated}.
     *
     * @param agentId  The ID of the agent to back.
     */
    function delegate(uint256 agentId) external payable {
        // ── Validation ──────────────────────────────────────────────────
        if (msg.value < MIN_DELEGATION)
            revert DelegationTooSmall(msg.value, MIN_DELEGATION);

        if (!IArenaRegistry(arenaRegistry).isActive(agentId))
            revert AgentNotActive(agentId);

        // ── State mutation ───────────────────────────────────────────────
        uint256 delegationId = nextDelegationId;
        unchecked { nextDelegationId = delegationId + 1; }

        delegations[delegationId] = Delegation({
            delegator:           msg.sender,
            agentId:             agentId,
            amount:              msg.value,
            delegatedAt:         uint64(block.timestamp),
            withdrawRequestedAt: 0
        });

        agentVaults[agentId].totalDelegated  += msg.value;
        agentVaults[agentId].delegationIds.push(delegationId);

        delegatorHistory[msg.sender].push(delegationId);

        emit Delegated(delegationId, msg.sender, agentId, msg.value);
    }

    /**
     * @notice Initiate a withdrawal request for a delegation.
     * @dev Only the original delegator may call this.
     *      After this call, the delegation is locked for DELEGATION_COOLDOWN (24 h)
     *      before {executeWithdraw} can be called. This prevents front-running
     *      (delegate → win → immediately withdraw).
     *      Emits {WithdrawRequested}.
     *
     * @param delegationId  The delegation to begin withdrawing.
     */
    function requestWithdraw(uint256 delegationId) external {
        Delegation storage d = _getDelegation(delegationId);

        if (d.delegator != msg.sender)
            revert NotDelegator(delegationId, msg.sender);

        if (d.withdrawRequestedAt != 0)
            revert WithdrawAlreadyRequested(delegationId);

        uint64 ts = uint64(block.timestamp);
        d.withdrawRequestedAt = ts;

        uint64 eligibleAt = ts + Constants.DELEGATION_COOLDOWN;
        emit WithdrawRequested(delegationId, msg.sender, ts, eligibleAt);
    }

    /**
     * @notice Execute a pending withdrawal and reclaim the delegated principal.
     * @dev Only the original delegator may call this.
     *      Must be called at least DELEGATION_COOLDOWN seconds after {requestWithdraw}.
     *      The principal is returned; any profits were already pushed during
     *      {distributeProfits} calls.
     *      Emits {WithdrawExecuted}.
     *
     * @param delegationId  The delegation to finalise.
     */
    function executeWithdraw(uint256 delegationId) external nonReentrant {
        Delegation storage d = _getDelegation(delegationId);

        if (d.delegator != msg.sender)
            revert NotDelegator(delegationId, msg.sender);

        if (d.withdrawRequestedAt == 0)
            revert WithdrawNotRequested(delegationId);

        uint64 eligibleAt = d.withdrawRequestedAt + Constants.DELEGATION_COOLDOWN;
        if (block.timestamp < eligibleAt)
            revert CooldownNotElapsed(delegationId, eligibleAt);

        uint256 principal = d.amount;
        if (principal == 0) revert NothingToWithdraw(delegationId);

        uint256 agentId = d.agentId;

        // ── Zero-out before external call (CEI pattern) ──────────────────
        d.amount = 0;

        // Reduce vault total; underflow is impossible here by construction
        unchecked {
            agentVaults[agentId].totalDelegated -= principal;
        }

        emit WithdrawExecuted(delegationId, msg.sender, agentId, principal);

        // ── Transfer principal ────────────────────────────────────────────
        (bool ok,) = msg.sender.call{value: principal}("");
        if (!ok) revert EthTransferFailed(msg.sender, principal);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  AGENT FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Set the performance fee for an agent's delegation vault.
     * @dev Only the agent's registered wallet (owner) may call this.
     *      Maximum allowed is MAX_PERFORMANCE_FEE_BPS (50 %).
     *      Emits {PerformanceFeeUpdated}.
     *
     * @param agentId  The agent to configure.
     * @param feeBps   New performance fee in basis points (e.g., 2000 = 20 %).
     */
    function setPerformanceFee(uint256 agentId, uint16 feeBps) external {
        if (feeBps > MAX_PERFORMANCE_FEE_BPS)
            revert FeeTooHigh(feeBps, MAX_PERFORMANCE_FEE_BPS);

        address agentWallet = _getAgentWallet(agentId);
        if (agentWallet != msg.sender)
            revert NotAgentOwner(agentId, msg.sender);

        uint16 oldFee = agentVaults[agentId].performanceFeeBps;
        agentVaults[agentId].performanceFeeBps = feeBps;

        emit PerformanceFeeUpdated(agentId, oldFee, feeBps);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  PROTOCOL FUNCTIONS (BOUNTY_ROUND_ROLE)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Distribute winnings from a bounty round to the agent and their delegators.
     * @dev Must be called by an address holding Constants.BOUNTY_ROUND_ROLE.
     *      The full ETH prize must be attached as msg.value.
     *
     *      Distribution logic:
     *        1. Agent performance fee  = msg.value × performanceFeeBps / 10_000
     *           → transferred to the agent's registered wallet.
     *        2. Delegator share        = msg.value − agent fee
     *           → each active delegation (amount > 0, no pending withdrawal)
     *             receives: delegatorShare × delegationAmount / totalActiveDelegated
     *
     *      "Active" means the delegation still has a non-zero principal and has
     *      NOT had a withdrawal request submitted (withdrawRequestedAt == 0).
     *      Delegations mid-cooldown are excluded from the distribution as an
     *      additional deterrent to withdrawal timing games.
     *
     *      If a push to a delegator fails (e.g., a non-payable contract), the
     *      funds remain in the vault and the event records the undelivered amount.
     *      A dedicated recovery function can be added in a future upgrade.
     *
     *      Emits {ProfitsDistributed}.
     *
     * @param agentId  The winning agent.
     */
    function distributeProfits(uint256 agentId)
        external
        payable
        onlyRole(Constants.BOUNTY_ROUND_ROLE)
    {
        if (msg.value == 0) revert ZeroProfitAmount();

        AgentVault storage vault = agentVaults[agentId];

        // ── Record total profits ─────────────────────────────────────────
        vault.totalProfits += msg.value;

        // ── Agent performance fee ────────────────────────────────────────
        uint256 agentFee;
        if (vault.performanceFeeBps > 0) {
            agentFee = (msg.value * vault.performanceFeeBps) / Constants.BPS_DENOMINATOR;
        }

        uint256 delegatorPool = msg.value - agentFee;

        // ── Collect active delegations and compute total backing ─────────
        uint256[] storage ids = vault.delegationIds;
        uint256 len = ids.length;

        // Two-pass: first tally active principal, then distribute
        uint256 totalActive;
        for (uint256 i; i < len; ) {
            Delegation storage d = delegations[ids[i]];
            if (d.amount > 0 && d.withdrawRequestedAt == 0) {
                unchecked { totalActive += d.amount; }
            }
            unchecked { ++i; }
        }

        uint256 activeDelegations;
        if (totalActive > 0 && delegatorPool > 0) {
            uint256 distributed;

            for (uint256 i; i < len; ) {
                Delegation storage d = delegations[ids[i]];

                if (d.amount > 0 && d.withdrawRequestedAt == 0) {
                    unchecked { ++activeDelegations; }

                    // Pro-rata share; use multiplication-before-division for precision
                    uint256 share = (delegatorPool * d.amount) / totalActive;

                    if (share > 0) {
                        unchecked { distributed += share; }
                        // Push payment; fallback to claimable if transfer fails
                        // slither-disable-next-line low-level-calls
                        (bool ok,) = d.delegator.call{value: share}("");
                        if (!ok) {
                            // Credit to pull-based claimable so funds are never trapped
                            claimable[d.delegator] += share;
                        }
                    }
                }
                unchecked { ++i; }
            }

            // Dust from integer division stays in contract (intentional)
        }

        // ── Agent fee transfer ────────────────────────────────────────────
        if (agentFee > 0) {
            address agentWallet = _getAgentWallet(agentId);
            (bool ok,) = agentWallet.call{value: agentFee}("");
            if (!ok) revert EthTransferFailed(agentWallet, agentFee);
        }

        emit ProfitsDistributed(
            agentId,
            msg.value,
            agentFee,
            delegatorPool,
            activeDelegations
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Update the treasury address that receives swept unclaimed funds.
     * @dev Only DEFAULT_ADMIN_ROLE.
     * @param treasury_ New treasury address.
     */
    function setTreasury(address treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  PULL-BASED CLAIMS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Distribute pending profits (received via {receive}) to delegators of an agent.
     * @dev Anyone may call this after ETH has arrived in the vault from a BountyRound claim.
     *      All `pendingProfits` are consumed and allocated proportionally among active delegators.
     *      The agent's performance fee is allocated to their registered wallet's claimable balance.
     *
     *      "Active" means: amount > 0 AND withdrawRequestedAt == 0.
     *      Emits {ProfitsAllocated}.
     *
     * @param agentId  The agent whose delegators should receive the profit split.
     */
    function allocateProfits(uint256 agentId) external nonReentrant {
        uint256 profit = pendingProfits;
        if (profit == 0) revert ZeroProfitAmount();

        // Consume pending profits before any state changes (CEI)
        pendingProfits = 0;

        AgentVault storage vault_ = agentVaults[agentId];
        vault_.totalProfits += profit;

        // ── Agent performance fee ────────────────────────────────────────
        uint256 agentFee;
        if (vault_.performanceFeeBps > 0) {
            agentFee = (profit * vault_.performanceFeeBps) / Constants.BPS_DENOMINATOR;
        }

        uint256 delegatorPool = profit - agentFee;

        // ── Collect active delegations and compute total backing ─────────
        uint256[] storage ids = vault_.delegationIds;
        uint256 len = ids.length;

        uint256 totalActive;
        for (uint256 i; i < len; ) {
            Delegation storage d = delegations[ids[i]];
            if (d.amount > 0 && d.withdrawRequestedAt == 0) {
                unchecked { totalActive += d.amount; }
            }
            unchecked { ++i; }
        }

        uint256 activeDelegations;
        if (totalActive > 0 && delegatorPool > 0) {
            for (uint256 i; i < len; ) {
                Delegation storage d = delegations[ids[i]];
                if (d.amount > 0 && d.withdrawRequestedAt == 0) {
                    unchecked { ++activeDelegations; }

                    uint256 share = (delegatorPool * d.amount) / totalActive;
                    if (share > 0) {
                        claimable[d.delegator] += share;
                        unchecked { totalClaimable += share; }
                    }
                }
                unchecked { ++i; }
            }
        }

        // ── Agent fee → agent wallet claimable ───────────────────────────
        if (agentFee > 0) {
            address agentWallet = _getAgentWallet(agentId);
            claimable[agentWallet] += agentFee;
            unchecked { totalClaimable += agentFee; }
        }

        // Update expiry clock
        claimsAllocatedAt = uint64(block.timestamp);

        emit ProfitsAllocated(agentId, profit, agentFee, delegatorPool, activeDelegations);
    }

    /**
     * @notice Claim allocated ETH for a recipient.
     * @dev Pull-based: each recipient withdraws independently.
     *      Anyone may call on behalf of any recipient (same pattern as BountyRound).
     *      Uses CEI: balance zeroed before transfer.
     *      Emits {FundsClaimed}.
     *
     * @param recipient  The address whose claimable balance to withdraw.
     */
    function claim(address recipient) external nonReentrant {
        uint256 amount = claimable[recipient];
        if (amount == 0) revert NothingToClaim();
        if (block.timestamp > uint256(claimsAllocatedAt) + CLAIM_EXPIRY) revert ClaimsExpired();

        claimable[recipient] = 0;
        unchecked { totalClaimable -= amount; }

        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert EthTransferFailed(recipient, amount);

        emit FundsClaimed(recipient, amount);
    }

    /**
     * @notice Batch claim for multiple recipients in one transaction.
     * @dev Skips recipients with zero balance (does not revert on empty).
     *      If a transfer fails for one recipient, their balance is re-credited and
     *      the batch continues — one bad actor cannot block others.
     *      Emits {FundsClaimed} for each successful transfer.
     *
     * @param recipients  Array of addresses to claim for.
     */
    function claimBatch(address[] calldata recipients) external nonReentrant {
        if (block.timestamp > uint256(claimsAllocatedAt) + CLAIM_EXPIRY) revert ClaimsExpired();

        for (uint256 i; i < recipients.length; ) {
            uint256 amount = claimable[recipients[i]];
            if (amount > 0) {
                claimable[recipients[i]] = 0;
                unchecked { totalClaimable -= amount; }

                (bool ok,) = recipients[i].call{value: amount}("");
                if (ok) {
                    emit FundsClaimed(recipients[i], amount);
                } else {
                    // Re-credit on failure
                    claimable[recipients[i]] = amount;
                    unchecked { totalClaimable += amount; }
                }
            }
            unchecked { ++i; }
        }
    }

    /**
     * @notice Sweep all remaining unclaimed funds to the treasury after the 90-day expiry.
     * @dev Anyone may call after CLAIM_EXPIRY has elapsed since the last allocateProfits.
     *      Emits {ExpiredFundsSwept}.
     */
    function sweepExpiredClaims() external nonReentrant {
        if (totalClaimable == 0) revert NothingToClaim();
        if (claimsAllocatedAt == 0 || block.timestamp <= uint256(claimsAllocatedAt) + CLAIM_EXPIRY)
            revert ClaimsNotExpired();

        uint256 remaining = totalClaimable;
        totalClaimable = 0;

        (bool ok,) = treasury.call{value: remaining}("");
        if (!ok) revert EthTransferFailed(treasury, remaining);

        emit ExpiredFundsSwept(treasury, remaining);
    }

    /**
     * @notice View claimable ETH balance for any address.
     * @param recipient  Address to query.
     * @return amount    Claimable ETH in wei.
     */
    function getClaimable(address recipient) external view returns (uint256 amount) {
        return claimable[recipient];
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Calculate the total ETH available for an agent to stake.
     * @dev Returns the sum of all delegation principals that are NOT pending
     *      withdrawal (withdrawRequestedAt == 0 AND amount > 0).
     *      BountyRound uses this to gate round participation.
     *
     * @param agentId  The agent to query.
     * @return available  Total unlocked delegation capital in wei.
     */
    function getAvailableFunds(uint256 agentId) external view returns (uint256 available) {
        uint256[] storage ids = agentVaults[agentId].delegationIds;
        uint256 len = ids.length;

        for (uint256 i; i < len; ) {
            Delegation storage d = delegations[ids[i]];
            if (d.amount > 0 && d.withdrawRequestedAt == 0) {
                unchecked { available += d.amount; }
            }
            unchecked { ++i; }
        }
    }

    /**
     * @notice Retrieve the full Delegation struct for a given ID.
     * @param delegationId  The delegation to look up.
     * @return              A memory copy of the Delegation struct.
     */
    function getDelegation(uint256 delegationId)
        external
        view
        returns (Delegation memory)
    {
        if (delegations[delegationId].delegator == address(0))
            revert DelegationNotFound(delegationId);
        return delegations[delegationId];
    }

    /**
     * @notice Retrieve the AgentVault summary for a given agent.
     * @param agentId  The agent to look up.
     * @return         A memory copy of the AgentVault struct.
     */
    function getAgentVault(uint256 agentId)
        external
        view
        returns (AgentVault memory)
    {
        return agentVaults[agentId];
    }

    /**
     * @notice Return all delegation IDs ever created by a delegator.
     * @param delegator  The address to query.
     * @return           Array of delegation IDs (may include closed delegations).
     */
    function getDelegatorDelegations(address delegator)
        external
        view
        returns (uint256[] memory)
    {
        return delegatorHistory[delegator];
    }

    /**
     * @notice Check whether a delegation is eligible for {executeWithdraw}.
     * @dev Returns false if no withdrawal has been requested, if the cooldown has
     *      not yet elapsed, or if the delegation principal is already zero.
     *
     * @param delegationId  The delegation to inspect.
     * @return              True if the withdrawal can be executed right now.
     */
    function canWithdraw(uint256 delegationId) external view returns (bool) {
        Delegation storage d = delegations[delegationId];
        if (d.delegator == address(0)) return false;
        if (d.amount == 0)             return false;
        if (d.withdrawRequestedAt == 0) return false;

        return block.timestamp >= uint256(d.withdrawRequestedAt) + Constants.DELEGATION_COOLDOWN;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Load a Delegation storage reference and revert if it does not exist.
     * @param delegationId  The delegation to load.
     */
    function _getDelegation(uint256 delegationId)
        internal
        view
        returns (Delegation storage d)
    {
        d = delegations[delegationId];
        if (d.delegator == address(0)) revert DelegationNotFound(delegationId);
    }

    /**
     * @dev Fetch the wallet address of the agent owner from ArenaRegistry.
     *      Reverts with AgentNotActive if the agent does not exist or is deregistered.
     * @param agentId  Agent to look up.
     * @return wallet  The owner's wallet address.
     */
    function _getAgentWallet(uint256 agentId) internal view returns (address wallet) {
        if (!IArenaRegistry(arenaRegistry).isActive(agentId))
            revert AgentNotActive(agentId);

        (wallet,,,,,,,, ) = IArenaRegistry(arenaRegistry).getAgent(agentId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  UUPS UPGRADE AUTHORISATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Restricts implementation upgrades to UPGRADER_ROLE holders.
     *      Invoked internally by the UUPS proxy upgrade mechanism.
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(Constants.UPGRADER_ROLE)
    {}

    // ═══════════════════════════════════════════════════════════════════════
    //  RECEIVE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Accept ETH from addresses holding BOUNTY_ROUND_ROLE (e.g. BountyRound contracts
     *      calling {BountyRound.claim} on behalf of this vault).  The received ETH is
     *      tracked in `pendingProfits` and must be distributed via {allocateProfits}.
     *
     *      All other senders are rejected to prevent accounting inconsistencies.
     */
    receive() external payable {
        if (!hasRole(Constants.BOUNTY_ROUND_ROLE, msg.sender)) {
            revert("DelegationVault: use delegate()");
        }
        pendingProfits += msg.value;
    }
}
