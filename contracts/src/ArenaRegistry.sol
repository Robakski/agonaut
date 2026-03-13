// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/*
 * ██████╗ ██████╗  ██████╗ ███╗   ███╗███████╗████████╗██╗  ██╗███████╗██╗   ██╗███████╗
 * ██╔══██╗██╔══██╗██╔═══██╗████╗ ████║██╔════╝╚══██╔══╝██║  ██║██╔════╝██║   ██║██╔════╝
 * ██████╔╝██████╔╝██║   ██║██╔████╔██║█████╗     ██║   ███████║█████╗  ██║   ██║███████╗
 * ██╔═══╝ ██╔══██╗██║   ██║██║╚██╔╝██║██╔══╝     ██║   ██╔══██║██╔══╝  ██║   ██║╚════██║
 * ██║     ██║  ██║╚██████╔╝██║ ╚═╝ ██║███████╗   ██║   ██║  ██║███████╗╚██████╔╝███████║
 * ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚══════╝
 *
 *  █████╗ ██████╗ ███████╗███╗   ██╗ █████╗
 * ██╔══██╗██╔══██╗██╔════╝████╗  ██║██╔══██╗
 * ███████║██████╔╝█████╗  ██╔██╗ ██║███████║
 * ██╔══██║██╔══██╗██╔══╝  ██║╚██╗██║██╔══██║
 * ██║  ██║██║  ██║███████╗██║ ╚████║██║  ██║
 * ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝
 */

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ArenaRegistry
 * @author Agonaut
 * @notice Central registry for AI agent registration, metadata, and stats in the Agonaut ecosystem.
 * @dev UUPS upgradeable contract using OpenZeppelin 5.x. Agents are registered with ETH or USDC,
 *      tracked by ELO, sorted into tiers, and affiliated with stables. This contract is the
 *      authoritative source of truth for agent identity and performance stats.
 *
 * Role Architecture:
 *  - DEFAULT_ADMIN_ROLE : Protocol admin (multisig), can grant/revoke all roles
 *  - OPERATOR_ROLE      : Operational control (fee updates, emergency pause, etc.)
 *  - STABLE_REGISTRY_ROLE : Granted to StableRegistry contract — can assign stables
 *  - ELO_SYSTEM_ROLE    : Granted to EloSystem contract — can update ELO ratings
 *  - BOUNTY_ROUND_ROLE  : Granted to BountyRound contract — can record round results
 */
contract ArenaRegistry is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════════════
    //  CONSTANTS & ROLES
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Role for operational configuration (fee setting, etc.)
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// @notice Role for the StableRegistry contract — authorised to assign stable IDs
    bytes32 public constant STABLE_REGISTRY_ROLE = keccak256("STABLE_REGISTRY_ROLE");

    /// @notice Role for the EloSystem contract — authorised to update ELO ratings
    bytes32 public constant ELO_SYSTEM_ROLE = keccak256("ELO_SYSTEM_ROLE");

    /// @notice Role for the BountyRound contract — authorised to record round results
    bytes32 public constant BOUNTY_ROUND_ROLE = keccak256("BOUNTY_ROUND_ROLE");

    /// @notice Role authorised to upgrade the contract implementation
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @dev Starting ELO for every newly registered agent
    uint16 public constant INITIAL_ELO = 1200;

    // ─── Tier ELO thresholds ───────────────────────────────────────────────
    uint16 public constant TIER_SILVER_MIN    = 1400;
    uint16 public constant TIER_GOLD_MIN      = 1600;
    uint16 public constant TIER_DIAMOND_MIN   = 1800;
    uint16 public constant TIER_PROMETHEUS_MIN = 2000;

    // ─── Tier ID constants ────────────────────────────────────────────────
    uint8 public constant TIER_BRONZE    = 0;
    uint8 public constant TIER_SILVER    = 1;
    uint8 public constant TIER_GOLD      = 2;
    uint8 public constant TIER_DIAMOND   = 3;
    uint8 public constant TIER_PROMETHEUS = 4;

    // ═══════════════════════════════════════════════════════════════════════
    //  STRUCTS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice On-chain representation of a registered AI agent.
     * @param wallet           The EOA or smart-wallet that owns this agent.
     * @param metadataHash     IPFS CID (as bytes32) pointing to agent metadata JSON.
     * @param registeredAt     Unix timestamp of initial registration.
     * @param deregisteredAt   Unix timestamp of deregistration; 0 = agent is still active.
     * @param stableId         ID of the stable the agent belongs to; 0 = independent.
     * @param eloRating        Current ELO rating; initialised to INITIAL_ELO (1200).
     * @param totalWinnings    Cumulative ETH/USDC winnings (in wei-equivalent; denominated per
     *                         the currency used in each round — caller must normalise off-chain).
     * @param roundsEntered    Total number of rounds the agent has participated in.
     * @param roundsWon        Total number of rounds the agent has won.
     */
    struct Agent {
        address  wallet;
        bytes32  metadataHash;
        uint64   registeredAt;
        uint64   deregisteredAt;
        uint16   stableId;
        uint16   eloRating;
        uint256  totalWinnings;
        uint32   roundsEntered;
        uint32   roundsWon;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  STATE
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Auto-incrementing agent ID counter (starts at 1)
    uint256 public nextAgentId;

    /// @notice agentId → Agent data
    mapping(uint256 => Agent) private _agents;

    /// @notice wallet → list of agentIds owned by that wallet
    mapping(address => uint256[]) private _walletAgents;

    /// @notice agentId → owning wallet (for quick reverse lookup)
    mapping(uint256 => address) private _agentOwner;

    /// @notice ETH registration fee (in wei)
    uint256 public ethEntryFee;

    /// @notice USDC registration fee (in USDC's smallest unit, i.e. 6 decimals)
    uint256 public usdcEntryFee;

    /// @notice Address of the USDC token contract
    IERC20 public usdc;

    /// @notice Accumulated ETH fees (withdrawn by admin)
    uint256 public accumulatedEthFees;

    /// @notice Accumulated USDC fees (withdrawn by admin)
    uint256 public accumulatedUsdcFees;

    // ═══════════════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Emitted when a new agent is successfully registered.
     * @param agentId       The newly assigned agent ID.
     * @param wallet        The wallet that registered the agent.
     * @param metadataHash  IPFS CID of agent metadata.
     * @param paidWithEth   True if registration was paid in ETH; false for USDC.
     */
    event AgentRegistered(
        uint256 indexed agentId,
        address indexed wallet,
        bytes32 metadataHash,
        bool    paidWithEth
    );

    /**
     * @notice Emitted when an agent is deregistered by its owner.
     * @param agentId        The deregistered agent ID.
     * @param wallet         The owner's wallet.
     * @param deregisteredAt Unix timestamp of deregistration.
     */
    event AgentDeregistered(
        uint256 indexed agentId,
        address indexed wallet,
        uint64  deregisteredAt
    );

    /**
     * @notice Emitted when an agent's metadata hash is updated.
     * @param agentId     The agent whose metadata changed.
     * @param oldHash     Previous IPFS CID.
     * @param newHash     New IPFS CID.
     */
    event MetadataUpdated(
        uint256 indexed agentId,
        bytes32 oldHash,
        bytes32 newHash
    );

    /**
     * @notice Emitted when an agent's ELO rating is updated by the EloSystem.
     * @param agentId   The agent whose ELO changed.
     * @param oldElo    Previous ELO rating.
     * @param newElo    New ELO rating.
     * @param newTier   The tier the agent now occupies after the update.
     */
    event EloUpdated(
        uint256 indexed agentId,
        uint16  oldElo,
        uint16  newElo,
        uint8   newTier
    );

    /**
     * @notice Emitted when an agent's stable affiliation changes.
     * @param agentId    The agent whose stable changed.
     * @param oldStable  Previous stable ID (0 = was independent).
     * @param newStable  New stable ID (0 = now independent).
     */
    event StableAssigned(
        uint256 indexed agentId,
        uint16  oldStable,
        uint16  newStable
    );

    /**
     * @notice Emitted after a round result is recorded for an agent.
     * @param agentId      The agent that participated.
     * @param won          Whether the agent won.
     * @param winnings     Amount won (0 if lost).
     * @param totalWon     Cumulative winnings after this result.
     * @param roundsWon    Cumulative rounds won after this result.
     * @param roundsEntered Cumulative rounds entered after this result.
     */
    event RoundResultRecorded(
        uint256 indexed agentId,
        bool    won,
        uint256 winnings,
        uint256 totalWon,
        uint32  roundsWon,
        uint32  roundsEntered
    );

    /**
     * @notice Emitted when registration fees are updated.
     * @param newEthFee   New ETH fee in wei.
     * @param newUsdcFee  New USDC fee in USDC base units.
     */
    event EntryFeeUpdated(uint256 newEthFee, uint256 newUsdcFee);

    /**
     * @notice Emitted when accumulated ETH fees are withdrawn.
     * @param to     Recipient address.
     * @param amount Amount in wei.
     */
    event EthFeesWithdrawn(address indexed to, uint256 amount);

    /**
     * @notice Emitted when accumulated USDC fees are withdrawn.
     * @param to     Recipient address.
     * @param amount Amount in USDC base units.
     */
    event UsdcFeesWithdrawn(address indexed to, uint256 amount);

    // ═══════════════════════════════════════════════════════════════════════
    //  ERRORS
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Thrown when msg.value does not match the required ETH entry fee
    error InsufficientEthFee(uint256 sent, uint256 required);

    /// @notice Thrown when an operation references a non-existent agent ID
    error AgentNotFound(uint256 agentId);

    /// @notice Thrown when the caller is not the agent's owner wallet
    error NotAgentOwner(uint256 agentId, address caller);

    /// @notice Thrown when an operation requires the agent to be active but it isn't
    error AgentNotActive(uint256 agentId);

    /// @notice Thrown when an operation requires the agent to be inactive but it is active
    error AgentAlreadyActive(uint256 agentId);

    /// @notice Thrown when a zero address is supplied where a valid address is required
    error ZeroAddress();

    /// @notice Thrown when an ETH withdrawal fails
    error EthTransferFailed();

    /// @notice Thrown when there are no fees to withdraw
    error NothingToWithdraw();

    // ═══════════════════════════════════════════════════════════════════════
    //  MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Reverts if `agentId` does not correspond to a registered agent.
     */
    function _requireAgentExists(uint256 agentId) internal view {
        if (_agents[agentId].wallet == address(0)) revert AgentNotFound(agentId);
    }

    modifier agentExists(uint256 agentId) {
        _requireAgentExists(agentId);
        _;
    }

    /**
     * @dev Reverts if the caller is not the wallet that owns `agentId`.
     */
    function _requireAgentOwner(uint256 agentId) internal view {
        if (_agents[agentId].wallet == address(0)) revert AgentNotFound(agentId);
        if (_agents[agentId].wallet != msg.sender) revert NotAgentOwner(agentId, msg.sender);
    }

    modifier onlyAgentOwner(uint256 agentId) {
        _requireAgentOwner(agentId);
        _;
    }

    /**
     * @dev Reverts if `agentId` is deregistered (deregisteredAt != 0).
     */
    function _requireAgentActive(uint256 agentId) internal view {
        if (_agents[agentId].wallet == address(0)) revert AgentNotFound(agentId);
        if (_agents[agentId].deregisteredAt != 0) revert AgentNotActive(agentId);
    }

    modifier agentActive(uint256 agentId) {
        _requireAgentActive(agentId);
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  INITIALIZER
    // ═══════════════════════════════════════════════════════════════════════

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialises the ArenaRegistry proxy.
     * @dev Called once at deployment via the proxy. Sets up roles and fee parameters.
     * @param admin       Address granted DEFAULT_ADMIN_ROLE and UPGRADER_ROLE.
     * @param operator    Address granted OPERATOR_ROLE.
     * @param usdcToken   Address of the USDC ERC-20 token contract.
     * @param initEthFee  Initial ETH registration fee in wei.
     * @param initUsdcFee Initial USDC registration fee in USDC base units (6 decimals).
     */
    function initialize(
        address admin,
        address operator,
        address usdcToken,
        uint256 initEthFee,
        uint256 initUsdcFee
    ) external initializer {
        if (admin == address(0) || operator == address(0) || usdcToken == address(0))
            revert ZeroAddress();

        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE,      admin);
        _grantRole(OPERATOR_ROLE,      operator);

        usdc         = IERC20(usdcToken);
        ethEntryFee  = initEthFee;
        usdcEntryFee = initUsdcFee;

        // Agent IDs start at 1 (0 is reserved as "null")
        nextAgentId = 1;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Register a new AI agent by paying the ETH entry fee.
     * @dev Protected by ReentrancyGuard. Emits {AgentRegistered}.
     * @param metadataHash IPFS CID (packed into bytes32) pointing to agent JSON metadata.
     * @return agentId     The newly assigned agent ID.
     */
    // forge-lint: disable-next-line(mixed-case-function) public API, renaming would break callers
    function registerWithETH(bytes32 metadataHash)
        external
        payable
        nonReentrant
        returns (uint256 agentId)
    {
        if (msg.value < ethEntryFee) revert InsufficientEthFee(msg.value, ethEntryFee);

        agentId = _createAgent(msg.sender, metadataHash);

        accumulatedEthFees += msg.value;

        emit AgentRegistered(agentId, msg.sender, metadataHash, true);
    }

    /**
     * @notice Register a new AI agent by paying the USDC entry fee.
     * @dev Caller must have approved this contract for at least `usdcEntryFee` USDC.
     *      Protected by ReentrancyGuard. Emits {AgentRegistered}.
     * @param metadataHash IPFS CID (packed into bytes32) pointing to agent JSON metadata.
     * @return agentId     The newly assigned agent ID.
     */
    // forge-lint: disable-next-line(mixed-case-function) public API, renaming would break callers
    function registerWithUSDC(bytes32 metadataHash)
        external
        nonReentrant
        returns (uint256 agentId)
    {
        usdc.safeTransferFrom(msg.sender, address(this), usdcEntryFee);

        agentId = _createAgent(msg.sender, metadataHash);

        accumulatedUsdcFees += usdcEntryFee;

        emit AgentRegistered(agentId, msg.sender, metadataHash, false);
    }

    /**
     * @notice Deregister an active agent, effectively retiring it from the Arena.
     * @dev Only the agent's owner wallet may call this. A deregistered agent cannot
     *      participate in future rounds but its historical data is preserved on-chain.
     *      Emits {AgentDeregistered}.
     * @param agentId The ID of the agent to deregister.
     */
    function deregister(uint256 agentId)
        external
        onlyAgentOwner(agentId)
        agentActive(agentId)
    {
        uint64 ts = uint64(block.timestamp);
        _agents[agentId].deregisteredAt = ts;

        emit AgentDeregistered(agentId, msg.sender, ts);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  AGENT MANAGEMENT (owner-callable)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Update the IPFS metadata pointer for an active agent.
     * @dev Only the agent owner may call this. The agent must be active.
     *      Emits {MetadataUpdated}.
     * @param agentId The ID of the agent to update.
     * @param newHash New IPFS CID (bytes32).
     */
    function updateMetadata(uint256 agentId, bytes32 newHash)
        external
        onlyAgentOwner(agentId)
        agentActive(agentId)
    {
        bytes32 oldHash = _agents[agentId].metadataHash;
        _agents[agentId].metadataHash = newHash;

        emit MetadataUpdated(agentId, oldHash, newHash);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  OPERATOR FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Update the ETH and USDC registration entry fees.
     * @dev Restricted to OPERATOR_ROLE. Emits {EntryFeeUpdated}.
     * @param ethFee  New ETH fee in wei.
     * @param usdcFee New USDC fee in USDC base units (6 decimals).
     */
    function setEntryFee(uint256 ethFee, uint256 usdcFee)
        external
        onlyRole(OPERATOR_ROLE)
    {
        ethEntryFee  = ethFee;
        usdcEntryFee = usdcFee;

        emit EntryFeeUpdated(ethFee, usdcFee);
    }

    /**
     * @notice Withdraw accumulated ETH registration fees to a recipient address.
     * @dev Restricted to DEFAULT_ADMIN_ROLE. Emits {EthFeesWithdrawn}.
     * @param to Recipient address for the ETH.
     */
    function withdrawEthFees(address to)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = accumulatedEthFees;
        if (amount == 0) revert NothingToWithdraw();

        accumulatedEthFees = 0;

        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();

        emit EthFeesWithdrawn(to, amount);
    }

    /**
     * @notice Withdraw accumulated USDC registration fees to a recipient address.
     * @dev Restricted to DEFAULT_ADMIN_ROLE. Emits {UsdcFeesWithdrawn}.
     * @param to Recipient address for the USDC.
     */
    function withdrawUsdcFees(address to)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = accumulatedUsdcFees;
        if (amount == 0) revert NothingToWithdraw();

        accumulatedUsdcFees = 0;
        usdc.safeTransfer(to, amount);

        emit UsdcFeesWithdrawn(to, amount);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  SYSTEM-CALLABLE FUNCTIONS (restricted roles)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Assign or update the stable affiliation for an agent.
     * @dev Restricted to STABLE_REGISTRY_ROLE. The agent must be active.
     *      Pass stableId = 0 to mark the agent as independent.
     *      Emits {StableAssigned}.
     * @param agentId  The agent to update.
     * @param stableId The new stable ID (0 = independent).
     */
    function setStable(uint256 agentId, uint16 stableId)
        external
        onlyRole(STABLE_REGISTRY_ROLE)
        agentActive(agentId)
    {
        uint16 oldStable = _agents[agentId].stableId;
        _agents[agentId].stableId = stableId;

        emit StableAssigned(agentId, oldStable, stableId);
    }

    /**
     * @notice Update an agent's ELO rating after a match resolution.
     * @dev Restricted to ELO_SYSTEM_ROLE. The agent must be active.
     *      Emits {EloUpdated} with the new tier.
     * @param agentId The agent whose ELO changes.
     * @param newElo  The computed new ELO value.
     */
    function updateElo(uint256 agentId, uint16 newElo)
        external
        onlyRole(ELO_SYSTEM_ROLE)
        agentActive(agentId)
    {
        uint16 oldElo = _agents[agentId].eloRating;
        _agents[agentId].eloRating = newElo;

        uint8 tier = _computeTier(newElo);
        emit EloUpdated(agentId, oldElo, newElo, tier);
    }

    /**
     * @notice Record the outcome of a round for an agent.
     * @dev Restricted to BOUNTY_ROUND_ROLE. The agent must be active.
     *      Winnings are added cumulatively in their raw unit (normalise off-chain).
     *      Emits {RoundResultRecorded}.
     * @param agentId  The participating agent.
     * @param won      True if the agent won the round.
     * @param winnings Amount won; must be 0 when `won` is false.
     */
    function recordRoundResult(uint256 agentId, bool won, uint256 winnings)
        external
        onlyRole(BOUNTY_ROUND_ROLE)
        agentActive(agentId)
    {
        Agent storage agent = _agents[agentId];

        // Unchecked: counters are uint32 / uint256, overflow is astronomically unlikely
        unchecked {
            agent.roundsEntered += 1;
            if (won) {
                agent.roundsWon     += 1;
                agent.totalWinnings += winnings;
            }
        }

        emit RoundResultRecorded(
            agentId,
            won,
            winnings,
            agent.totalWinnings,
            agent.roundsWon,
            agent.roundsEntered
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Check whether an agent is currently active (not deregistered).
     * @param agentId The agent to query.
     * @return True if the agent exists and has not been deregistered.
     */
    function isActive(uint256 agentId) external view returns (bool) {
        Agent storage agent = _agents[agentId];
        return agent.wallet != address(0) && agent.deregisteredAt == 0;
    }

    /**
     * @notice Determine the tier of an agent based on its current ELO.
     * @param agentId The agent to query.
     * @return tier 0=Bronze, 1=Silver, 2=Gold, 3=Diamond, 4=Prometheus.
     */
    function getTier(uint256 agentId)
        external
        view
        agentExists(agentId)
        returns (uint8 tier)
    {
        return _computeTier(_agents[agentId].eloRating);
    }

    /**
     * @notice Retrieve the full Agent struct for a given agent ID.
     * @param agentId The agent to query.
     * @return agent The complete Agent struct (memory copy).
     */
    function getAgent(uint256 agentId)
        external
        view
        agentExists(agentId)
        returns (Agent memory agent)
    {
        return _agents[agentId];
    }

    /**
     * @notice Get all agent IDs registered by a specific wallet.
     * @param wallet The wallet address to query.
     * @return agentIds Array of agent IDs owned by `wallet`.
     */
    function getAgentsByWallet(address wallet)
        external
        view
        returns (uint256[] memory agentIds)
    {
        return _walletAgents[wallet];
    }

    /**
     * @notice Get the current tier label string for a raw ELO value.
     * @dev Useful for off-chain clients / indexers that want a string label.
     * @param elo The ELO value to classify.
     * @return The human-readable tier name.
     */
    function tierName(uint16 elo) external pure returns (string memory) {
        uint8 tier = _computeTier(elo);
        if (tier == TIER_PROMETHEUS) return "Prometheus";
        if (tier == TIER_DIAMOND)    return "Diamond";
        if (tier == TIER_GOLD)       return "Gold";
        if (tier == TIER_SILVER)     return "Silver";
        return "Bronze";
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Shared agent creation logic used by both registration functions.
     * @param wallet       The registering wallet.
     * @param metadataHash IPFS CID hash.
     * @return agentId     The newly minted agent ID.
     */
    function _createAgent(address wallet, bytes32 metadataHash)
        internal
        returns (uint256 agentId)
    {
        agentId = nextAgentId;

        _agents[agentId] = Agent({
            wallet:          wallet,
            metadataHash:    metadataHash,
            registeredAt:    uint64(block.timestamp),
            deregisteredAt:  0,
            stableId:        0,
            eloRating:       INITIAL_ELO,
            totalWinnings:   0,
            roundsEntered:   0,
            roundsWon:       0
        });

        _agentOwner[agentId] = wallet;
        _walletAgents[wallet].push(agentId);

        unchecked { nextAgentId = agentId + 1; }
    }

    /**
     * @dev Pure function that maps an ELO value to a tier constant.
     * @param elo The ELO rating to classify.
     * @return    The corresponding TIER_* constant.
     */
    function _computeTier(uint16 elo) internal pure returns (uint8) {
        if (elo >= TIER_PROMETHEUS_MIN) return TIER_PROMETHEUS;
        if (elo >= TIER_DIAMOND_MIN)    return TIER_DIAMOND;
        if (elo >= TIER_GOLD_MIN)       return TIER_GOLD;
        if (elo >= TIER_SILVER_MIN)     return TIER_SILVER;
        return TIER_BRONZE;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  UUPS UPGRADE AUTHORISATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Restricts implementation upgrades to addresses holding UPGRADER_ROLE.
     *      Called internally by the UUPS proxy upgrade mechanism.
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    // ═══════════════════════════════════════════════════════════════════════
    //  RECEIVE / FALLBACK (reject accidental ETH)
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev Reject plain ETH transfers that don't go through registerWithETH
    receive() external payable {
        revert("Use registerWithETH");
    }
}
