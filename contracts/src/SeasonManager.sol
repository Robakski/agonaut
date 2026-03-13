// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/*
 * ███████╗███████╗ █████╗ ███████╗ ██████╗ ███╗   ██╗    ███╗   ███╗ █████╗ ███╗   ██╗ █████╗  ██████╗ ███████╗██████╗
 * ██╔════╝██╔════╝██╔══██╗██╔════╝██╔═══██╗████╗  ██║    ████╗ ████║██╔══██╗████╗  ██║██╔══██╗██╔════╝ ██╔════╝██╔══██╗
 * ███████╗█████╗  ███████║███████╗██║   ██║██╔██╗ ██║    ██╔████╔██║███████║██╔██╗ ██║███████║██║  ███╗█████╗  ██████╔╝
 * ╚════██║██╔══╝  ██╔══██║╚════██║██║   ██║██║╚██╗██║    ██║╚██╔╝██║██╔══██║██║╚██╗██║██╔══██║██║   ██║██╔══╝  ██╔══██╗
 * ███████║███████╗██║  ██║███████║╚██████╔╝██║ ╚████║    ██║ ╚═╝ ██║██║  ██║██║ ╚████║██║  ██║╚██████╔╝███████╗██║  ██║
 * ╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝    ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
 */

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import {Constants} from "./Constants.sol";

// ═══════════════════════════════════════════════════════════════════════════════
//  INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/// @title IBountyFactory
/// @notice Minimal interface for spawning championship rounds through the BountyFactory.
interface IBountyFactory {
    /// @notice Deploys a new BountyRound clone for the given bounty ID.
    /// @param bountyId The parent bounty configuration to clone a round from.
    /// @return roundAddr The address of the freshly deployed BountyRound clone.
    function spawnRound(uint256 bountyId) external returns (address roundAddr);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SEASON MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @title SeasonManager
 * @author Agonaut
 * @notice Manages competitive seasons — fixed 4-week cycles with cumulative on-chain
 *         leaderboards and automatic Grand Championship rounds for the top performers.
 *
 * @dev Architecture overview
 *      ┌────────────────────────────────────────────────────────────────────────┐
 *      │  SeasonManager  (UUPS upgradeable, AccessControl)                      │
 *      │                                                                        │
 *      │  startSeason()          ──creates──►  seasons[id]   (Season struct)    │
 *      │  recordRoundResult()    ──updates──►  seasonPoints  (leaderboard)      │
 *      │  addToSeasonPrizePool() ──stores──►   season.prizePool (from Treasury) │
 *      │  spawnChampionship()    ──calls──►    IBountyFactory.spawnRound()      │
 *      │  endSeason()            ──marks──►    season.active = false            │
 *      └────────────────────────────────────────────────────────────────────────┘
 *
 * Role matrix
 * ─────────────────────────────────────────────────────────────────────────────
 *  DEFAULT_ADMIN_ROLE     │ Protocol multisig – grants / revokes all roles
 *  OPERATOR_ROLE          │ Start seasons, spawn championships, set addresses
 *  BOUNTY_ROUND_ROLE      │ Record round results and award points
 *  UPGRADER_ROLE          │ Authorise UUPS implementation upgrades
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Leaderboard invariants
 *  • `seasonTopAgents[seasonId]` is always sorted descending by cumulative points.
 *  • It contains at most {MAX_LEADERBOARD_SIZE} (100) entries.
 *  • Points are monotonically increasing; the array is only ever bubbled upward.
 *  • An agentId appears at most once in the leaderboard array.
 *
 * Season invariants
 *  • `nextSeasonId` is monotonically increasing, starting at 1.
 *  • `currentSeasonId == 0` means no active season exists.
 *  • A new season cannot start while the previous one is still marked active.
 *  • `endSeason` can only be called once the season's `endTime` has passed.
 */
contract SeasonManager is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    // ─────────────────────────────────────────────────────────────────────────
    //  TYPES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Full configuration and state for a single competitive season.
     *
     * @param seasonId             Unique, monotonically increasing season identifier.
     * @param startTime            Unix timestamp when the season began.
     * @param endTime              Unix timestamp when the season closes
     *                             (`startTime + Constants.SEASON_DURATION`).
     * @param active               True while the season is in progress; false after
     *                             `endSeason` has been called.
     * @param championshipSpawned  True once `spawnChampionship` has been invoked for
     *                             this season; prevents double-spawning.
     * @param prizePool            Accumulated ETH (wei) contributed via
     *                             `addToSeasonPrizePool`, sourced from protocol fees.
     * @param roundAddresses       Ordered list of round contract addresses (stored as
     *                             `uint256` for gas efficiency; cast via `uint160`).
     */
    struct Season {
        uint256   seasonId;
        uint64    startTime;
        uint64    endTime;
        bool      active;
        bool      championshipSpawned;
        uint256   prizePool;
        uint256[] roundAddresses;
    }

    /**
     * @notice Snapshot of an agent's standing within a season.
     *
     * @param agentId  The agent's unique identifier in ArenaRegistry.
     * @param points   Cumulative points earned across all rounds in the season.
     * @param tier     The agent's tier at the time of the snapshot
     *                 (0 = Bronze … 4 = Prometheus). Set by the caller.
     */
    struct SeasonScore {
        uint256 agentId;
        uint256 points;
        uint8   tier;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  CONSTANTS
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Maximum number of agents tracked in the on-chain leaderboard per season.
    uint256 private constant MAX_LEADERBOARD_SIZE = 100;

    // ─────────────────────────────────────────────────────────────────────────
    //  CUSTOM ERRORS
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Thrown when attempting to start a season while one is already active.
    /// @param activeSeasonId The ID of the currently active season.
    error SeasonStillActive(uint256 activeSeasonId);

    /// @notice Thrown when referencing a season that does not yet exist.
    /// @param seasonId The queried season ID.
    error SeasonNotFound(uint256 seasonId);

    /// @notice Thrown when an operation requires an active season but it is not active.
    /// @param seasonId The season ID that is not active.
    error SeasonNotActive(uint256 seasonId);

    /// @notice Thrown when `endSeason` is called before the season's end time.
    /// @param seasonId The season ID.
    /// @param endTime  The season's configured end timestamp.
    error SeasonNotYetEnded(uint256 seasonId, uint64 endTime);

    /// @notice Thrown when `endSeason` is called on a season that is already inactive.
    /// @param seasonId The season ID.
    error SeasonAlreadyEnded(uint256 seasonId);

    /// @notice Thrown when `spawnChampionship` is called but no championship bounty is configured.
    error ChampionshipBountyNotSet();

    /// @notice Thrown when `spawnChampionship` is called for a season that already has one.
    /// @param seasonId The season ID.
    error ChampionshipAlreadySpawned(uint256 seasonId);

    /// @notice Thrown when a required contract address is `address(0)`.
    /// @param name Short label identifying the missing address.
    error ZeroAddress(string name);

    /// @notice Thrown when `recordRoundResult` is called with an empty agent array.
    error EmptyRankedAgents();

    // ─────────────────────────────────────────────────────────────────────────
    //  EVENTS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when a new competitive season begins.
     * @param seasonId  The newly created season's ID.
     * @param startTime Unix timestamp of the season start.
     * @param endTime   Unix timestamp of the season end (`startTime + SEASON_DURATION`).
     */
    event SeasonStarted(
        uint256 indexed seasonId,
        uint64  startTime,
        uint64  endTime
    );

    /**
     * @notice Emitted when a season is closed after its end time.
     * @param seasonId  The ended season's ID.
     * @param prizePool Total ETH (wei) accumulated in the prize pool.
     */
    event SeasonEnded(
        uint256 indexed seasonId,
        uint256 prizePool
    );

    /**
     * @notice Emitted once for each agent awarded points in a round.
     * @param seasonId    The season in which points were awarded.
     * @param agentId     The agent receiving points.
     * @param pointsAdded The incremental points awarded for this round.
     * @param totalPoints The agent's new cumulative season total.
     */
    event PointsAwarded(
        uint256 indexed seasonId,
        uint256 indexed agentId,
        uint256 pointsAdded,
        uint256 totalPoints
    );

    /**
     * @notice Emitted when a Grand Championship round is spawned.
     * @param seasonId  The season for which the championship was spawned.
     * @param roundAddr The deployed address of the championship BountyRound clone.
     */
    event ChampionshipSpawned(
        uint256 indexed seasonId,
        address indexed roundAddr
    );

    /**
     * @notice Emitted when ETH is added to a season's prize pool.
     * @param seasonId    The season receiving the contribution.
     * @param amount      The ETH amount (wei) added in this call.
     * @param newTotal    The season's updated cumulative prize pool.
     */
    event PrizePoolIncreased(
        uint256 indexed seasonId,
        uint256 amount,
        uint256 newTotal
    );

    /**
     * @notice Emitted when the championship bounty ID is updated.
     * @param oldBountyId Previous championship bounty ID (0 if unset).
     * @param newBountyId New championship bounty ID.
     */
    event ChampionshipBountyIdUpdated(uint256 oldBountyId, uint256 newBountyId);

    /**
     * @notice Emitted when core protocol contract addresses are updated.
     * @param treasury       New Treasury address.
     * @param bountyFactory  New BountyFactory address.
     */
    event ContractAddressesUpdated(
        address treasury,
        address bountyFactory
    );

    // ─────────────────────────────────────────────────────────────────────────
    //  STATE
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Address of the protocol Treasury (authorised prize pool contributor).
    address public treasury;

    /// @notice Address of the BountyFactory used to deploy championship rounds.
    address public bountyFactory;

    /// @notice The ID of the currently active season; 0 if no season is running.
    uint256 public currentSeasonId;

    /// @notice The ID that will be assigned to the next season. Starts at 1.
    uint256 public nextSeasonId;

    /// @notice The BountyFactory bounty ID pre-configured for championship rounds.
    ///         Must be set via `setChampionshipBountyId` before `spawnChampionship` works.
    uint256 public championshipBountyId;

    /// @notice Full season data indexed by season ID.
    mapping(uint256 => Season) public seasons;

    /// @notice Cumulative season points per agent.
    ///         `seasonPoints[seasonId][agentId] => points`
    mapping(uint256 => mapping(uint256 => uint256)) public seasonPoints;

    /// @notice Sorted (descending) leaderboard of top agent IDs per season.
    ///         Maximum length: {MAX_LEADERBOARD_SIZE} (100).
    ///         `seasonTopAgents[seasonId] => agentId[]`
    mapping(uint256 => uint256[]) public seasonTopAgents;

    // ─────────────────────────────────────────────────────────────────────────
    //  INITIALIZER
    // ─────────────────────────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialise the SeasonManager proxy.
     *
     * @dev Grants `DEFAULT_ADMIN_ROLE` and `UPGRADER_ROLE` to `admin`, and
     *      `OPERATOR_ROLE` to `operator`.  Sets `nextSeasonId` to 1.
     *
     * @param admin     Protocol multisig — controls role administration and upgrades.
     * @param operator  Initial operational address (may equal `admin`).
     * @param _treasury Protocol Treasury address; receives and routes prize pools.
     * @param _bountyFactory BountyFactory address; spawns championship rounds.
     */
    function initialize(
        address admin,
        address operator,
        address _treasury,
        address _bountyFactory
    ) external initializer {
        if (admin         == address(0)) revert ZeroAddress("admin");
        if (operator      == address(0)) revert ZeroAddress("operator");
        if (_treasury     == address(0)) revert ZeroAddress("treasury");
        if (_bountyFactory == address(0)) revert ZeroAddress("bountyFactory");

        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE,      admin);
        _grantRole(Constants.UPGRADER_ROLE, admin);
        _grantRole(Constants.OPERATOR_ROLE, operator);

        treasury       = _treasury;
        bountyFactory  = _bountyFactory;
        nextSeasonId   = 1;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL — SEASON LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Open a new competitive season.
     *
     * @dev Creates a `Season` at `nextSeasonId`, advances the counter, and sets
     *      `currentSeasonId`.  The season's end time is fixed at
     *      `block.timestamp + Constants.SEASON_DURATION` (28 days).
     *
     *      Reverts if the previous season is still marked active — operators must
     *      call `endSeason` first (or wait until anyone calls it after endTime).
     *
     * Requirements
     *  • Caller must hold {Constants.OPERATOR_ROLE}.
     *  • No currently active season may exist.
     *
     * @custom:emits SeasonStarted
     */
    function startSeason() external onlyRole(Constants.OPERATOR_ROLE) {
        // Ensure the current season has been formally closed before opening a new one.
        if (currentSeasonId != 0 && seasons[currentSeasonId].active) {
            revert SeasonStillActive(currentSeasonId);
        }

        uint256 newSeasonId = nextSeasonId;
        unchecked { nextSeasonId = newSeasonId + 1; }

        uint64 start = uint64(block.timestamp);
        uint64 end   = start + Constants.SEASON_DURATION;

        Season storage s = seasons[newSeasonId];
        s.seasonId  = newSeasonId;
        s.startTime = start;
        s.endTime   = end;
        s.active    = true;

        currentSeasonId = newSeasonId;

        emit SeasonStarted(newSeasonId, start, end);
    }

    /**
     * @notice Close an expired season.
     *
     * @dev Callable by anyone once `block.timestamp >= season.endTime`.
     *      Marks the season inactive and clears `currentSeasonId` if applicable.
     *      Does **not** distribute the prize pool — that is handled off-chain or
     *      via a separate distribution contract.
     *
     * Requirements
     *  • `seasonId` must reference an existing season.
     *  • The season must not already be inactive.
     *  • `block.timestamp` must be at or beyond the season's `endTime`.
     *
     * @param seasonId The season to close.
     *
     * @custom:emits SeasonEnded
     */
    function endSeason(uint256 seasonId) external {
        _requireSeasonExists(seasonId);

        Season storage s = seasons[seasonId];

        if (!s.active)                          revert SeasonAlreadyEnded(seasonId);
        if (block.timestamp < s.endTime)        revert SeasonNotYetEnded(seasonId, s.endTime);

        s.active = false;

        if (currentSeasonId == seasonId) {
            currentSeasonId = 0;
        }

        emit SeasonEnded(seasonId, s.prizePool);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL — SCORING
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Record the ranked results of a completed round and award season points.
     *
     * @dev Called by a BountyRound contract (or any address holding
     *      {Constants.BOUNTY_ROUND_ROLE}) after a round concludes.
     *
     *      Points awarded by finishing position (1-indexed):
     *
     *      | Rank       | Points |
     *      |------------|--------|
     *      | 1st        | 100    |
     *      | 2nd        | 75     |
     *      | 3rd        | 60     |
     *      | 4th        | 50     |
     *      | 5th        | 40     |
     *      | 6th–10th   | 30     |
     *      | 11th–20th  | 20     |
     *      | 21st+      | 10     |
     *
     *      After updating each agent's cumulative total, the on-chain leaderboard
     *      (`seasonTopAgents`) is updated via an insertion-sort bubble-up that
     *      exploits the monotonic nature of cumulative points.
     *
     * Requirements
     *  • Caller must hold {Constants.BOUNTY_ROUND_ROLE}.
     *  • `seasonId` must reference an existing, active season.
     *  • `rankedAgentIds` must be non-empty.
     *  • Each `agentId` in `rankedAgentIds` must be non-zero.
     *
     * @param seasonId       The season to credit with these results.
     * @param rankedAgentIds Agents ordered by finishing position (index 0 = 1st place).
     *                       Duplicate agent IDs result in double-awarding and should
     *                       be filtered by the caller before submission.
     *
     * @custom:emits PointsAwarded  (once per agent)
     */
    function recordRoundResult(
        uint256          seasonId,
        uint256[] calldata rankedAgentIds
    ) external onlyRole(Constants.BOUNTY_ROUND_ROLE) {
        _requireSeasonExists(seasonId);
        if (!seasons[seasonId].active)     revert SeasonNotActive(seasonId);
        if (rankedAgentIds.length == 0)    revert EmptyRankedAgents();

        uint256 len = rankedAgentIds.length;

        for (uint256 i = 0; i < len; ) {
            uint256 agentId = rankedAgentIds[i];
            uint256 pts     = _pointsForRank(i + 1); // rank is 1-indexed

            uint256 newTotal;
            unchecked {
                newTotal = seasonPoints[seasonId][agentId] + pts;
            }
            seasonPoints[seasonId][agentId] = newTotal;

            _updateLeaderboard(seasonId, agentId, newTotal);

            emit PointsAwarded(seasonId, agentId, pts, newTotal);

            unchecked { ++i; }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL — PRIZE POOL
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Add ETH to a season's prize pool.
     *
     * @dev Intended to be called by the Treasury as it collects protocol fees
     *      during an active season.  Non-Treasury addresses may also contribute.
     *      The pool is informational until a distribution mechanism disburses it.
     *
     * Requirements
     *  • `seasonId` must reference an existing, active season.
     *  • `msg.value` must be greater than zero (enforced implicitly; a zero-value
     *    call is accepted but emits an event with `amount == 0`).
     *
     * @param seasonId The season whose prize pool should receive the contribution.
     *
     * @custom:emits PrizePoolIncreased
     */
    function addToSeasonPrizePool(uint256 seasonId) external payable {
        _requireSeasonExists(seasonId);
        if (!seasons[seasonId].active) revert SeasonNotActive(seasonId);

        unchecked {
            seasons[seasonId].prizePool += msg.value;
        }

        emit PrizePoolIncreased(seasonId, msg.value, seasons[seasonId].prizePool);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL — CHAMPIONSHIP
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Spawn a Grand Championship BountyRound for the season's top agents.
     *
     * @dev Calls `IBountyFactory(bountyFactory).spawnRound(championshipBountyId)` to
     *      deploy a pre-configured championship round and records its address in the
     *      season's `roundAddresses` array.
     *
     *      Typically called after `endSeason` so the final leaderboard is settled,
     *      but the contract does not enforce an active/inactive requirement — the
     *      operator bears responsibility for timing.
     *
     * Requirements
     *  • Caller must hold {Constants.OPERATOR_ROLE}.
     *  • `seasonId` must reference an existing season.
     *  • `championshipBountyId` must be non-zero (set via `setChampionshipBountyId`).
     *  • `bountyFactory` must be set to a non-zero address.
     *  • A championship must not have been spawned for this season already.
     *
     * @param seasonId The season for which to spawn the championship.
     *
     * @custom:emits ChampionshipSpawned
     */
    function spawnChampionship(uint256 seasonId)
        external
        onlyRole(Constants.OPERATOR_ROLE)
    {
        _requireSeasonExists(seasonId);

        Season storage s = seasons[seasonId];

        if (s.championshipSpawned)     revert ChampionshipAlreadySpawned(seasonId);
        if (championshipBountyId == 0) revert ChampionshipBountyNotSet();
        if (bountyFactory == address(0)) revert ZeroAddress("bountyFactory");

        address roundAddr = IBountyFactory(bountyFactory).spawnRound(championshipBountyId);

        s.championshipSpawned = true;
        s.roundAddresses.push(uint256(uint160(roundAddr)));

        emit ChampionshipSpawned(seasonId, roundAddr);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL — OPERATOR CONFIGURATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Update the Treasury and BountyFactory contract addresses.
     *
     * @dev Both addresses must be non-zero.  To update only one, pass the current
     *      value of the other unchanged.
     *
     * Requirements
     *  • Caller must hold {Constants.OPERATOR_ROLE}.
     *  • Neither address may be `address(0)`.
     *
     * @param _treasury      New Treasury contract address.
     * @param _bountyFactory New BountyFactory contract address.
     *
     * @custom:emits ContractAddressesUpdated
     */
    function setContractAddresses(
        address _treasury,
        address _bountyFactory
    ) external onlyRole(Constants.OPERATOR_ROLE) {
        if (_treasury      == address(0)) revert ZeroAddress("treasury");
        if (_bountyFactory == address(0)) revert ZeroAddress("bountyFactory");

        treasury      = _treasury;
        bountyFactory = _bountyFactory;

        emit ContractAddressesUpdated(_treasury, _bountyFactory);
    }

    /**
     * @notice Set the BountyFactory bounty ID used for Grand Championship rounds.
     *
     * @dev The bounty must already exist and be active in the BountyFactory.
     *      This contract does not validate that on-chain; the operator is responsible.
     *
     * Requirements
     *  • Caller must hold {Constants.OPERATOR_ROLE}.
     *
     * @param bountyId The bounty ID to use for future championship spawns.
     *
     * @custom:emits ChampionshipBountyIdUpdated
     */
    function setChampionshipBountyId(uint256 bountyId)
        external
        onlyRole(Constants.OPERATOR_ROLE)
    {
        uint256 old = championshipBountyId;
        championshipBountyId = bountyId;
        emit ChampionshipBountyIdUpdated(old, bountyId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  EXTERNAL — VIEW
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Return the top-N agents by cumulative points for a given season.
     *
     * @dev The returned arrays are already sorted descending by points.
     *      If `limit` exceeds the number of tracked agents, all tracked agents
     *      are returned.
     *
     * @param seasonId The season to query.
     * @param limit    Maximum number of entries to return (clamped to leaderboard length).
     *
     * @return agentIds Sorted agent IDs (descending points, index 0 = highest).
     * @return points   Corresponding cumulative point totals.
     */
    function getSeasonLeaderboard(uint256 seasonId, uint256 limit)
        external
        view
        returns (uint256[] memory agentIds, uint256[] memory points)
    {
        uint256[] storage top = seasonTopAgents[seasonId];
        uint256 topLen        = top.length;
        uint256 resultLen     = limit < topLen ? limit : topLen;

        agentIds = new uint256[](resultLen);
        points   = new uint256[](resultLen);

        for (uint256 i = 0; i < resultLen; ) {
            agentIds[i] = top[i];
            points[i]   = seasonPoints[seasonId][top[i]];
            unchecked { ++i; }
        }
    }

    /**
     * @notice Return the cumulative season points for a specific agent.
     *
     * @param seasonId The season to query.
     * @param agentId  The agent to look up.
     *
     * @return The agent's total points in the specified season (0 if none).
     */
    function getAgentSeasonPoints(uint256 seasonId, uint256 agentId)
        external
        view
        returns (uint256)
    {
        return seasonPoints[seasonId][agentId];
    }

    /**
     * @notice Return the full data of the currently active season.
     *
     * @dev Returns an empty `Season` struct (all zero/false values) when
     *      `currentSeasonId == 0` (i.e., no season is running).
     *
     * @return The `Season` struct for the current season.
     */
    function getCurrentSeason() external view returns (Season memory) {
        return seasons[currentSeasonId];
    }

    /**
     * @notice Check whether a given season is currently active.
     *
     * @param seasonId The season ID to query.
     *
     * @return True if the season exists and its `active` flag is set; false otherwise.
     */
    function isSeasonActive(uint256 seasonId) external view returns (bool) {
        if (seasonId == 0 || seasonId >= nextSeasonId) return false;
        return seasons[seasonId].active;
    }

    /**
     * @notice Return the number of rounds recorded for a season.
     *
     * @param seasonId The season to query.
     *
     * @return The length of the season's `roundAddresses` array.
     */
    function getSeasonRoundCount(uint256 seasonId) external view returns (uint256) {
        return seasons[seasonId].roundAddresses.length;
    }

    /**
     * @notice Return a specific round address (as `address`) from a season.
     *
     * @param seasonId   The season to query.
     * @param roundIndex Zero-based index into the round array.
     *
     * @return The round contract address at `roundIndex`.
     */
    function getSeasonRound(uint256 seasonId, uint256 roundIndex)
        external
        view
        returns (address)
    {
        return address(uint160(seasons[seasonId].roundAddresses[roundIndex]));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  INTERNAL — POINTS CALCULATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Pure helper that maps a finishing rank (1-indexed) to its point reward.
     *
     *      | Rank       | Points |
     *      |------------|--------|
     *      | 1          | 100    |
     *      | 2          | 75     |
     *      | 3          | 60     |
     *      | 4          | 50     |
     *      | 5          | 40     |
     *      | 6–10       | 30     |
     *      | 11–20      | 20     |
     *      | 21+        | 10     |
     *
     * @param rank 1-indexed finishing position (must be ≥ 1).
     *
     * @return pts The point value for the given rank.
     */
    function _pointsForRank(uint256 rank) internal pure returns (uint256 pts) {
        if      (rank == 1)              pts = 100;
        else if (rank == 2)              pts = 75;
        else if (rank == 3)              pts = 60;
        else if (rank == 4)              pts = 50;
        else if (rank == 5)              pts = 40;
        else if (rank <= 10)             pts = 30;
        else if (rank <= 20)             pts = 20;
        else                             pts = 10;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  INTERNAL — LEADERBOARD MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Update the season leaderboard after an agent's points have increased.
     *
     *      Algorithm (O(N) worst-case, N ≤ 100):
     *      1. Scan the array to determine whether `agentId` is already present.
     *      2a. If present  → bubble the entry upward until the array is sorted again
     *          (valid because cumulative points are strictly non-decreasing).
     *      2b. If absent:
     *          - If the array has fewer than {MAX_LEADERBOARD_SIZE} entries, append
     *            the agent and bubble upward.
     *          - If the array is full, compare against the last (lowest) entry.
     *            Replace it if `newTotal` exceeds the incumbent's points, then
     *            bubble the new entry upward.
     *
     * @param seasonId The season leaderboard to update.
     * @param agentId  The agent whose points changed.
     * @param newTotal The agent's updated cumulative point total.
     */
    function _updateLeaderboard(
        uint256 seasonId,
        uint256 agentId,
        uint256 newTotal
    ) internal {
        uint256[] storage top = seasonTopAgents[seasonId];
        uint256 len = top.length;

        // ── Step 1: search for existing entry ──────────────────────────────
        uint256 agentIdx = type(uint256).max; // sentinel = not found
        for (uint256 i = 0; i < len; ) {
            if (top[i] == agentId) {
                agentIdx = i;
                break;
            }
            unchecked { ++i; }
        }

        // ── Step 2a: agent already in leaderboard ──────────────────────────
        if (agentIdx != type(uint256).max) {
            _bubbleUp(top, agentIdx, seasonId);
            return;
        }

        // ── Step 2b: agent not yet in leaderboard ──────────────────────────
        if (len < MAX_LEADERBOARD_SIZE) {
            // Array has room: append and bubble up.
            top.push(agentId);
            _bubbleUp(top, len, seasonId);
        } else {
            // Array is full: replace 100th entry if new total is higher.
            uint256 lastPts = seasonPoints[seasonId][top[len - 1]];
            if (newTotal > lastPts) {
                top[len - 1] = agentId;
                _bubbleUp(top, len - 1, seasonId);
            }
        }
    }

    /**
     * @dev Bubble an entry at `idx` upward in `top` until the array order is restored.
     *      The array is maintained in descending order by
     *      `seasonPoints[seasonId][agentId]`.
     *
     *      This is safe because cumulative points only increase, so a newly updated
     *      agent can only move toward the front of the array, never toward the back.
     *
     * @param top      Storage reference to the leaderboard array.
     * @param idx      Starting index of the entry to bubble up.
     * @param seasonId Used to look up the points for comparison.
     */
    function _bubbleUp(
        uint256[] storage top,
        uint256 idx,
        uint256 seasonId
    ) internal {
        uint256 agentId  = top[idx];
        uint256 agentPts = seasonPoints[seasonId][agentId];

        while (idx > 0) {
            uint256 prevIdx = idx - 1;
            if (seasonPoints[seasonId][top[prevIdx]] >= agentPts) {
                break; // already in correct position
            }
            // Swap with predecessor
            top[idx]     = top[prevIdx];
            top[prevIdx] = agentId;
            idx          = prevIdx;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  INTERNAL — VALIDATION HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Revert if `seasonId` is out of the valid range [1, nextSeasonId).
     *      Season ID 0 is permanently reserved as a "null" sentinel.
     *
     * @param seasonId The season ID to validate.
     */
    function _requireSeasonExists(uint256 seasonId) internal view {
        if (seasonId == 0 || seasonId >= nextSeasonId) {
            revert SeasonNotFound(seasonId);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  UUPS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Restrict upgrade authority to addresses holding {Constants.UPGRADER_ROLE}.
     *      Invoked by the UUPS proxy machinery during `upgradeToAndCall`.
     *
     * @param newImplementation Address of the incoming logic contract (unused here;
     *                          validation is performed by the proxy).
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(Constants.UPGRADER_ROLE)
    {}
}
