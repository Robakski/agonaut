// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/*
 * ███████╗ ██████╗ ██████╗ ██████╗ ███████╗██████╗
 * ██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔══██╗
 * ███████╗██║     ██║   ██║██████╔╝█████╗  ██████╔╝
 * ╚════██║██║     ██║   ██║██╔══██╗██╔══╝  ██╔══██╗
 * ███████║╚██████╗╚██████╔╝██║  ██║███████╗██║  ██║
 * ╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
 *
 * ██████╗ ███████╗ ██████╗ ██╗███████╗████████╗██████╗ ██╗   ██╗
 * ██╔══██╗██╔════╝██╔════╝ ██║██╔════╝╚══██╔══╝██╔══██╗╚██╗ ██╔╝
 * ██████╔╝█████╗  ██║  ███╗██║███████╗   ██║   ██████╔╝ ╚████╔╝
 * ██╔══██╗██╔══╝  ██║   ██║██║╚════██║   ██║   ██╔══██╗  ╚██╔╝
 * ██║  ██║███████╗╚██████╔╝██║███████║   ██║   ██║  ██║   ██║
 * ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝
 */

import {Initializable} from
    "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from
    "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from
    "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {UUPSUpgradeable} from
    "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {Constants} from "../Constants.sol";

/**
 * @title  ScorerRegistry
 * @author Agonaut
 * @notice Decentralised scoring layer for the Agonaut protocol.
 *
 * @dev Anyone can become a Scorer Node by staking {0.1 ether} ETH.
 *      When a BountyRound needs scoring, it opens a ScoringRound (providing a reward pool).
 *      All active scorers independently compute agent scores and submit them on-chain.
 *      After the submission deadline passes, anyone can call `resolveConsensus`:
 *
 *        • Submissions are grouped by their `scoresHash` (keccak256 of the score array).
 *        • If the largest group reaches ≥ {6667}/10 000 of total
 *          submissions, consensus is reached.
 *        • Agreeing scorers split the reward pool proportionally to their staked ETH.
 *        • Disagreeing scorers are slashed 50 % of their stake; slashed funds roll into
 *          the next round's reward pool.
 *        • If no group achieves the threshold the round fails, stakes are left intact, and
 *          the reward pool is held for admin recovery.
 *
 * Role architecture (minimal — mostly permissionless):
 *  - DEFAULT_ADMIN_ROLE : Protocol admin (multisig). Grants/revokes roles, recovers
 *                         stranded funds from failed rounds.
 *  - ROUND_ROLE         : BountyRound contracts. Only they may open scoring rounds.
 *  - UPGRADER_ROLE      : Address authorised to upgrade the implementation.
 */
contract ScorerRegistry is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    // ═══════════════════════════════════════════════════════════════════════
    //  ROLES
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Role granted to BountyRound contracts that can open scoring rounds.
    bytes32 public constant ROUND_ROLE = Constants.ROUND_ROLE;

    /// @notice Role for upgrading the implementation via UUPS.
    bytes32 public constant UPGRADER_ROLE = Constants.UPGRADER_ROLE;

    // ═══════════════════════════════════════════════════════════════════════
    //  STRUCTS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice On-chain state for a registered Scorer Node.
     * @param wallet           The EOA/wallet that owns this scorer.
     * @param stakedAmount     ETH currently staked by this scorer (in wei).
     * @param registeredAt     Unix timestamp when the scorer registered.
     * @param active           Whether the scorer is currently active.
     * @param totalScorings    Total number of scoring rounds the scorer submitted to.
     * @param correctScorings  Number of rounds where this scorer agreed with consensus.
     * @param slashedCount     Number of times this scorer was slashed.
     */
    struct Scorer {
        address wallet;
        uint256 stakedAmount;
        uint64  registeredAt;
        bool    active;
        uint32  totalScorings;
        uint32  correctScorings;
        uint32  slashedCount;
    }

    /**
     * @notice State for a single scoring round.
     * @param roundAddr    The BountyRound contract that opened this round.
     * @param rewardPool   ETH allocated as reward for scorers (in wei).
     * @param deadline     Unix timestamp after which submissions are closed.
     * @param finalized    True once `resolveConsensus` has been executed.
     * @param scorerCount  Number of scorers who submitted scores.
     */
    struct ScoringRound {
        address roundAddr;
        uint256 rewardPool;
        uint64  deadline;
        bool    finalized;
        uint256 scorerCount;
    }

    /**
     * @notice A single scorer's score submission for a round.
     * @param scorerId      The ID of the scorer who submitted.
     * @param agentScores   Scores for each agent, indexed by position (sorted by agentId).
     * @param scoresHash    keccak256(abi.encodePacked(agentScores)) for quick grouping.
     * @param submittedAt   Unix timestamp of submission.
     */
    struct ScoreSubmission {
        uint256   scorerId;
        uint256[] agentScores;
        bytes32   scoresHash;
        uint64    submittedAt;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  STATE
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev Auto-incrementing scorer ID counter. Starts at 1 (0 = null).
    uint256 public nextScorerId;

    /// @dev Auto-incrementing round ID counter. Starts at 1 (0 = null).
    uint256 public nextRoundId;

    /// @dev scorerId → Scorer struct.
    mapping(uint256 => Scorer) private _scorers;

    /// @dev wallet → scorerId (0 if not a scorer).
    mapping(address => uint256) private _walletToScorerId;

    /// @dev roundId → ScoringRound struct.
    mapping(uint256 => ScoringRound) private _rounds;

    /// @dev roundId → agentIds provided when round was opened (sorted).
    mapping(uint256 => uint256[]) private _roundAgentIds;

    /// @dev roundId → scorerId → ScoreSubmission (non-empty if scorer submitted).
    mapping(uint256 => mapping(uint256 => ScoreSubmission)) private _submissions;

    /// @dev roundId → ordered list of scorer IDs that submitted for that round.
    mapping(uint256 => uint256[]) private _roundSubmitters;

    /// @dev roundId → scorerId → whether that scorer was in the consensus group.
    mapping(uint256 => mapping(uint256 => bool)) private _inConsensus;

    /// @dev roundId → consensus agentIds (populated on successful resolve).
    mapping(uint256 => uint256[]) private _consensusAgentIds;

    /// @dev roundId → consensus scores (populated on successful resolve).
    mapping(uint256 => uint256[]) private _consensusScoreValues;

    /// @dev roundId → whether consensus was reached (vs failed / not yet resolved).
    mapping(uint256 => bool) private _consensusReached;

    /// @dev scorerId → number of unfinalized rounds the scorer has submitted to.
    ///      Used to block unregistration while a round is pending.
    mapping(uint256 => uint256) private _scorerPendingRounds;

    /// @notice Accumulated ETH from slashing; added to the next round's reward pool.
    uint256 public pendingSlashFunds;

    /// @notice Accumulated ETH from failed rounds awaiting admin recovery.
    uint256 public stranded;

    // ═══════════════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Emitted when a new scorer registers.
     * @param scorerId  Assigned scorer ID.
     * @param wallet    Registering wallet.
     * @param stake     ETH staked (= 0.1 ether at registration).
     */
    event ScorerRegistered(
        uint256 indexed scorerId,
        address indexed wallet,
        uint256 stake
    );

    /**
     * @notice Emitted when a scorer unregisters and receives their stake back.
     * @param scorerId  The scorer that left.
     * @param wallet    Their wallet.
     * @param returned  ETH returned to them.
     */
    event ScorerUnregistered(
        uint256 indexed scorerId,
        address indexed wallet,
        uint256 returned
    );

    /**
     * @notice Emitted when a scorer tops up their stake.
     * @param scorerId  The scorer topping up.
     * @param amount    Additional ETH added.
     * @param newTotal  New total stake.
     */
    event StakeToppedUp(
        uint256 indexed scorerId,
        uint256 amount,
        uint256 newTotal
    );

    /**
     * @notice Emitted when a new scoring round is opened by a BountyRound contract.
     * @param roundId    Assigned round ID.
     * @param roundAddr  Address of the BountyRound that opened it.
     * @param rewardPool Total ETH reward available for scorers.
     * @param deadline   Submission deadline (unix timestamp).
     */
    event ScoringRoundOpened(
        uint256 indexed roundId,
        address indexed roundAddr,
        uint256 rewardPool,
        uint64  deadline
    );

    /**
     * @notice Emitted when a scorer submits their scores for a round.
     * @param roundId    The scoring round.
     * @param scorerId   The submitting scorer.
     * @param scoresHash keccak256 hash of the submitted scores array.
     */
    event ScoresSubmitted(
        uint256 indexed roundId,
        uint256 indexed scorerId,
        bytes32 scoresHash
    );

    /**
     * @notice Emitted when consensus is successfully reached for a round.
     * @param roundId          The scoring round.
     * @param consensusHash    The winning scoresHash.
     * @param agreeingCount    Number of scorers in the consensus group.
     * @param totalSubmissions Total number of score submissions received.
     * @param rewardPool       ETH distributed to agreeing scorers.
     */
    event ConsensusReached(
        uint256 indexed roundId,
        bytes32 consensusHash,
        uint256 agreeingCount,
        uint256 totalSubmissions,
        uint256 rewardPool
    );

    /**
     * @notice Emitted when a round fails to reach consensus.
     * @param roundId          The scoring round.
     * @param totalSubmissions Number of submissions received.
     * @param rewardStranded   ETH moved to `stranded` for admin recovery.
     */
    event ConsensusFailed(
        uint256 indexed roundId,
        uint256 totalSubmissions,
        uint256 rewardStranded
    );

    /**
     * @notice Emitted when a scorer is slashed for disagreeing with consensus.
     * @param roundId      The round where the slash occurred.
     * @param scorerId     The slashed scorer.
     * @param slashAmount  ETH removed from their stake.
     * @param newStake     Remaining stake after slash.
     */
    event ScorerSlashed(
        uint256 indexed roundId,
        uint256 indexed scorerId,
        uint256 slashAmount,
        uint256 newStake
    );

    /**
     * @notice Emitted when a scorer receives a reward for being in consensus.
     * @param roundId    The round.
     * @param scorerId   The rewarded scorer.
     * @param reward     ETH paid out.
     */
    event ScorerRewarded(
        uint256 indexed roundId,
        uint256 indexed scorerId,
        uint256 reward
    );

    /**
     * @notice Emitted when an admin recovers stranded funds from a failed round.
     * @param to     Recipient address.
     * @param amount ETH recovered.
     */
    event StrandedFundsRecovered(address indexed to, uint256 amount);

    // ═══════════════════════════════════════════════════════════════════════
    //  ERRORS
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice msg.value does not meet the minimum scorer stake.
    error InsufficientStake(uint256 sent, uint256 required);

    /// @notice The caller already has a registered scorer entry.
    error AlreadyRegistered(uint256 existingScorerId);

    /// @notice The provided scorer ID does not exist.
    error ScorerNotFound(uint256 scorerId);

    /// @notice The caller is not the wallet that owns this scorer.
    error NotScorerOwner(uint256 scorerId, address caller);

    /// @notice The scorer is inactive (unregistered).
    error ScorerInactive(uint256 scorerId);

    /// @notice The scorer is locked into one or more active rounds.
    error ScorerLockedInActiveRound(uint256 scorerId, uint256 pendingCount);

    /// @notice The provided round ID does not exist.
    error RoundNotFound(uint256 roundId);

    /// @notice The round has already been finalized.
    error RoundAlreadyFinalized(uint256 roundId);

    /// @notice The submission deadline has not yet passed.
    error DeadlineNotPassed(uint256 roundId, uint64 deadline, uint64 current);

    /// @notice The submission deadline has already passed.
    error DeadlinePassed(uint256 roundId, uint64 deadline, uint64 current);

    /// @notice The scorer has already submitted scores for this round.
    error AlreadySubmitted(uint256 roundId, uint256 scorerId);

    /// @notice The agentIds and scores arrays have different lengths.
    error ArrayLengthMismatch(uint256 agentIdsLen, uint256 scoresLen);

    /// @notice The round received fewer submissions than 3.
    error NotEnoughSubmissions(uint256 roundId, uint256 submitted, uint8 required);

    /// @notice An ETH transfer to a scorer wallet failed.
    error EthTransferFailed(address recipient, uint256 amount);

    /// @notice A zero address was supplied where a valid address is required.
    error ZeroAddress();

    /// @notice There are no stranded funds to recover.
    error NothingToRecover();

    // ═══════════════════════════════════════════════════════════════════════
    //  MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev Reverts if `scorerId` does not correspond to a stored scorer.
    function _requireScorerExists(uint256 scorerId) internal view {
        if (_scorers[scorerId].wallet == address(0)) revert ScorerNotFound(scorerId);
    }

    modifier scorerExists(uint256 scorerId) {
        _requireScorerExists(scorerId);
        _;
    }

    /// @dev Reverts if `msg.sender` is not the owner of `scorerId`.
    function _requireOnlyScorerOwner(uint256 scorerId) internal view {
        if (_scorers[scorerId].wallet == address(0)) revert ScorerNotFound(scorerId);
        if (_scorers[scorerId].wallet != msg.sender)
            revert NotScorerOwner(scorerId, msg.sender);
    }

    modifier onlyScorerOwner(uint256 scorerId) {
        _requireOnlyScorerOwner(scorerId);
        _;
    }

    /// @dev Reverts if `scorerId` is inactive.
    function _requireScorerActive(uint256 scorerId) internal view {
        if (_scorers[scorerId].wallet == address(0)) revert ScorerNotFound(scorerId);
        if (!_scorers[scorerId].active) revert ScorerInactive(scorerId);
    }

    modifier scorerActive(uint256 scorerId) {
        _requireScorerActive(scorerId);
        _;
    }

    /// @dev Reverts if `roundId` does not correspond to a stored round.
    function _requireRoundExists(uint256 roundId) internal view {
        if (_rounds[roundId].roundAddr == address(0)) revert RoundNotFound(roundId);
    }

    modifier roundExists(uint256 roundId) {
        _requireRoundExists(roundId);
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
     * @notice Initialises the ScorerRegistry proxy.
     * @dev Called once at deployment via the UUPS proxy.
     * @param admin    Address granted DEFAULT_ADMIN_ROLE and UPGRADER_ROLE.
     */
    function initialize(address admin) external initializer {
        if (admin == address(0)) revert ZeroAddress();

        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);

        nextScorerId = 1;
        nextRoundId  = 1;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  SCORER REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Register as a Scorer Node by staking {0.1 ether} ETH.
     * @dev Permissionless — anyone can stake and become a scorer.
     *      The caller's wallet must not already be an active scorer.
     *      Excess ETH beyond MIN_SCORER_STAKE is accepted and added to stake.
     *      Emits {ScorerRegistered}.
     * @return scorerId The assigned scorer ID.
     */
    function registerScorer()
        external
        payable
        nonReentrant
        returns (uint256 scorerId)
    {
        if (msg.value < 0.1 ether)
            revert InsufficientStake(msg.value, 0.1 ether);

        uint256 existing = _walletToScorerId[msg.sender];
        if (existing != 0 && _scorers[existing].active)
            revert AlreadyRegistered(existing);

        scorerId = nextScorerId;
        unchecked { nextScorerId = scorerId + 1; }

        _scorers[scorerId] = Scorer({
            wallet:          msg.sender,
            stakedAmount:    msg.value,
            registeredAt:    uint64(block.timestamp),
            active:          true,
            totalScorings:   0,
            correctScorings: 0,
            slashedCount:    0
        });

        _walletToScorerId[msg.sender] = scorerId;

        emit ScorerRegistered(scorerId, msg.sender, msg.value);
    }

    /**
     * @notice Unregister as a scorer and withdraw the full staked amount.
     * @dev Only the scorer's owner wallet may call this.
     *      Reverts if the scorer is currently committed to any unfinalized round.
     *      The scorer's entry is marked inactive; their ID is not reused.
     *      Emits {ScorerUnregistered}.
     * @param scorerId The scorer to unregister.
     */
    function unregisterScorer(uint256 scorerId)
        external
        nonReentrant
        onlyScorerOwner(scorerId)
        scorerActive(scorerId)
    {
        uint256 pending = _scorerPendingRounds[scorerId];
        if (pending > 0)
            revert ScorerLockedInActiveRound(scorerId, pending);

        Scorer storage scorer = _scorers[scorerId];
        uint256 stakeToReturn = scorer.stakedAmount;

        scorer.active       = false;
        scorer.stakedAmount = 0;
        _walletToScorerId[msg.sender] = 0;

        emit ScorerUnregistered(scorerId, msg.sender, stakeToReturn);

        _sendEth(msg.sender, stakeToReturn);
    }

    /**
     * @notice Add additional ETH to an existing scorer's stake.
     * @dev Only the scorer's owner wallet may call this. Must be active.
     *      Any amount > 0 is accepted.
     *      Emits {StakeToppedUp}.
     * @param scorerId The scorer to top up.
     */
    function topUpStake(uint256 scorerId)
        external
        payable
        nonReentrant
        onlyScorerOwner(scorerId)
        scorerActive(scorerId)
    {
        if (msg.value == 0) revert InsufficientStake(0, 1);

        Scorer storage scorer = _scorers[scorerId];
        scorer.stakedAmount += msg.value;

        emit StakeToppedUp(scorerId, msg.value, scorer.stakedAmount);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ROUND MANAGEMENT (ROUND_ROLE only)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Open a new scoring round for a BountyRound contract.
     * @dev Restricted to {ROUND_ROLE}. The ETH sent becomes the scorer reward pool,
     *      augmented by any accumulated slash funds from previous rounds.
     *      Emits {ScoringRoundOpened}.
     * @param roundAddr The address of the BountyRound contract requesting scoring.
     * @param deadline  Unix timestamp after which no more submissions are accepted.
     * @return roundId  The assigned scoring round ID.
     */
    function openScoringRound(address roundAddr, uint64 deadline)
        external
        payable
        onlyRole(ROUND_ROLE)
        returns (uint256 roundId)
    {
        if (roundAddr == address(0)) revert ZeroAddress();
        if (deadline <= uint64(block.timestamp))
            revert DeadlinePassed(0, deadline, uint64(block.timestamp));

        // Absorb pending slash funds into this round's reward pool
        uint256 pool = msg.value + pendingSlashFunds;
        pendingSlashFunds = 0;

        roundId = nextRoundId;
        unchecked { nextRoundId = roundId + 1; }

        _rounds[roundId] = ScoringRound({
            roundAddr:   roundAddr,
            rewardPool:  pool,
            deadline:    deadline,
            finalized:   false,
            scorerCount: 0
        });

        emit ScoringRoundOpened(roundId, roundAddr, pool, deadline);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  SCORE SUBMISSION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Submit computed scores for a scoring round.
     * @dev Permissionless call — but `scorerId` must be an active, registered scorer,
     *      and the caller must be that scorer's owner wallet.
     *      Scores must be provided in agent-ID ascending order (same ordering used by
     *      all scorers so that hashes can be compared directly).
     *      Emits {ScoresSubmitted}.
     * @param scoringRoundId The round to submit scores for.
     * @param scorerId       The scorer submitting (must be caller's scorer).
     * @param agentIds       Ordered array of agent IDs being scored.
     * @param scores         Score for each agent (same order as `agentIds`).
     */
    function submitScores(
        uint256 scoringRoundId,
        uint256 scorerId,
        uint256[] calldata agentIds,
        uint256[] calldata scores
    )
        external
        roundExists(scoringRoundId)
        scorerActive(scorerId)
        onlyScorerOwner(scorerId)
    {
        if (agentIds.length != scores.length)
            revert ArrayLengthMismatch(agentIds.length, scores.length);

        ScoringRound storage round = _rounds[scoringRoundId];

        if (round.finalized) revert RoundAlreadyFinalized(scoringRoundId);

        uint64 ts = uint64(block.timestamp);
        if (ts > round.deadline)
            revert DeadlinePassed(scoringRoundId, round.deadline, ts);

        // Prevent double submission
        if (_submissions[scoringRoundId][scorerId].scorerId != 0)
            revert AlreadySubmitted(scoringRoundId, scorerId);

        // Compute the canonical hash over the scores array only
        // forge-lint: disable-next-line(asm-keccak256) single dynamic array, inline assembly complexity not worth gas savings
        bytes32 hash = keccak256(abi.encodePacked(scores));

        _submissions[scoringRoundId][scorerId] = ScoreSubmission({
            scorerId:    scorerId,
            agentScores: scores,
            scoresHash:  hash,
            submittedAt: ts
        });

        _roundSubmitters[scoringRoundId].push(scorerId);

        // Store agentIds from first submission as the canonical reference
        if (_roundAgentIds[scoringRoundId].length == 0 && agentIds.length > 0) {
            for (uint256 i = 0; i < agentIds.length; ) {
                _roundAgentIds[scoringRoundId].push(agentIds[i]);
                unchecked { ++i; }
            }
        }

        unchecked { round.scorerCount += 1; }

        // Lock scorer until round is finalized
        unchecked { _scorerPendingRounds[scorerId] += 1; }

        emit ScoresSubmitted(scoringRoundId, scorerId, hash);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  CONSENSUS RESOLUTION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Resolve consensus for a scoring round after its deadline has passed.
     * @dev Permissionless — anyone may call this once the deadline is past.
     *
     *      Algorithm:
     *       1. Collect all submissions and group by `scoresHash`.
     *       2. Identify the hash with the most submissions.
     *       3. If `largestGroup * BPS_DENOMINATOR >= SCORER_CONSENSUS_BPS * total`
     *          → consensus reached.
     *          a. Agreeing scorers share the reward pool proportionally to their stake.
     *          b. Disagreeing scorers lose 50 % of stake (added to `pendingSlashFunds`).
     *       4. Otherwise → consensus failed.
     *          a. All scorer stats/stakes are left unchanged.
     *          b. The reward pool is moved to `stranded` for admin recovery.
     *
     *      Emits {ConsensusReached} or {ConsensusFailed}, plus {ScorerRewarded} and/or
     *      {ScorerSlashed} for each individual scorer in the consensus case.
     *
     * @param scoringRoundId The round to resolve.
     */
    function resolveConsensus(uint256 scoringRoundId)
        external
        nonReentrant
        roundExists(scoringRoundId)
    {
        ScoringRound storage round = _rounds[scoringRoundId];

        if (round.finalized) revert RoundAlreadyFinalized(scoringRoundId);

        uint64 ts = uint64(block.timestamp);
        if (ts <= round.deadline)
            revert DeadlineNotPassed(scoringRoundId, round.deadline, ts);

        uint256[] storage submitters = _roundSubmitters[scoringRoundId];
        uint256 total = submitters.length;

        // Require minimum participation
        if (total < uint256(3))
            revert NotEnoughSubmissions(scoringRoundId, total, 3);

        // ─── Step 1: Collect unique hashes and their submitter groups ────────
        // We do two passes: first find unique hashes, then count members.
        // Gas note: this is O(n²) in worst case. With a bounded scorer set this
        // is acceptable; for large networks an off-chain merkle proof scheme is
        // recommended in a future upgrade.

        bytes32[] memory uniqueHashes   = new bytes32[](total);
        uint256[] memory groupCounts    = new uint256[](total);
        uint256 uniqueCount;

        for (uint256 i = 0; i < total; ) {
            bytes32 h = _submissions[scoringRoundId][submitters[i]].scoresHash;
            bool found;

            for (uint256 j = 0; j < uniqueCount; ) {
                if (uniqueHashes[j] == h) {
                    unchecked { groupCounts[j] += 1; }
                    found = true;
                    break;
                }
                unchecked { ++j; }
            }

            if (!found) {
                uniqueHashes[uniqueCount] = h;
                groupCounts[uniqueCount]  = 1;
                unchecked { ++uniqueCount; }
            }

            unchecked { ++i; }
        }

        // ─── Step 2: Find the largest group ──────────────────────────────────
        uint256 winnerIdx;
        uint256 winnerCount;

        for (uint256 i = 0; i < uniqueCount; ) {
            if (groupCounts[i] > winnerCount) {
                winnerCount = groupCounts[i];
                winnerIdx   = i;
            }
            unchecked { ++i; }
        }

        bytes32 winnerHash = uniqueHashes[winnerIdx];

        // ─── Step 3: Check consensus threshold ───────────────────────────────
        // winnerCount / total >= SCORER_CONSENSUS_BPS / BPS_DENOMINATOR
        // ↔ winnerCount * BPS_DENOMINATOR >= SCORER_CONSENSUS_BPS * total
        bool consensusAchieved = (winnerCount * uint256(Constants.BPS_DENOMINATOR))
            >= (uint256(6667) * total);

        round.finalized = true;

        if (consensusAchieved) {
            _processConsensus(scoringRoundId, round, submitters, winnerHash, total, winnerCount);
        } else {
            _processFailed(scoringRoundId, round, submitters, total);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Return the consensus-agreed scores for a finalised round.
     * @dev Reverts if the round has not yet been finalized or did not reach consensus.
     * @param scoringRoundId The round to query.
     * @return agentIds  Ordered agent IDs (same as submitted).
     * @return scores    Consensus scores for each agent.
     */
    function getConsensusScores(uint256 scoringRoundId)
        external
        view
        roundExists(scoringRoundId)
        returns (uint256[] memory agentIds, uint256[] memory scores)
    {
        agentIds = _consensusAgentIds[scoringRoundId];
        scores   = _consensusScoreValues[scoringRoundId];
    }

    /**
     * @notice Retrieve the full Scorer struct for a given scorer ID.
     * @param scorerId The scorer to query.
     * @return The Scorer struct (memory copy).
     */
    function getScorerInfo(uint256 scorerId)
        external
        view
        scorerExists(scorerId)
        returns (Scorer memory)
    {
        return _scorers[scorerId];
    }

    /**
     * @notice Returns the total number of scorer IDs ever created (including inactive).
     * @return Count of all scorers ever registered (= nextScorerId - 1).
     */
    function getScorerCount() external view returns (uint256) {
        return nextScorerId - 1;
    }

    /**
     * @notice Returns the number of currently active scorers.
     * @dev O(n) scan — intended for off-chain reads and diagnostic tooling.
     * @return count Number of scorers with `active == true`.
     */
    function getActiveScorerCount() external view returns (uint256 count) {
        uint256 total = nextScorerId - 1;
        for (uint256 i = 1; i <= total; ) {
            if (_scorers[i].active) {
                unchecked { ++count; }
            }
            unchecked { ++i; }
        }
    }

    /**
     * @notice Check whether a scorer was part of the consensus group for a given round.
     * @dev Returns false if the round is not yet finalized or did not reach consensus.
     * @param scoringRoundId The scoring round.
     * @param scorerId       The scorer to check.
     * @return True if the scorer agreed with the consensus hash.
     */
    function isInConsensus(uint256 scoringRoundId, uint256 scorerId)
        external
        view
        returns (bool)
    {
        return _inConsensus[scoringRoundId][scorerId];
    }

    /**
     * @notice Return the scorer ID for a given wallet (0 if not a scorer).
     * @param wallet The wallet to look up.
     * @return scorerId The scorer ID, or 0 if none.
     */
    function getScorerIdByWallet(address wallet) external view returns (uint256) {
        return _walletToScorerId[wallet];
    }

    /**
     * @notice Return the full ScoringRound struct for a given round ID.
     * @param roundId The round to query.
     * @return The ScoringRound struct (memory copy).
     */
    function getRoundInfo(uint256 roundId)
        external
        view
        roundExists(roundId)
        returns (ScoringRound memory)
    {
        return _rounds[roundId];
    }

    /**
     * @notice Return the number of pending (unfinalized) rounds a scorer is locked into.
     * @param scorerId The scorer to query.
     * @return Pending round count.
     */
    function getPendingRoundCount(uint256 scorerId) external view returns (uint256) {
        return _scorerPendingRounds[scorerId];
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ADMIN: STRANDED FUNDS RECOVERY
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Recover ETH from failed rounds that had no consensus.
     * @dev Restricted to DEFAULT_ADMIN_ROLE. Emits {StrandedFundsRecovered}.
     * @param to Recipient of the recovered ETH.
     */
    function recoverStrandedFunds(address to)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = stranded;
        if (amount == 0) revert NothingToRecover();

        stranded = 0;

        emit StrandedFundsRecovered(to, amount);
        _sendEth(to, amount);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Execute consensus-reached logic: reward agreeing scorers, slash disagreeing
     *      scorers, store consensus scores, and unlock all submitters.
     */
    function _processConsensus(
        uint256 scoringRoundId,
        ScoringRound storage round,
        uint256[] storage submitters,
        bytes32 winnerHash,
        uint256 total,
        uint256 winnerCount
    ) internal {
        // ── Compute total stake of agreeing scorers (for proportional reward) ─
        uint256 totalAgreeingStake;
        for (uint256 i = 0; i < total; ) {
            uint256 sid = submitters[i];
            if (_submissions[scoringRoundId][sid].scoresHash == winnerHash) {
                totalAgreeingStake += _scorers[sid].stakedAmount;
            }
            unchecked { ++i; }
        }

        uint256 rewardPool = round.rewardPool;
        uint256 newSlash;

        // ── Process each submitter ────────────────────────────────────────────
        for (uint256 i = 0; i < total; ) {
            uint256 sid = submitters[i];
            Scorer storage scorer = _scorers[sid];
            bool agreed = _submissions[scoringRoundId][sid].scoresHash == winnerHash;

            // Update stats
            unchecked { scorer.totalScorings += 1; }

            if (agreed) {
                _inConsensus[scoringRoundId][sid] = true;
                unchecked { scorer.correctScorings += 1; }

                // Proportional reward: rewardPool * stake / totalAgreeingStake
                uint256 reward = (totalAgreeingStake > 0)
                    ? (rewardPool * scorer.stakedAmount) / totalAgreeingStake
                    : 0;

                if (reward > 0) {
                    emit ScorerRewarded(scoringRoundId, sid, reward);
                    _sendEth(scorer.wallet, reward);
                }
            } else {
                // Slash 50% of stake
                uint256 slash = scorer.stakedAmount / 2;
                scorer.stakedAmount -= slash;
                unchecked {
                    scorer.slashedCount += 1;
                    newSlash            += slash;
                }
                emit ScorerSlashed(scoringRoundId, sid, slash, scorer.stakedAmount);
            }

            // Unlock from pending round
            if (_scorerPendingRounds[sid] > 0) {
                unchecked { _scorerPendingRounds[sid] -= 1; }
            }

            unchecked { ++i; }
        }

        // ── Accumulate slash funds for next round ────────────────────────────
        pendingSlashFunds += newSlash;

        // ── Store consensus scores ───────────────────────────────────────────
        // Use the first agreeing submission as the canonical result
        for (uint256 i = 0; i < total; ) {
            uint256 sid = submitters[i];
            if (_submissions[scoringRoundId][sid].scoresHash == winnerHash) {
                ScoreSubmission storage sub = _submissions[scoringRoundId][sid];
                uint256[] storage agentIds  = _roundAgentIds[scoringRoundId];

                // Copy agentIds
                for (uint256 j = 0; j < agentIds.length; ) {
                    _consensusAgentIds[scoringRoundId].push(agentIds[j]);
                    unchecked { ++j; }
                }
                // Copy scores
                for (uint256 j = 0; j < sub.agentScores.length; ) {
                    _consensusScoreValues[scoringRoundId].push(sub.agentScores[j]);
                    unchecked { ++j; }
                }
                _consensusReached[scoringRoundId] = true;
                break;
            }
            unchecked { ++i; }
        }

        emit ConsensusReached(scoringRoundId, winnerHash, winnerCount, total, rewardPool);
    }

    /**
     * @dev Execute consensus-failed logic: move reward pool to stranded, unlock scorers.
     *      No stakes are slashed; all submitters are unlocked.
     */
    function _processFailed(
        uint256 scoringRoundId,
        ScoringRound storage round,
        uint256[] storage submitters,
        uint256 total
    ) internal {
        uint256 pool = round.rewardPool;
        stranded += pool;

        // Unlock all submitters (no stats update, no slash)
        for (uint256 i = 0; i < total; ) {
            uint256 sid = submitters[i];
            if (_scorerPendingRounds[sid] > 0) {
                unchecked { _scorerPendingRounds[sid] -= 1; }
            }
            unchecked { ++i; }
        }

        emit ConsensusFailed(scoringRoundId, total, pool);
    }

    /**
     * @dev Internal ETH transfer helper. Reverts with {EthTransferFailed} on failure.
     * @param to     Recipient.
     * @param amount ETH in wei.
     */
    function _sendEth(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed(to, amount);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  UUPS UPGRADE AUTHORISATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Restricts implementation upgrades to addresses with UPGRADER_ROLE.
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

    // ═══════════════════════════════════════════════════════════════════════
    //  RECEIVE / FALLBACK
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Reject plain ETH transfers not going through a proper entry point.
     *      This prevents accidental ETH loss.
     */
    receive() external payable {
        revert("Use registerScorer or openScoringRound");
    }
}
