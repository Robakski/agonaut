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
 *  ███████╗████████╗ █████╗ ██████╗ ██╗     ███████╗
 *  ██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██║     ██╔════╝
 *  ███████╗   ██║   ███████║██████╔╝██║     █████╗
 *  ╚════██║   ██║   ██╔══██║██╔══██╗██║     ██╔══╝
 *  ███████║   ██║   ██║  ██║██████╔╝███████╗███████╗
 *  ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝
 *
 *  ██████╗ ███████╗ ██████╗ ██╗███████╗████████╗██████╗ ██╗   ██╗
 *  ██╔══██╗██╔════╝██╔════╝ ██║██╔════╝╚══██╔══╝██╔══██╗╚██╗ ██╔╝
 *  ██████╔╝█████╗  ██║  ███╗██║███████╗   ██║   ██████╔╝ ╚████╔╝
 *  ██╔══██╗██╔══╝  ██║   ██║██║╚════██║   ██║   ██╔══██╗  ╚██╔╝
 *  ██║  ██║███████╗╚██████╔╝██║███████║   ██║   ██║  ██║   ██║
 *  ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝
 */

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Constants} from "./Constants.sol";

// ─── Minimal ArenaRegistry interface ─────────────────────────────────────────
interface IArenaRegistry {
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

    function getAgent(uint256 agentId) external view returns (Agent memory);
    function isActive(uint256 agentId) external view returns (bool);
    function setStable(uint256 agentId, uint16 stableId) external;
}

/**
 * @title StableRegistry
 * @author Agonaut
 * @notice Manages Stables — human-led teams that oversee portfolios of AI agents and
 *         earn a configurable revenue share from their agents' prize winnings.
 *
 * @dev UUPS upgradeable contract (OZ 5.x). Key role architecture:
 *
 *   DEFAULT_ADMIN_ROLE  – Protocol multisig; can grant/revoke all roles.
 *   UPGRADER_ROLE       – Authorised to upgrade the proxy implementation.
 *   OPERATOR_ROLE       – Operational control (arenaRegistry pointer, etc.).
 *   BOUNTY_ROUND_ROLE   – Granted to BountyRound; calls distributeRevenue().
 *
 * Revenue flow:
 *   1. BountyRound resolves a round and sends the agent's prize ETH here.
 *   2. distributeRevenue() splits the prize: stable share → stable owner,
 *      remainder → returned to BountyRound (who forwards it to the agent owner).
 *
 * Agent linking:
 *   To link an agent, the caller must own *both* the stable and the agent
 *   (msg.sender == stable.owner AND msg.sender == agent.wallet). This avoids
 *   a separate on-chain approval mechanism while preserving security.
 */
contract StableRegistry is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable
{
    // ═══════════════════════════════════════════════════════════════════════
    //  CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Maximum revenue share a stable may claim (50 %).
    uint16 public constant MAX_REVENUE_SHARE_BPS = 5000;

    /// @notice BPS denominator — 10 000 = 100 %.
    uint16 public constant BPS_DENOMINATOR = 10_000;

    // ═══════════════════════════════════════════════════════════════════════
    //  STRUCTS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice On-chain representation of a Stable.
     *
     * @param owner            EOA / smart-wallet that controls this stable.
     * @param name             Human-readable display name (arbitrary UTF-8 string).
     * @param metadataHash     IPFS CID (packed into bytes32) pointing to a metadata JSON.
     * @param revenueShareBps  Basis-point cut taken from agent winnings (max 5 000 = 50 %).
     * @param createdAt        Unix timestamp of stable creation.
     * @param active           Whether the stable is currently accepting agents and revenue.
     * @param totalEarnings    Cumulative ETH (in wei) distributed to the stable owner.
     */
    struct Stable {
        address owner;
        string  name;
        bytes32 metadataHash;
        uint16  revenueShareBps;
        uint64  createdAt;
        bool    active;
        uint256 totalEarnings;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  STATE
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Address of the ArenaRegistry contract used to verify agent ownership.
    address public arenaRegistry;

    /// @notice Auto-incrementing stable ID counter; starts at 1 (0 = "no stable").
    uint16 public nextStableId;

    /// @notice stableId → Stable data.
    mapping(uint16 => Stable) public stables;

    /// @notice stableId → ordered list of agent IDs managed by that stable.
    mapping(uint16 => uint256[]) public stableAgents;

    /// @dev agentId → stableId (0 = agent is independent).
    mapping(uint256 => uint16) private _agentStable;

    /// @dev agentId → index in stableAgents[stableId] array (1-indexed; 0 = not linked).
    ///      Used for O(1) swap-and-pop removal.
    mapping(uint256 => uint256) private _agentIndexInStable;

    // ═══════════════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Emitted when a new stable is created.
     * @param stableId       The newly assigned stable ID.
     * @param owner          The wallet that created and owns the stable.
     * @param name           Display name of the stable.
     * @param metadataHash   IPFS CID of the stable metadata.
     * @param revenueShareBps Initial revenue share in basis points.
     */
    event StableCreated(
        uint16  indexed stableId,
        address indexed owner,
        string          name,
        bytes32         metadataHash,
        uint16          revenueShareBps
    );

    /**
     * @notice Emitted when an agent is linked to a stable.
     * @param stableId The stable receiving the agent.
     * @param agentId  The agent being linked.
     * @param owner    The wallet that performed the link (must own both).
     */
    event AgentLinked(
        uint16  indexed stableId,
        uint256 indexed agentId,
        address indexed owner
    );

    /**
     * @notice Emitted when an agent is unlinked from a stable.
     * @param stableId The stable that held the agent.
     * @param agentId  The agent being unlinked.
     */
    event AgentUnlinked(
        uint16  indexed stableId,
        uint256 indexed agentId
    );

    /**
     * @notice Emitted when revenue is distributed after a round payout.
     * @param stableId      The stable receiving the cut.
     * @param agentId       The agent whose prize was split.
     * @param totalPrize    Total prize amount in wei.
     * @param stableShare   Amount (wei) sent to the stable owner.
     * @param remainder     Amount (wei) returned to BountyRound for the agent owner.
     */
    event RevenueDistributed(
        uint16  indexed stableId,
        uint256 indexed agentId,
        uint256         totalPrize,
        uint256         stableShare,
        uint256         remainder
    );

    /**
     * @notice Emitted when a stable is deactivated by its owner.
     * @param stableId The deactivated stable ID.
     */
    event StableDeactivated(uint16 indexed stableId);

    /**
     * @notice Emitted when a stable's IPFS metadata pointer is updated.
     * @param stableId The stable whose metadata changed.
     * @param oldHash  Previous IPFS CID.
     * @param newHash  New IPFS CID.
     */
    event MetadataUpdated(
        uint16  indexed stableId,
        bytes32         oldHash,
        bytes32         newHash
    );

    /**
     * @notice Emitted when a stable's revenue share is updated.
     * @param stableId The stable whose share changed.
     * @param oldBps   Previous basis-point share.
     * @param newBps   New basis-point share.
     */
    event RevenueShareUpdated(
        uint16  indexed stableId,
        uint16          oldBps,
        uint16          newBps
    );

    /**
     * @notice Emitted when the ArenaRegistry address is updated by an operator.
     * @param oldRegistry Previous ArenaRegistry address.
     * @param newRegistry New ArenaRegistry address.
     */
    event ArenaRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);

    // ═══════════════════════════════════════════════════════════════════════
    //  ERRORS
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice The supplied address is the zero address.
    error ZeroAddress();

    /// @notice Stable does not exist (stableId has never been created).
    error StableNotFound(uint16 stableId);

    /// @notice Caller is not the owner of the specified stable.
    error NotStableOwner(uint16 stableId, address caller);

    /// @notice The stable has been deactivated and cannot accept new operations.
    error StableInactive(uint16 stableId);

    /// @notice Requested revenue share exceeds MAX_REVENUE_SHARE_BPS (50 %).
    error RevenueShareTooHigh(uint16 requested, uint16 max);

    /// @notice Agent does not exist in ArenaRegistry or has been deregistered.
    error AgentNotActive(uint256 agentId);

    /// @notice Caller must own both the stable and the agent to link them.
    error NotAgentOwner(uint256 agentId, address caller);

    /// @notice The agent is already linked to a stable.
    error AgentAlreadyLinked(uint256 agentId, uint16 existingStableId);

    /// @notice The agent is not currently linked to this stable.
    error AgentNotLinkedToStable(uint256 agentId, uint16 stableId);

    /// @notice msg.value does not match totalPrize during distributeRevenue.
    error PrizeMismatch(uint256 sent, uint256 expected);

    /// @notice A native ETH transfer failed.
    error EthTransferFailed();

    /// @notice nextStableId would overflow uint16.
    error StableIdOverflow();

    /// @notice Provided name is empty.
    error EmptyName();

    // ═══════════════════════════════════════════════════════════════════════
    //  MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Reverts if `stableId` has not been created yet.
     */
    function _requireStableExists(uint16 stableId) internal view {
        if (stables[stableId].owner == address(0)) revert StableNotFound(stableId);
    }

    modifier stableExists(uint16 stableId) {
        _requireStableExists(stableId);
        _;
    }

    /**
     * @dev Reverts if the caller is not the stable owner.
     */
    function _requireOnlyStableOwner(uint16 stableId) internal view {
        if (stables[stableId].owner == address(0)) revert StableNotFound(stableId);
        if (stables[stableId].owner != msg.sender) revert NotStableOwner(stableId, msg.sender);
    }

    modifier onlyStableOwner(uint16 stableId) {
        _requireOnlyStableOwner(stableId);
        _;
    }

    /**
     * @dev Reverts if the stable is not active.
     */
    function _requireStableIsActive(uint16 stableId) internal view {
        if (stables[stableId].owner == address(0)) revert StableNotFound(stableId);
        if (!stables[stableId].active) revert StableInactive(stableId);
    }

    modifier stableIsActive(uint16 stableId) {
        _requireStableIsActive(stableId);
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
     * @notice Initialises the StableRegistry proxy.
     * @dev Called exactly once via the UUPS proxy at deployment.
     *
     * @param admin_         Address granted DEFAULT_ADMIN_ROLE and UPGRADER_ROLE.
     * @param operator_      Address granted OPERATOR_ROLE.
     * @param arenaRegistry_ Address of the deployed ArenaRegistry contract.
     */
    function initialize(
        address admin_,
        address operator_,
        address arenaRegistry_
    ) external initializer {
        if (admin_ == address(0) || operator_ == address(0) || arenaRegistry_ == address(0)) {
            revert ZeroAddress();
        }

        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE,       admin_);
        _grantRole(Constants.UPGRADER_ROLE,  admin_);
        _grantRole(Constants.OPERATOR_ROLE,  operator_);

        arenaRegistry = arenaRegistry_;

        // Stable IDs start at 1; 0 is reserved as the "no stable" sentinel.
        nextStableId = 1;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  STABLE LIFECYCLE
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Create a new Stable. Anyone may call this.
     * @dev Stable IDs are assigned sequentially from 1. Emits {StableCreated}.
     *
     * @param name             Human-readable display name (non-empty).
     * @param metadataHash     IPFS CID (bytes32) of the stable metadata JSON.
     * @param revenueShareBps  Percentage of agent winnings taken by the stable, in BPS.
     *                         Must not exceed 5 000 (50 %).
     * @return stableId        The newly assigned stable ID.
     */
    function createStable(
        string calldata name,
        bytes32         metadataHash,
        uint16          revenueShareBps
    ) external returns (uint16 stableId) {
        if (bytes(name).length == 0) revert EmptyName();
        if (revenueShareBps > MAX_REVENUE_SHARE_BPS) {
            revert RevenueShareTooHigh(revenueShareBps, MAX_REVENUE_SHARE_BPS);
        }
        if (nextStableId == type(uint16).max) revert StableIdOverflow();

        stableId = nextStableId;
        unchecked { nextStableId = stableId + 1; }

        stables[stableId] = Stable({
            owner:            msg.sender,
            name:             name,
            metadataHash:     metadataHash,
            revenueShareBps:  revenueShareBps,
            createdAt:        uint64(block.timestamp),
            active:           true,
            totalEarnings:    0
        });

        emit StableCreated(stableId, msg.sender, name, metadataHash, revenueShareBps);
    }

    /**
     * @notice Permanently deactivate a stable.
     * @dev Only the stable owner may call this. A deactivated stable stops
     *      earning revenue and cannot have agents linked to it, but its
     *      historical data is preserved. Emits {StableDeactivated}.
     *
     * @param stableId The ID of the stable to deactivate.
     */
    function deactivateStable(uint16 stableId)
        external
        onlyStableOwner(stableId)
    {
        if (!stables[stableId].active) revert StableInactive(stableId);

        stables[stableId].active = false;

        emit StableDeactivated(stableId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  AGENT MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Link an agent to this stable.
     * @dev The caller (msg.sender) must be the stable owner AND the agent's registered
     *      wallet in ArenaRegistry. This dual-ownership requirement removes the need
     *      for a separate on-chain approval step.
     *
     *      The stable must be active. The agent must be active and not already linked
     *      to any stable. After linking, ArenaRegistry is updated via setStable().
     *      Emits {AgentLinked}.
     *
     * @param stableId The stable to link the agent to.
     * @param agentId  The agent to link.
     */
    function linkAgent(uint16 stableId, uint256 agentId)
        external
        stableIsActive(stableId)
    {
        Stable storage stable = stables[stableId];

        // Caller must own the stable.
        if (stable.owner != msg.sender) revert NotStableOwner(stableId, msg.sender);

        // Agent must be active in ArenaRegistry.
        IArenaRegistry registry = IArenaRegistry(arenaRegistry);
        if (!registry.isActive(agentId)) revert AgentNotActive(agentId);

        // Caller must also own the agent (prevents linking other users' agents).
        IArenaRegistry.Agent memory agent = registry.getAgent(agentId);
        if (agent.wallet != msg.sender) revert NotAgentOwner(agentId, msg.sender);

        // Agent must not already belong to a stable.
        if (_agentStable[agentId] != 0) {
            revert AgentAlreadyLinked(agentId, _agentStable[agentId]);
        }

        // Record the link in local state.
        uint256[] storage agents = stableAgents[stableId];
        agents.push(agentId);
        _agentIndexInStable[agentId] = agents.length; // 1-indexed
        _agentStable[agentId] = stableId;

        // Notify ArenaRegistry so the agent's stableId field is consistent.
        registry.setStable(agentId, stableId);

        emit AgentLinked(stableId, agentId, msg.sender);
    }

    /**
     * @notice Remove an agent from this stable.
     * @dev Only the stable owner may call this. Uses swap-and-pop for O(1) removal
     *      from the `stableAgents` array. ArenaRegistry is updated to clear the
     *      agent's stableId. Emits {AgentUnlinked}.
     *
     * @param stableId The stable the agent currently belongs to.
     * @param agentId  The agent to unlink.
     */
    function unlinkAgent(uint16 stableId, uint256 agentId)
        external
        onlyStableOwner(stableId)
    {
        // Verify the agent is actually linked to this stable.
        if (_agentStable[agentId] != stableId) {
            revert AgentNotLinkedToStable(agentId, stableId);
        }

        _removeAgentFromStable(stableId, agentId);

        // Clear stableId on ArenaRegistry (set to 0 = independent).
        // Only call if agent is still active; a deregistered agent's record is read-only.
        IArenaRegistry registry = IArenaRegistry(arenaRegistry);
        if (registry.isActive(agentId)) {
            registry.setStable(agentId, 0);
        }

        emit AgentUnlinked(stableId, agentId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  REVENUE DISTRIBUTION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Split a prize payout between the stable and the remaining agent share.
     * @dev Called exclusively by BountyRound (BOUNTY_ROUND_ROLE) during prize payout.
     *      The caller must forward exactly `totalPrize` wei with the call.
     *
     *      Calculation:
     *        stableShare = totalPrize * revenueShareBps / BPS_DENOMINATOR
     *        remainder   = totalPrize - stableShare
     *
     *      The stable's share is transferred to the stable owner immediately.
     *      The remainder is transferred back to msg.sender (BountyRound) so it
     *      can be forwarded to the agent owner in the same transaction.
     *
     *      If the stable is inactive at payout time (e.g. deactivated after the
     *      round started), the full prize is returned to BountyRound as remainder
     *      and totalEarnings is not updated.
     *
     *      Protected by ReentrancyGuard. Emits {RevenueDistributed}.
     *
     * @param stableId   The stable entitled to a revenue cut.
     * @param agentId    The agent whose prize is being split (used for event indexing).
     * @param totalPrize Total prize amount in wei (must equal msg.value).
     * @return remainder The amount in wei returned to BountyRound for the agent owner.
     */
    function distributeRevenue(
        uint16  stableId,
        uint256 agentId,
        uint256 totalPrize
    )
        external
        payable
        nonReentrant
        onlyRole(Constants.BOUNTY_ROUND_ROLE)
        stableExists(stableId)
        returns (uint256 remainder)
    {
        if (msg.value != totalPrize) revert PrizeMismatch(msg.value, totalPrize);

        Stable storage stable = stables[stableId];
        uint256 stableShare;

        if (stable.active && stable.revenueShareBps > 0) {
            // Calculate using full precision; truncation favours the agent owner.
            stableShare = (totalPrize * stable.revenueShareBps) / BPS_DENOMINATOR;
            remainder   = totalPrize - stableShare;

            // Update cumulative earnings before external calls (CEI pattern).
            stable.totalEarnings += stableShare;

            // Transfer stable's cut to the stable owner.
            _sendEth(stable.owner, stableShare);
        } else {
            // Stable inactive or 0 % share — entire prize goes back as remainder.
            stableShare = 0;
            remainder   = totalPrize;
        }

        // Return remainder to BountyRound for agent-owner payout.
        if (remainder > 0) {
            _sendEth(msg.sender, remainder);
        }

        emit RevenueDistributed(stableId, agentId, totalPrize, stableShare, remainder);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  CONFIGURATION (stable owner)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Update the IPFS metadata pointer for a stable.
     * @dev Only the stable owner may call this. Emits {MetadataUpdated}.
     *
     * @param stableId The stable to update.
     * @param newHash  New IPFS CID (bytes32).
     */
    function updateMetadata(uint16 stableId, bytes32 newHash)
        external
        onlyStableOwner(stableId)
    {
        bytes32 oldHash = stables[stableId].metadataHash;
        stables[stableId].metadataHash = newHash;

        emit MetadataUpdated(stableId, oldHash, newHash);
    }

    /// @notice Revenue share is immutable — set at stable creation, cannot be changed.
    /// @dev This prevents stable owners from rugging agents by increasing the cut
    ///      after agents have joined and built reputation within the stable.
    ///      If a stable owner wants a different revenue share, they must create a new stable.
    ///      See INVARIANTS.md INV-6.3.

    // ═══════════════════════════════════════════════════════════════════════
    //  OPERATOR FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Update the ArenaRegistry contract address.
     * @dev Restricted to OPERATOR_ROLE. Use with caution — changing this address
     *      during operation may cause inconsistencies. Emits {ArenaRegistryUpdated}.
     *
     * @param newRegistry Address of the new ArenaRegistry deployment.
     */
    function setArenaRegistry(address newRegistry)
        external
        onlyRole(Constants.OPERATOR_ROLE)
    {
        if (newRegistry == address(0)) revert ZeroAddress();
        address old = arenaRegistry;
        arenaRegistry = newRegistry;
        emit ArenaRegistryUpdated(old, newRegistry);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Retrieve the full Stable struct for a given stable ID.
     * @param stableId The stable to query.
     * @return The complete Stable struct (memory copy).
     */
    function getStable(uint16 stableId)
        external
        view
        stableExists(stableId)
        returns (Stable memory)
    {
        return stables[stableId];
    }

    /**
     * @notice Return only the owner and revenue share for a stable.
     * @dev Added to provide a clean ABI-safe interface for BountyRound, which
     *      needs only these two fields. The full `getStable()` returns a struct
     *      containing a dynamic `string name`, making tuple-style decoding unsafe.
     * @param stableId The stable to query.
     * @return owner The stable owner address.
     * @return revenueShareBps Revenue share in basis points.
     */
    function getStableShare(uint16 stableId)
        external
        view
        stableExists(stableId)
        returns (address owner, uint16 revenueShareBps)
    {
        Stable storage s = stables[stableId];
        return (s.owner, s.revenueShareBps);
    }

    /**
     * @notice Get all agent IDs currently managed by a stable.
     * @param stableId The stable to query.
     * @return Array of agent IDs in the order they were linked.
     */
    function getStableAgents(uint16 stableId)
        external
        view
        stableExists(stableId)
        returns (uint256[] memory)
    {
        return stableAgents[stableId];
    }

    /**
     * @notice Get the stable ID an agent belongs to.
     * @param agentId The agent to query.
     * @return The stable ID, or 0 if the agent is not linked to any stable.
     */
    function getAgentStable(uint256 agentId) external view returns (uint16) {
        return _agentStable[agentId];
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Remove an agent from a stable's agent list using swap-and-pop (O(1)).
     *      Clears the agent's stable assignment in local state.
     */
    function _removeAgentFromStable(uint16 stableId, uint256 agentId) internal {
        uint256[] storage agents = stableAgents[stableId];
        uint256 idx = _agentIndexInStable[agentId]; // 1-indexed
        uint256 lastIdx = agents.length;             // 1-indexed position of last element

        if (idx != lastIdx) {
            // Swap with the last element.
            uint256 lastAgentId = agents[lastIdx - 1];
            agents[idx - 1]                   = lastAgentId;
            _agentIndexInStable[lastAgentId]  = idx;
        }

        agents.pop();

        // Clear agent's stable tracking.
        delete _agentIndexInStable[agentId];
        delete _agentStable[agentId];
    }

    /**
     * @dev Send `amount` wei to `to`, reverting on failure.
     */
    function _sendEth(address to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  UUPS UPGRADE AUTHORISATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Only addresses holding UPGRADER_ROLE may upgrade the implementation.
     *      Called internally by the UUPS proxy mechanism.
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(Constants.UPGRADER_ROLE)
    {}

    // ═══════════════════════════════════════════════════════════════════════
    //  RECEIVE / FALLBACK (reject unintended ETH)
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev Reject plain ETH transfers. Revenue must arrive via distributeRevenue().
    receive() external payable {
        revert("Use distributeRevenue");
    }
}
