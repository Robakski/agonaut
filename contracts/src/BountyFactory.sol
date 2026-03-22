// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/*
 * ██████╗  ██████╗ ██╗   ██╗███╗   ██╗████████╗██╗   ██╗    ███████╗ █████╗  ██████╗████████╗ ██████╗ ██████╗ ██╗   ██╗
 * ██╔══██╗██╔═══██╗██║   ██║████╗  ██║╚══██╔══╝╚██╗ ██╔╝    ██╔════╝██╔══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗╚██╗ ██╔╝
 * ██████╔╝██║   ██║██║   ██║██╔██╗ ██║   ██║    ╚████╔╝     █████╗  ███████║██║        ██║   ██║   ██║██████╔╝ ╚████╔╝
 * ██╔══██╗██║   ██║██║   ██║██║╚██╗██║   ██║     ╚██╔╝      ██╔══╝  ██╔══██║██║        ██║   ██║   ██║██╔══██╗  ╚██╔╝
 * ██████╔╝╚██████╔╝╚██████╔╝██║ ╚████║   ██║      ██║       ██║     ██║  ██║╚██████╗   ██║   ╚██████╔╝██║  ██║   ██║
 * ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝   ╚═╝      ╚═╝       ╚═╝     ╚═╝  ╚═╝ ╚═════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝   ╚═╝
 */

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {Constants} from "./Constants.sol";

// ═══════════════════════════════════════════════════════════════════════════════
//  INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/// @title IBountyRound
/// @notice Minimal interface for initializing a newly cloned BountyRound instance.
interface IBountyRound {
    function initialize(
        uint256 _bountyId,
        uint256 _roundIndex,
        address _factory,
        address[6] memory _contracts,
        bytes32 _problemCid,
        uint256 _entryFee,
        uint32 _commitDuration,
        uint16[] memory _prizeDistribution,
        uint16 _protocolFeeBps,
        uint8 _maxAgents,
        uint8 _requiredTier,
        uint256 _seasonId,
        uint16 _acceptanceThreshold,
        bool _graduatedPayouts,
        address _sponsor
    ) external;
    function startCommitPhase() external;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  BOUNTY FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @title BountyFactory
 * @author Agonaut
 * @notice Creates bounty configurations and deploys individual BountyRound instances
 *         as gas-efficient EIP-1167 minimal clones via CREATE2.
 *
 * @dev Architecture overview
 *      ┌─────────────────────────────────────────────────────────────────────┐
 *      │  BountyFactory  (UUPS upgradeable, AccessControl)                   │
 *      │                                                                     │
 *      │  createBounty()  ──stores──►  bounties[id]  (BountyConfig)          │
 *      │  spawnRound()    ──clones──►  BountyRound clone (EIP-1167 / CREATE2) │
 *      └─────────────────────────────────────────────────────────────────────┘
 *
 * Role matrix
 * ─────────────────────────────────────────────────────────────────────────────
 *  DEFAULT_ADMIN_ROLE   │ Protocol multisig – grants / revokes all roles
 *  OPERATOR_ROLE        │ Operational knobs (set impl, set addresses, deactivate)
 *  BOUNTY_CREATOR_ROLE  │ Can create bounties and spawn rounds
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Upgrade authority is gated by UPGRADER_ROLE (see {_authorizeUpgrade}).
 *
 * Invariants
 *  • nextBountyId is monotonically increasing and starts at 1.
 *  • A BountyConfig.prizeDistribution always sums to exactly 10 000 bps.
 *  • Duration bounds are enforced by {Constants} constants.
 *  • All cloned rounds are recorded in {bountyRounds}.
 */
contract BountyFactory is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    // ─────────────────────────────────────────────────────────────────────────
    //  TYPES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Immutable configuration for a single bounty type.
     *
     * @param problemCid        IPFS CID of the problem dataset (bytes32 encoding).
     * @param entryFee           Small anti-spam fee agents pay to enter (wei).
     * @param commitDuration    Length of the commit phase in seconds.
     * @param prizeDistribution Ordered array of basis-point shares for 1st, 2nd, …
     *                          Must sum to exactly {Constants.BPS_DENOMINATOR} (10 000).
     * @param maxAgents         Hard cap on participant count; 0 means unlimited.
     * @param tier              Minimum agent tier required (0 = Bronze … 4 = Prometheus).
     * @param acceptanceThreshold Minimum normalized score (0-10000 bps) for full payout.
     * @param graduatedPayouts  Whether partial payouts are enabled below threshold.
     * @param active            Whether new rounds can still be spawned for this bounty.
     * @param createdAt         Block timestamp at creation (packed into uint64).
     * @param creator           EOA / contract that created the bounty.
     */
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

    // ─────────────────────────────────────────────────────────────────────────
    //  CUSTOM ERRORS
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Thrown when the prizeDistribution array does not sum to BPS_DENOMINATOR.
    /// @param actual The computed sum of the supplied array.
    error InvalidPrizeDistribution(uint256 actual);

    /// @notice Thrown when commitDuration is outside [MIN_COMMIT_DURATION, MAX_COMMIT_DURATION].
    /// @param provided The supplied commit duration.
    error InvalidCommitDuration(uint32 provided);

    /// @notice Thrown when the tier value exceeds the maximum tier index (4).
    /// @param tier The supplied tier value.
    error InvalidTier(uint8 tier);

    /// @notice Thrown when querying a bounty ID that does not exist.
    /// @param bountyId The queried bounty ID.
    error BountyNotFound(uint256 bountyId);

    /// @notice Thrown when attempting to spawn a round for an inactive bounty.
    /// @param bountyId The bounty ID that is inactive.
    error BountyInactive(uint256 bountyId);
    error RoundNotFound(uint256 bountyId, uint256 roundIndex);

    /// @notice Thrown when roundImplementation has not been set.
    error RoundImplementationNotSet();

    /// @notice Thrown when entryFee is outside [MIN_ENTRY_FEE, MAX_ENTRY_FEE].
    /// @param provided The supplied entry fee.
    error InvalidEntryFee(uint256 provided);

    /// @notice Thrown when acceptanceThreshold is outside allowed range.
    /// @param provided The supplied threshold.
    error InvalidAcceptanceThreshold(uint16 provided);
    /// @dev maxAgents exceeds MAX_AGENTS_PER_ROUND (gas safety).
    error InvalidMaxAgents(uint8 provided);

    /// @notice Thrown when any required contract address is the zero address.
    /// @param name A short label identifying which address is missing.
    error ZeroAddress(string name);

    /// @notice Thrown when a round index is out of bounds for the given bounty.
    /// @param bountyId   The bounty ID.
    /// @param roundIndex The out-of-bounds index.
    error RoundIndexOutOfBounds(uint256 bountyId, uint256 roundIndex);

    // ─────────────────────────────────────────────────────────────────────────
    //  EVENTS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when a new bounty configuration is registered.
     * @param bountyId  The assigned bounty ID (monotonically increasing from 1).
     * @param creator   The address that created the bounty.
     * @param problemCid IPFS CID of the problem dataset.
     */
    event BountyCreated(
        uint256 indexed bountyId,
        address indexed creator,
        bytes32         problemCid
    );

    /**
     * @notice Emitted when a bounty is deactivated (no new rounds may be spawned).
     * @param bountyId The deactivated bounty ID.
     * @param operator The address that triggered deactivation.
     */
    event BountyDeactivated(uint256 indexed bountyId, address indexed operator);

    /**
     * @notice Emitted when a new BountyRound clone is deployed.
     * @param bountyId   The parent bounty ID.
     * @param roundIndex Zero-based index of this round within the bounty.
     * @param roundAddr  Address of the deployed BountyRound clone.
     */
    event RoundSpawned(
        uint256 indexed bountyId,
        uint256 indexed roundIndex,
        address         roundAddr
    );

    /**
     * @notice Emitted when the BountyRound implementation address is updated.
     * @param oldImpl Previous implementation address.
     * @param newImpl New implementation address.
     */
    event RoundImplementationUpdated(address indexed oldImpl, address indexed newImpl);

    /**
     * @notice Emitted when any of the protocol contract addresses are updated.
     * @param arenaRegistry     New ArenaRegistry address.
     * @param eloSystem         New EloSystem address.
     * @param treasury          New Treasury address.
     * @param stableRegistry    New StableRegistry address.
     * @param seasonManager     New SeasonManager address.
     * @param arbitrationDAO    New ArbitrationDAO address.
     * @param scoringOracle     New ScoringOracle address.
     */
    event ContractAddressesUpdated(
        address arenaRegistry,
        address eloSystem,
        address treasury,
        address stableRegistry,
        address seasonManager,
        address arbitrationDAO,
        address scoringOracle
    );

    // ─────────────────────────────────────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice The BountyRound logic contract that is cloned for every new round.
    address public roundImplementation;

    /// @notice Address of the ArenaRegistry contract.
    address public arenaRegistry;

    /// @notice Address of the EloSystem contract.
    address public eloSystem;

    /// @notice Address of the Treasury contract.
    address public treasury;

    /// @notice StableRegistry contract address.
    address public stableRegistry;

    /// @notice SeasonManager contract address.
    address public seasonManager;

    /// @notice ArbitrationDAO contract address.
    // forge-lint: disable-next-line(mixed-case-variable) DAO is a well-known acronym
    address public arbitrationDAO;

    /// @notice ScoringOracle contract address.
    address public scoringOracle;

    /// @notice Auto-incrementing counter; the next bounty will receive this ID.
    ///         Starts at 1 — ID 0 is reserved to mean "not found".
    uint256 public nextBountyId;

    /// @notice Mapping from bounty ID to its immutable configuration.
    mapping(uint256 => BountyConfig) public bounties;

    /// @notice Mapping from bounty ID to the ordered list of deployed round addresses.
    mapping(uint256 => address[]) public bountyRounds;

    // ─────────────────────────────────────────────────────────────────────────
    //  CONSTANTS  (max tier index)
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Maximum valid tier index (0 = Bronze … 4 = Prometheus).
    uint8 private constant MAX_TIER = 4;

    // ─────────────────────────────────────────────────────────────────────────
    //  INITIALIZER
    // ─────────────────────────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialise the BountyFactory proxy.
     *
     * @dev Grants DEFAULT_ADMIN_ROLE and UPGRADER_ROLE to `admin`, and
     *      OPERATOR_ROLE + BOUNTY_CREATOR_ROLE to `operator`.
     *      Sets nextBountyId to 1.
     *
     * @param admin    Protocol multisig that controls role administration.
     * @param operator Initial operational address (can be same as admin).
     */
    function initialize(address admin, address operator) external initializer {
        if (admin    == address(0)) revert ZeroAddress("admin");
        if (operator == address(0)) revert ZeroAddress("operator");

        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE,        admin);
        _grantRole(Constants.UPGRADER_ROLE,   admin);
        _grantRole(Constants.OPERATOR_ROLE,   operator);
        _grantRole(Constants.BOUNTY_CREATOR_ROLE, operator);

        nextBountyId = 1;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL — BOUNTY CREATOR
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Register a new bounty configuration on-chain.
     *
     * @dev Validates all fields, stamps `creator` and `createdAt`, then stores the
     *      config at `nextBountyId` and increments the counter.
     *
     * Requirements
     *  • Caller must hold {Constants.BOUNTY_CREATOR_ROLE}.
     *  • `config.prizeDistribution` must sum to exactly {Constants.BPS_DENOMINATOR}.
     *  • `config.commitDuration` ∈ [MIN_COMMIT_DURATION, MAX_COMMIT_DURATION].
     *  • `config.tier` must be ≤ 4.
     *
     * @param config Complete BountyConfig supplied by the creator.
     *               The `active`, `createdAt`, and `creator` fields are overwritten
     *               by this function regardless of what the caller passes.
     *
     * @return bountyId The ID assigned to this bounty (always ≥ 1).
     *
     * @custom:emits BountyCreated
     */
    function createBounty(BountyConfig calldata config)
        external
        onlyRole(Constants.BOUNTY_CREATOR_ROLE)
        returns (uint256 bountyId)
    {
        _validateConfig(config);

        bountyId = nextBountyId++;

        // Build the stored config, overwriting caller-supplied bookkeeping fields.
        BountyConfig storage stored = bounties[bountyId];
        stored.problemCid           = config.problemCid;
        stored.entryFee             = config.entryFee;
        stored.commitDuration       = config.commitDuration;
        stored.maxAgents            = config.maxAgents;
        stored.tier                 = config.tier;
        stored.acceptanceThreshold  = config.acceptanceThreshold;
        stored.graduatedPayouts     = config.graduatedPayouts;
        stored.active               = true;
        stored.createdAt            = uint64(block.timestamp);
        stored.creator              = msg.sender;

        // Dynamic array must be assigned element-by-element in storage.
        uint256 len = config.prizeDistribution.length;
        for (uint256 i = 0; i < len; ) {
            stored.prizeDistribution.push(config.prizeDistribution[i]);
            unchecked { ++i; }
        }

        emit BountyCreated(bountyId, msg.sender, config.problemCid);
    }

    /**
     * @notice Deploy a new BountyRound clone for an existing active bounty.
     *
     * @dev Uses OpenZeppelin's {Clones.cloneDeterministic} (CREATE2) with a salt
     *      derived from the bounty ID and the current round index, ensuring
     *      deterministic and unique addresses per (bounty, round) pair.
     *
     *      After cloning, calls `IBountyRound.initialize()` on the new clone,
     *      forwarding the full config and all protocol addresses.
     *
     * Requirements
     *  • Caller must hold {Constants.BOUNTY_CREATOR_ROLE}.
     *  • `bountyId` must refer to an existing, active bounty.
     *  • `roundImplementation` must be set to a non-zero address.
     *
     * @param bountyId The parent bounty ID for which to spawn a round.
     *
     * @return roundAddr The address of the freshly deployed BountyRound clone.
     *
     * @custom:emits RoundSpawned
     */
    function spawnRound(uint256 bountyId)
        external
        onlyRole(Constants.BOUNTY_CREATOR_ROLE)
        returns (address roundAddr)
    {
        if (bountyId == 0 || bountyId >= nextBountyId) revert BountyNotFound(bountyId);

        BountyConfig storage cfg = bounties[bountyId];
        if (!cfg.active)               revert BountyInactive(bountyId);
        if (roundImplementation == address(0)) revert RoundImplementationNotSet();

        // Deterministic salt: keccak256(bountyId ++ roundIndex).
        uint256 roundIndex = bountyRounds[bountyId].length;
        // forge-lint: disable-next-line(asm-keccak256) CREATE2 salt derivation, readability preferred
        bytes32 salt = keccak256(abi.encodePacked(bountyId, roundIndex));

        roundAddr = Clones.cloneDeterministic(roundImplementation, salt);
        bountyRounds[bountyId].push(roundAddr);

        // Initialize the round via helper to avoid stack too deep
        _initializeRound(roundAddr, bountyId, roundIndex, cfg);

        // Grant cross-contract roles so the round can update ELO + agent stats on finalize.
        // Factory must hold DEFAULT_ADMIN_ROLE on both contracts (set during deployment wiring).
        IAccessControl(eloSystem).grantRole(Constants.ROUND_ROLE, roundAddr);
        IAccessControl(arenaRegistry).grantRole(Constants.BOUNTY_ROUND_ROLE, roundAddr);

        emit RoundSpawned(bountyId, roundIndex, roundAddr);
    }

    /// @dev Helper to initialize a BountyRound, avoiding stack-too-deep in spawnRound.
    function _initializeRound(address roundAddr, uint256 bountyId, uint256 roundIndex, BountyConfig storage cfg)
        internal
    {
        address[6] memory contracts = [
            arenaRegistry,
            eloSystem,
            stableRegistry,
            seasonManager,
            treasury,
            scoringOracle
        ];

        IBountyRound(roundAddr).initialize(
            bountyId,
            roundIndex,
            address(this),
            contracts,
            cfg.problemCid,
            cfg.entryFee,
            cfg.commitDuration,
            cfg.prizeDistribution,
            Constants.PROTOCOL_FEE_BPS,
            cfg.maxAgents,
            cfg.tier,
            0, // seasonId
            cfg.acceptanceThreshold,
            cfg.graduatedPayouts,
            cfg.creator
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL — OPERATOR
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Deactivate a bounty so that no further rounds can be spawned.
     *
     * @dev Existing deployed rounds are unaffected; only the `active` flag is toggled.
     *      Already-deactivated bounties can be called again without reverting
     *      (idempotent).
     *
     * Requirements
     *  • Caller must hold {Constants.OPERATOR_ROLE}.
     *  • `bountyId` must exist.
     *
     * @param bountyId The bounty to deactivate.
     *
     * @custom:emits BountyDeactivated
     */
    /**
     * @notice Start the commit phase for a specific round.
     * @dev Only the operator or bounty creator can trigger this.
     * @param bountyId The bounty ID.
     * @param roundIndex The index of the round within the bounty.
     */
    function startCommitPhase(uint256 bountyId, uint256 roundIndex)
        external
        onlyRole(Constants.OPERATOR_ROLE)
    {
        if (bountyId == 0 || bountyId >= nextBountyId) revert BountyNotFound(bountyId);
        if (roundIndex >= bountyRounds[bountyId].length) revert RoundNotFound(bountyId, roundIndex);
        address roundAddr = bountyRounds[bountyId][roundIndex];
        IBountyRound(roundAddr).startCommitPhase();
    }

    function deactivateBounty(uint256 bountyId)
        external
        onlyRole(Constants.OPERATOR_ROLE)
    {
        if (bountyId == 0 || bountyId >= nextBountyId) revert BountyNotFound(bountyId);
        bounties[bountyId].active = false;
        emit BountyDeactivated(bountyId, msg.sender);
    }

    /**
     * @notice Update the BountyRound logic implementation used for future clones.
     *
     * @dev The new `impl` address must be a deployed contract, but this function
     *      does not enforce it on-chain — callers are responsible for passing a valid
     *      address.  Pass `address(0)` to effectively disable round spawning until
     *      a new impl is set.
     *
     * Requirements
     *  • Caller must hold {Constants.OPERATOR_ROLE}.
     *
     * @param impl New implementation contract address.
     *
     * @custom:emits RoundImplementationUpdated
     */
    function setRoundImplementation(address impl)
        external
        onlyRole(Constants.OPERATOR_ROLE)
    {
        address old = roundImplementation;
        roundImplementation = impl;
        emit RoundImplementationUpdated(old, impl);
    }

    /**
     * @notice Update all protocol contract addresses in a single call.
     *
     * @dev All addresses must be non-zero. To update only a subset, read the
     *      current values via the public getters and pass them back unchanged.
     *
     * Requirements
     *  • Caller must hold {Constants.OPERATOR_ROLE}.
     *  • None of the addresses may be `address(0)`.
     *
     * @param _arenaRegistry     New ArenaRegistry address.
     * @param _eloSystem         New EloSystem address.
     * @param _treasury          New Treasury address.
     * @param _stableRegistry    New StableRegistry address.
     * @param _seasonManager     New SeasonManager address.
     * @param _arbitrationDAO    New ArbitrationDAO address.
     * @param _scoringOracle     New ScoringOracle address.
     *
     * @custom:emits ContractAddressesUpdated
     */
    function setContractAddresses(
        address _arenaRegistry,
        address _eloSystem,
        address _treasury,
        address _stableRegistry,
        address _seasonManager,
        // forge-lint: disable-next-line(mixed-case-variable) DAO is a well-known acronym
        address _arbitrationDAO,
        address _scoringOracle
    )
        external
        onlyRole(Constants.OPERATOR_ROLE)
    {
        if (_arenaRegistry     == address(0)) revert ZeroAddress("arenaRegistry");
        if (_eloSystem         == address(0)) revert ZeroAddress("eloSystem");
        if (_treasury          == address(0)) revert ZeroAddress("treasury");
        if (_stableRegistry    == address(0)) revert ZeroAddress("stableRegistry");
        if (_seasonManager     == address(0)) revert ZeroAddress("seasonManager");
        if (_arbitrationDAO    == address(0)) revert ZeroAddress("arbitrationDAO");
        if (_scoringOracle     == address(0)) revert ZeroAddress("scoringOracle");

        arenaRegistry     = _arenaRegistry;
        eloSystem         = _eloSystem;
        treasury          = _treasury;
        stableRegistry    = _stableRegistry;
        seasonManager     = _seasonManager;
        arbitrationDAO    = _arbitrationDAO;
        scoringOracle     = _scoringOracle;

        emit ContractAddressesUpdated(
            _arenaRegistry,
            _eloSystem,
            _treasury,
            _stableRegistry,
            _seasonManager,
            _arbitrationDAO,
            _scoringOracle
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL VIEW
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Retrieve the full configuration for a given bounty.
     *
     * @param bountyId The bounty to query.
     *
     * @return config A memory copy of the stored {BountyConfig}.
     */
    function getBounty(uint256 bountyId)
        external
        view
        returns (BountyConfig memory config)
    {
        if (bountyId == 0 || bountyId >= nextBountyId) revert BountyNotFound(bountyId);
        config = bounties[bountyId];
    }

    /**
     * @notice Return the total number of rounds spawned for a given bounty.
     *
     * @param bountyId The bounty to query.
     *
     * @return count The number of deployed BountyRound clones for this bounty.
     */
    function getRoundCount(uint256 bountyId)
        external
        view
        returns (uint256 count)
    {
        count = bountyRounds[bountyId].length;
    }

    /**
     * @notice Retrieve the address of a specific round for a given bounty.
     *
     * @param bountyId   The parent bounty ID.
     * @param roundIndex Zero-based index into the rounds array.
     *
     * @return roundAddr The address of the BountyRound clone at `roundIndex`.
     */
    function getRoundAddress(uint256 bountyId, uint256 roundIndex)
        external
        view
        returns (address roundAddr)
    {
        address[] storage rounds = bountyRounds[bountyId];
        if (roundIndex >= rounds.length) {
            revert RoundIndexOutOfBounds(bountyId, roundIndex);
        }
        roundAddr = rounds[roundIndex];
    }

    /**
     * @notice Predict the CREATE2 address of a future round before it is spawned.
     *
     * @dev Mirrors the salt computation used in {spawnRound}:
     *      `salt = keccak256(abi.encodePacked(bountyId, roundIndex))`.
     *      Useful for off-chain pre-authorisation flows.
     *
     * @param bountyId   The parent bounty ID.
     * @param roundIndex The round index (0-based) for which to predict the address.
     *
     * @return predicted The deterministic address the clone would receive.
     */
    function predictRoundAddress(uint256 bountyId, uint256 roundIndex)
        external
        view
        returns (address predicted)
    {
        // forge-lint: disable-next-line(asm-keccak256) CREATE2 salt derivation, readability preferred
        bytes32 salt = keccak256(abi.encodePacked(bountyId, roundIndex));
        predicted = Clones.predictDeterministicAddress(roundImplementation, salt, address(this));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  INTERNAL HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Validate every field of a caller-supplied BountyConfig.
     *      Reverts with a descriptive custom error on the first failing check.
     *
     * @param config The config struct to validate.
     */
    function _validateConfig(BountyConfig calldata config) internal pure {
        // ── Tier ─────────────────────────────────────────────────────────────
        if (config.tier > MAX_TIER) revert InvalidTier(config.tier);

        // ── Entry fee (fixed at ~$6 in ETH — Constants.ENTRY_FEE) ──────────────
        if (config.entryFee != Constants.ENTRY_FEE) {
            revert InvalidEntryFee(config.entryFee);
        }

        // ── Acceptance threshold ─────────────────────────────────────────────
        if (
            config.acceptanceThreshold < Constants.MIN_ACCEPTANCE_THRESHOLD ||
            config.acceptanceThreshold > Constants.MAX_ACCEPTANCE_THRESHOLD
        ) {
            revert InvalidAcceptanceThreshold(config.acceptanceThreshold);
        }

        // ── Commit duration ───────────────────────────────────────────────────
        if (
            config.commitDuration < Constants.MIN_COMMIT_DURATION ||
            config.commitDuration > Constants.MAX_COMMIT_DURATION
        ) {
            revert InvalidCommitDuration(config.commitDuration);
        }

        // ── Max agents (gas safety — O(n²) sort in finalize) ──────────────────
        if (config.maxAgents > Constants.MAX_AGENTS_PER_ROUND) {
            revert InvalidMaxAgents(config.maxAgents);
        }

        // ── Prize distribution ────────────────────────────────────────────────
        {
            uint256 total;
            uint256 len = config.prizeDistribution.length;
            for (uint256 i = 0; i < len; ) {
                total += config.prizeDistribution[i];
                unchecked { ++i; }
            }
            if (total != Constants.BPS_DENOMINATOR) {
                revert InvalidPrizeDistribution(total);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  UUPS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Restrict upgrade authority to addresses holding {Constants.UPGRADER_ROLE}.
     *      Called by the UUPS proxy machinery during {upgradeToAndCall}.
     *
     * @param newImplementation Address of the new logic contract (unused here; checked
     *                          by the parent proxy).
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(Constants.UPGRADER_ROLE)
    {}
}
