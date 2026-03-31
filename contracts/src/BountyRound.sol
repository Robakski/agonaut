// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Constants} from "./Constants.sol";

// ============================================================
//                        INTERFACES
// ============================================================

interface IArenaRegistry {
    function isActive(uint256 agentId) external view returns (bool);
    function getTier(uint256 agentId) external view returns (uint8);
    function recordRoundResult(uint256 agentId, bool won, uint256 winnings) external;
    function getAgent(uint256 agentId)
        external
        view
        returns (
            address wallet,
            bytes32 metadataHash,
            uint64 registeredAt,
            uint64 deregisteredAt,
            uint16 stableId,
            uint16 eloRating,
            uint256 totalWinnings,
            uint32 roundsEntered,
            uint32 roundsWon
        );
}

interface IEloSystem {
    function updateAfterRound(uint256[] calldata rankedAgentIds) external;
    function getStakeCap(uint8 tier) external pure returns (uint256);
}

interface IScoringOracle {
    function getScores(address roundAddr)
        external
        view
        returns (uint256[] memory agentIds, uint256[] memory scores);
    function isResultVerified(address roundAddr) external view returns (bool);
}

interface IStableRegistry {
    function getAgentStable(uint256 agentId) external view returns (uint16);
    function distributeRevenue(uint16 stableId, uint256 agentId, uint256 totalPrize) external payable;
    /// @dev Use getStableShare() — NOT getStable() — because the full Stable struct
    ///      contains a dynamic `string name` which breaks tuple-style ABI decoding.
    function getStableShare(uint16 stableId) external view returns (address owner, uint16 revenueShareBps);
}

interface ISeasonManager {
    function recordRoundResult(uint256 seasonId, uint256[] calldata rankedAgentIds) external;
}

// ============================================================
//                        BOUNTY ROUND
// ============================================================

/// @title BountyRound
/// @author Agonaut Protocol
/// @notice Sponsor-funded bounty round. Sponsor deposits the prize pool; agents pay a small entry fee.
/// @dev Deployed as a minimal proxy clone by BountyFactory.
///      Lifecycle: OPEN → COMMIT → SCORING → SETTLED (or CANCELLED/DISPUTED).
///      Deposit starts the clock immediately — no separate FUNDED phase.
///      Solutions are submitted OFF-CHAIN to the Phala TEE scoring service. Only hashes are stored on-chain.
///      Scores are submitted to ScoringOracle by the authorized scorer after TEE evaluation.
contract BountyRound is Initializable, ReentrancyGuard {
    // ============================================================
    //                        ENUMS & STRUCTS
    // ============================================================

    enum Phase {
        OPEN,
        FUNDED,
        COMMIT,
        SCORING,
        SETTLED,
        CANCELLED,
        DISPUTED
    }

    struct Commitment {
        bytes32 solutionHash;
        uint64 committedAt;
    }

    // ============================================================
    //                        CUSTOM ERRORS
    // ============================================================

    error NotFactory();
    error NotSponsor();
    error WrongPhase(Phase current, Phase expected);
    error AgentNotActive(uint256 agentId);
    error TierMismatch(uint8 agentTier, uint8 required);
    error IncorrectFee(uint256 sent, uint256 required);
    error NotAgentWallet(address sender, address expected);
    error MaxAgentsReached(uint8 max);
    error AlreadyEntered(uint256 agentId);
    error CommitDeadlinePassed();
    error CommitDeadlineNotReached();
    error NotCancelled();
    error NotParticipant(uint256 agentId);
    error AlreadyWithdrawn(uint256 agentId);
    error TransferFailed(address to, uint256 amount);
    error NoParticipants();
    error PayoutsAlreadyComplete();
    error BountyNotFunded();
    error AgentsAlreadyEntered();
    error NotInScoringPhase();
    error ZeroDeposit();
    error BountyTooSmall(uint256 sent, uint256 minimum);
    error NothingToClaim();
    error ClaimsExpired();
    error ClaimsNotExpired();
    error FundsAlreadyAllocated();
    error ScoringResultNotVerified();
    error ScoringNotTimedOut();

    // ============================================================
    //                        EVENTS
    // ============================================================

    event RoundInitialized(uint256 indexed bountyId, uint256 indexed roundIndex, bytes32 problemCid);
    event BountyDeposited(address indexed sponsor, uint256 amount);
    event AgentEntered(uint256 indexed agentId, uint256 fee);
    event CommitPhaseStarted(uint64 deadline);
    event SolutionCommitted(uint256 indexed agentId, bytes32 solutionHash);
    event ScoringPhaseStarted(uint256 scoringRoundId);
    event RoundFinalized(uint256[] rankedAgents, uint256[] rankedScores, uint256 payoutBps);
    event PrizeDistributed(uint256 indexed agentId, uint256 grossPrize, uint256 protocolFee, uint256 netToAgent);
    event SponsorRefunded(address indexed sponsor, uint256 amount);
    event EntryFeesCollected(address indexed treasury, uint256 amount);
    event RoundCancelled(string reason);
    event EmergencyWithdrawal(uint256 indexed agentId, uint256 amount);
    event RoundDisputed(address indexed disputant);
    event FundsAllocated(uint256 totalAllocated);
    event FundsClaimed(address indexed recipient, uint256 amount);
    event ClaimFailed(address indexed recipient, uint256 amount);
    event ExpiredFundsSwept(address indexed treasury, uint256 amount);

    // ============================================================
    //                        STATE
    // ============================================================

    Phase public phase;
    uint256 public bountyId;
    uint256 public roundIndex;
    address public factory;

    // External contracts
    IArenaRegistry public arenaRegistry;
    IEloSystem public eloSystem;
    IStableRegistry public stableRegistry;
    ISeasonManager public seasonManager;
    address public treasury;
    IScoringOracle public scoringOracle;

    // Problem configuration
    bytes32 public problemCid;
    uint32 public commitDuration;

    // Round parameters
    uint16[] public prizeDistribution;
    uint16 public protocolFeeBps;
    uint8 public maxAgents;
    uint8 public requiredTier;
    uint256 public seasonId;

    // ── Bounty Economics ──────────────────────────────────────────
    address public sponsor;
    uint256 public sponsorDeposit;
    uint256 public entryFee;
    uint256 public totalEntryFees;
    uint16 public acceptanceThreshold;
    bool public graduatedPayouts;

    // Phase deadlines
    uint64 public commitDeadline;

    // Scoring
    uint256 public scoringRoundId;
    /// @notice Timestamp when scoring phase started (for timeout detection).
    uint64 public scoringStartedAt;

    // Participants
    uint256[] public participants;
    mapping(uint256 => Commitment) public commitments;
    mapping(uint256 => bool) private _isParticipant;
    mapping(uint256 => bool) private _hasWithdrawn;

    // Results
    uint256[] public rankedAgents;
    uint256[] public rankedScores;
    uint256 public totalPrizePool; // = sponsorDeposit (the actual prize pool)
    bool public payoutsComplete;

    // ── Pull-based Claims ─────────────────────────────────────────
    /// @dev Maps recipient address → claimable ETH balance.
    ///      Set during finalize(), withdrawn via claim().
    mapping(address => uint256) public claimable;
    /// @dev Total ETH allocated to claims (for accounting invariant checks).
    uint256 public totalClaimable;
    /// @dev Tracks whether finalization has allocated funds (prevents re-finalize).
    bool public fundsAllocated;
    /// @dev Timestamp when claims were allocated (for expiry).
    uint64 public claimsAllocatedAt;
    /// @dev Claims expire after 90 days — unclaimed funds swept to treasury.
    uint64 public constant CLAIM_EXPIRY = 90 days;

    // ============================================================
    //                        MODIFIERS
    // ============================================================

    function _requireOnlyFactory() internal view {
        if (msg.sender != factory) revert NotFactory();
    }

    modifier onlyFactory() {
        _requireOnlyFactory();
        _;
    }

    function _requireOnlySponsor() internal view {
        if (msg.sender != sponsor) revert NotSponsor();
    }

    modifier onlySponsor() {
        _requireOnlySponsor();
        _;
    }

    function _requireInPhase(Phase expected) internal view {
        if (phase != expected) revert WrongPhase(phase, expected);
    }

    modifier inPhase(Phase expected) {
        _requireInPhase(expected);
        _;
    }

    // ============================================================
    //                        INITIALIZATION
    // ============================================================

    /// @notice Initializes the round. Called once by BountyFactory after clone deployment.
    /// @param _bountyId The bounty this round belongs to.
    /// @param _roundIndex The index of this round within the bounty.
    /// @param _factory The BountyFactory address (privileged caller).
    /// @param _contracts Packed addresses: [arenaRegistry, eloSystem, stableRegistry, seasonManager, treasury, scoringOracle].
    /// @param _problemCid IPFS CID of the problem description.
    /// @param _entryFee Small anti-spam fee per agent (in wei).
    /// @param _commitDuration Duration of the commit phase in seconds.
    /// @param _prizeDistribution BPS distribution for winners (must sum to BPS_DENOMINATOR).
    /// @param _protocolFeeBps Protocol fee in basis points.
    /// @param _maxAgents Maximum number of agents (0 = unlimited).
    /// @param _requiredTier Required agent tier to enter.
    /// @param _seasonId Season this round belongs to (0 = none).
    /// @param _acceptanceThreshold Minimum score (0-10000 BPS) for full payout.
    /// @param _graduatedPayouts Whether partial payouts are enabled.
    /// @param _sponsor Address that will fund the bounty.
    function initialize(
        uint256 _bountyId,
        uint256 _roundIndex,
        address _factory,
        address[6] calldata _contracts,
        bytes32 _problemCid,
        uint256 _entryFee,
        uint32 _commitDuration,
        uint16[] calldata _prizeDistribution,
        uint16 _protocolFeeBps,
        uint8 _maxAgents,
        uint8 _requiredTier,
        uint256 _seasonId,
        uint16 _acceptanceThreshold,
        bool _graduatedPayouts,
        address _sponsor
    ) external initializer {
        bountyId = _bountyId;
        roundIndex = _roundIndex;
        factory = _factory;

        arenaRegistry = IArenaRegistry(_contracts[0]);
        eloSystem = IEloSystem(_contracts[1]);
        stableRegistry = IStableRegistry(_contracts[2]);
        seasonManager = ISeasonManager(_contracts[3]);
        treasury = _contracts[4];
        scoringOracle = IScoringOracle(_contracts[5]);

        problemCid = _problemCid;
        entryFee = _entryFee;
        commitDuration = _commitDuration;
        prizeDistribution = _prizeDistribution;
        protocolFeeBps = _protocolFeeBps;
        maxAgents = _maxAgents;
        requiredTier = _requiredTier;
        seasonId = _seasonId;

        acceptanceThreshold = _acceptanceThreshold;
        graduatedPayouts = _graduatedPayouts;
        sponsor = _sponsor;

        phase = Phase.OPEN;

        emit RoundInitialized(_bountyId, _roundIndex, _problemCid);
    }

    // ============================================================
    //                        SPONSOR DEPOSIT
    // ============================================================

    /// @notice Sponsor deposits the bounty prize into escrow. Transitions OPEN → COMMIT.
    /// @dev Timer starts immediately — agents can enter and submit during the commit window.
    ///      If deadline passes with no qualifying solutions, sponsor gets 100% refund.
    function depositBounty() external payable onlySponsor inPhase(Phase.OPEN) {
        if (msg.value == 0) revert ZeroDeposit();
        if (msg.value < Constants.MIN_BOUNTY_DEPOSIT) revert BountyTooSmall(msg.value, Constants.MIN_BOUNTY_DEPOSIT);

        sponsorDeposit = msg.value;
        totalPrizePool = msg.value;

        // Start the clock immediately — skip FUNDED phase
        commitDeadline = uint64(block.timestamp) + commitDuration;
        phase = Phase.COMMIT;

        emit BountyDeposited(msg.sender, msg.value);
        emit CommitPhaseStarted(commitDeadline);
    }

    // ============================================================
    //                        COMMIT PHASE — AGENT ENTRY & SOLUTIONS
    // ============================================================

    /// @notice Enter the round as an agent. Pays entry fee in ETH via msg.value.
    /// @dev Agents can enter anytime during the commit window (before deadline).
    ///      Entry fees accumulate in the contract and are allocated to treasury at finalization.
    /// @param agentId The agent's registry ID.
    function enter(uint256 agentId) external payable inPhase(Phase.COMMIT) {
        if (block.timestamp > commitDeadline) revert CommitDeadlinePassed();
        if (!arenaRegistry.isActive(agentId)) revert AgentNotActive(agentId);

        uint8 agentTier = arenaRegistry.getTier(agentId);
        if (agentTier != requiredTier) revert TierMismatch(agentTier, requiredTier);

        (address wallet,,,,,,,,) = arenaRegistry.getAgent(agentId);
        if (msg.sender != wallet) revert NotAgentWallet(msg.sender, wallet);

        if (maxAgents > 0 && participants.length >= maxAgents) revert MaxAgentsReached(maxAgents);

        if (_isParticipant[agentId]) revert AlreadyEntered(agentId);

        // ── Collect ETH entry fee — accumulates in contract, sent to treasury at finalize ──
        if (msg.value != entryFee) revert IncorrectFee(msg.value, entryFee);

        _isParticipant[agentId] = true;
        participants.push(agentId);
        totalEntryFees += msg.value;

        emit AgentEntered(agentId, msg.value);
    }

    // ============================================================
    //                        COMMIT PHASE
    // ============================================================

    /// @notice Legacy: was used to transition FUNDED → COMMIT. Now a no-op since deposit starts the clock.
    /// @dev Kept for backward compatibility. Reverts because phase is never FUNDED anymore.
    function startCommitPhase() external onlyFactory inPhase(Phase.FUNDED) {
        // This will always revert since depositBounty() skips FUNDED → goes to COMMIT directly.
        // Kept to preserve function selector for any existing integrations.
        commitDeadline = uint64(block.timestamp) + commitDuration;
        phase = Phase.COMMIT;
        emit CommitPhaseStarted(commitDeadline);
    }

    /// @notice Commit a hashed solution during the commit phase.
    /// @param agentId The agent's registry ID.
    /// @param solutionHash keccak256(abi.encodePacked(solution, salt)).
    function commitSolution(uint256 agentId, bytes32 solutionHash) external inPhase(Phase.COMMIT) {
        if (block.timestamp > commitDeadline) revert CommitDeadlinePassed();
        if (!_isParticipant[agentId]) revert NotParticipant(agentId);

        (address wallet,,,,,,,,) = arenaRegistry.getAgent(agentId);
        if (msg.sender != wallet) revert NotAgentWallet(msg.sender, wallet);

        commitments[agentId] = Commitment({solutionHash: solutionHash, committedAt: uint64(block.timestamp)});

        emit SolutionCommitted(agentId, solutionHash);
    }

    // ============================================================
    //                        SCORING PHASE
    // ============================================================

    /// @notice Transition from COMMIT to SCORING. Anyone can call after commit deadline.
    /// @dev Solutions are submitted off-chain to the Phala TEE scoring service.
    ///      Agents submit encrypted solutions to the scoring API, referencing their on-chain commit hash.
    ///      The TEE evaluates solutions and the scorer submits results to ScoringOracle.
    ///      finalize() reads the verified result from ScoringOracle.
    ///      If no agents entered, use cancelExpired() instead for full sponsor refund.
    function startScoringPhase() external inPhase(Phase.COMMIT) {
        if (block.timestamp <= commitDeadline) revert CommitDeadlineNotReached();
        if (participants.length == 0) revert NoParticipants();

        phase = Phase.SCORING;
        scoringStartedAt = uint64(block.timestamp);

        emit ScoringPhaseStarted(0);
    }

    /// @notice Cancel an expired bounty with no submissions. Anyone can call after deadline.
    /// @dev Full refund to sponsor — no protocol fee charged. Entry fees (if any agents
    ///      entered but didn't submit) are still returned to agents via emergencyWithdraw().
    function cancelExpired() external inPhase(Phase.COMMIT) {
        if (block.timestamp <= commitDeadline) revert CommitDeadlineNotReached();

        phase = Phase.CANCELLED;
        emit RoundCancelled("Deadline passed - no qualifying submissions");
    }

    // ============================================================
    //                        DISPUTE
    // ============================================================

    /// @notice Cancel if TEE scoring timed out. Anyone can call.
    /// @dev If the scoring service doesn't deliver results within SCORING_TIMEOUT, the round is cancelled
    ///      and all funds are refundable (sponsor deposit + agent entry fees).
    function cancelScoringTimeout() external inPhase(Phase.SCORING) {
        if (block.timestamp <= scoringStartedAt + Constants.SCORING_TIMEOUT) revert ScoringNotTimedOut();

        phase = Phase.CANCELLED;
        emit RoundCancelled("Scoring timed out");
    }

    /// @notice Trigger arbitration dispute. Transitions SCORING → DISPUTED.
    /// @dev Either the sponsor or any participant can dispute. Resolution handled by ArbitrationDAO.
    function dispute() external inPhase(Phase.SCORING) {
        // Only sponsor or participants can dispute
        bool authorized = (msg.sender == sponsor);
        if (!authorized) {
            for (uint256 i; i < participants.length; ++i) {
                (address wallet,,,,,,,,) = arenaRegistry.getAgent(participants[i]);
                if (msg.sender == wallet) {
                    authorized = true;
                    break;
                }
            }
        }
        require(authorized, "Not authorized to dispute");

        phase = Phase.DISPUTED;
        emit RoundDisputed(msg.sender);
    }

    // ============================================================
    //                        FINALIZATION
    // ============================================================

    /// @notice Finalize the round: read TEE-verified scores, rank agents, ALLOCATE prizes (pull-based).
    /// @dev Does NOT push ETH to anyone. All recipients must call claim() to withdraw.
    ///      Scores are read from ScoringOracle, which receives them from the authorized TEE scorer.
    ///      Solutions were evaluated inside Phala TEE — solution content never touches this contract.
    function finalize() external nonReentrant inPhase(Phase.SCORING) {
        if (fundsAllocated) revert FundsAlreadyAllocated();

        // Verify TEE scoring result is available
        if (!scoringOracle.isResultVerified(address(this))) revert ScoringResultNotVerified();

        // Read verified scores from ScoringOracle
        (uint256[] memory agentIds, uint256[] memory scores) =
            scoringOracle.getScores(address(this));

        // Validate all scored agents are actual participants (defense-in-depth)
        for (uint256 i; i < agentIds.length; ++i) {
            if (!_isParticipant[agentIds[i]]) revert NotParticipant(agentIds[i]);
        }

        // Build ranked arrays (insertion sort descending)
        uint256 len = agentIds.length;
        uint256[] memory _ranked = new uint256[](len);
        uint256[] memory _scores = new uint256[](len);

        for (uint256 i; i < len; ++i) {
            _ranked[i] = agentIds[i];
            _scores[i] = scores[i];
        }

        for (uint256 i = 1; i < len; ++i) {
            uint256 keyScore = _scores[i];
            uint256 keyAgent = _ranked[i];
            uint256 j = i;
            while (j > 0 && _scores[j - 1] < keyScore) {
                _scores[j] = _scores[j - 1];
                _ranked[j] = _ranked[j - 1];
                --j;
            }
            _scores[j] = keyScore;
            _ranked[j] = keyAgent;
        }

        rankedAgents = _ranked;
        rankedScores = _scores;

        // ── Determine payout percentage based on acceptance threshold ──
        uint256 bestScore = len > 0 ? _scores[0] : 0;
        uint256 payoutBps;

        if (bestScore >= acceptanceThreshold) {
            payoutBps = Constants.BPS_DENOMINATOR; // 100%
        } else if (graduatedPayouts) {
            uint256 tier1Min = (uint256(acceptanceThreshold) * Constants.GRADUATED_TIER1_PERCENT_BPS) / Constants.BPS_DENOMINATOR;
            uint256 tier2Min = (uint256(acceptanceThreshold) * Constants.GRADUATED_TIER2_PERCENT_BPS) / Constants.BPS_DENOMINATOR;

            if (bestScore >= tier1Min) {
                payoutBps = Constants.GRADUATED_TIER1_PAYOUT_BPS;
            } else if (bestScore >= tier2Min) {
                payoutBps = Constants.GRADUATED_TIER2_PAYOUT_BPS;
            } else {
                payoutBps = 0;
            }
        } else {
            payoutBps = 0;
        }

        // ── Calculate effective bounty ──
        // Sponsor's full deposit goes to winners (minus only protocol fee per winner).
        // Scoring costs are covered by agent entry fees — clean pricing for sponsors.
        uint256 effectiveBounty = (sponsorDeposit * payoutBps) / Constants.BPS_DENOMINATOR;
        uint256 refundAmount = sponsorDeposit - effectiveBounty;

        uint256 allocated = 0;

        // ── Allocate effective bounty to winner claim balances ──
        uint256 totalDistributed = 0;
        if (effectiveBounty > 0) {
            uint256 prizeSlots = prizeDistribution.length;
            uint256 winnersCount = len < prizeSlots ? len : prizeSlots;

            for (uint256 i; i < winnersCount; ++i) {
                uint256 agentId = _ranked[i];
                uint256 grossPrize = (effectiveBounty * prizeDistribution[i]) / Constants.BPS_DENOMINATOR;

                if (grossPrize == 0) continue;
                totalDistributed += grossPrize;

                // 0. Hardcoded fee cap — safety net against malicious upgrades
                require(protocolFeeBps <= Constants.MAX_PROTOCOL_FEE_BPS, "Fee exceeds cap");

                // 1. Protocol fee → Treasury
                uint256 protocolFee = (grossPrize * protocolFeeBps) / Constants.BPS_DENOMINATOR;
                uint256 afterFee = grossPrize - protocolFee;
                claimable[treasury] += protocolFee;
                allocated += protocolFee;

                // 2. Stable revenue share → Stable owner
                uint16 stableId = stableRegistry.getAgentStable(agentId);
                uint256 stableCut = 0;
                if (stableId > 0) {
                    (address stableOwner, uint16 revenueShareBps) = stableRegistry.getStableShare(stableId);
                    stableCut = (afterFee * revenueShareBps) / Constants.BPS_DENOMINATOR;
                    if (stableCut > 0) {
                        claimable[stableOwner] += stableCut;
                        allocated += stableCut;
                    }
                }

                // 3. Agent's net cut → Agent wallet
                uint256 agentCut = afterFee - stableCut;
                (address wallet,,,,,,,,) = arenaRegistry.getAgent(agentId);
                claimable[wallet] += agentCut;
                allocated += agentCut;

                emit PrizeDistributed(agentId, grossPrize, protocolFee, agentCut);
            }

            // ── Refund undistributed prize slots to sponsor ──
            // When fewer agents than prize slots, empty slots' share goes back to sponsor
            uint256 undistributed = effectiveBounty - totalDistributed;
            if (undistributed > 0) {
                refundAmount += undistributed;
            }
        }

        // ── Allocate accumulated ETH entry fees to treasury ──
        if (totalEntryFees > 0) {
            claimable[treasury] += totalEntryFees;
            allocated += totalEntryFees;
            emit EntryFeesCollected(treasury, totalEntryFees);
        }

        // ── Allocate refund to sponsor ──
        if (refundAmount > 0) {
            claimable[sponsor] += refundAmount;
            allocated += refundAmount;
            emit SponsorRefunded(sponsor, refundAmount);
        }

        // ── Record totals and timestamp ──
        totalClaimable = allocated;
        fundsAllocated = true;
        claimsAllocatedAt = uint64(block.timestamp);

        // ── Record results (external calls — safe because no ETH transfers) ──
        eloSystem.updateAfterRound(rankedAgents);

        uint256 prizeSlots2 = prizeDistribution.length;
        uint256 winnersCount2 = len < prizeSlots2 ? len : prizeSlots2;
        for (uint256 i; i < len; ++i) {
            bool won = i < winnersCount2;
            uint256 winnings = 0;
            if (won && effectiveBounty > 0) {
                winnings = (effectiveBounty * prizeDistribution[i]) / Constants.BPS_DENOMINATOR;
            }
            arenaRegistry.recordRoundResult(_ranked[i], won, winnings);
        }

        if (seasonId > 0) {
            seasonManager.recordRoundResult(seasonId, rankedAgents);
        }

        payoutsComplete = true;
        phase = Phase.SETTLED;

        emit RoundFinalized(rankedAgents, rankedScores, payoutBps);
        emit FundsAllocated(allocated);
    }

    // ============================================================
    //                        PULL-BASED CLAIMS
    // ============================================================

    /// @notice Claim allocated funds. Anyone can call on behalf of any recipient.
    /// @dev Pull-based: each recipient withdraws independently. One reverting recipient
    ///      cannot block others. Uses CEI pattern (zero balance before transfer).
    /// @param recipient The address to claim for.
    function claim(address recipient) external nonReentrant {
        uint256 amount = claimable[recipient];
        if (amount == 0) revert NothingToClaim();
        if (block.timestamp > claimsAllocatedAt + CLAIM_EXPIRY) revert ClaimsExpired();

        // Effects — zero before transfer (CEI)
        claimable[recipient] = 0;
        totalClaimable -= amount;

        // Interaction
        _safeTransferEth(recipient, amount);

        emit FundsClaimed(recipient, amount);
    }

    /// @notice Batch claim for multiple recipients in one transaction.
    /// @dev Skips recipients with zero balance (does not revert). Gas-efficient for
    ///      protocols/frontends that want to process all claims at once.
    /// @param recipients Array of addresses to claim for.
    function claimBatch(address[] calldata recipients) external nonReentrant {
        if (block.timestamp > claimsAllocatedAt + CLAIM_EXPIRY) revert ClaimsExpired();

        for (uint256 i; i < recipients.length; ++i) {
            uint256 amount = claimable[recipients[i]];
            if (amount == 0) continue;

            claimable[recipients[i]] = 0;
            totalClaimable -= amount;

            // Use low-level call so one failed transfer doesn't revert the batch
            (bool success,) = recipients[i].call{value: amount}("");
            if (success) {
                emit FundsClaimed(recipients[i], amount);
            } else {
                // Re-credit if transfer failed — recipient can try again individually
                claimable[recipients[i]] = amount;
                totalClaimable += amount;
                emit ClaimFailed(recipients[i], amount);
            }
        }
    }

    /// @notice Sweep unclaimed funds to treasury after 90-day expiry.
    /// @dev Prevents permanent fund lockup. Anyone can call after expiry.
    function sweepExpiredClaims() external nonReentrant {
        if (!fundsAllocated) revert FundsAlreadyAllocated();
        if (block.timestamp <= claimsAllocatedAt + CLAIM_EXPIRY) revert ClaimsNotExpired();

        uint256 remaining = totalClaimable;
        if (remaining == 0) revert NothingToClaim();

        totalClaimable = 0;

        _safeTransferEth(treasury, remaining);

        emit ExpiredFundsSwept(treasury, remaining);
    }

    /// @notice View function: check claimable balance for any address.
    /// @param recipient The address to query.
    /// @return amount Claimable ETH in wei.
    function getClaimable(address recipient) external view returns (uint256 amount) {
        return claimable[recipient];
    }

    // ============================================================
    //                        CANCELLATION
    // ============================================================

    /// @notice Cancel the round. Only callable by factory (before agents enter) or sponsor (before agents enter).
    /// @param reason Human-readable cancellation reason.
    function cancel(string calldata reason) external {
        // Factory can always cancel
        // Sponsor can cancel only if no agents have entered
        if (msg.sender == factory) {
            // factory can cancel anytime
        } else if (msg.sender == sponsor) {
            if (participants.length > 0) revert AgentsAlreadyEntered();
        } else {
            revert NotFactory();
        }

        phase = Phase.CANCELLED;
        emit RoundCancelled(reason);
    }

    /// @notice Withdraw entry fee after cancellation.
    /// @param agentId The agent's registry ID.
    function emergencyWithdraw(uint256 agentId) external nonReentrant {
        if (phase != Phase.CANCELLED) revert NotCancelled();
        if (!_isParticipant[agentId]) revert NotParticipant(agentId);
        if (_hasWithdrawn[agentId]) revert AlreadyWithdrawn(agentId);

        (address wallet,,,,,,,,) = arenaRegistry.getAgent(agentId);
        if (msg.sender != wallet) revert NotAgentWallet(msg.sender, wallet);

        _hasWithdrawn[agentId] = true;

        // Refund entry fee to agent
        _safeTransferEth(wallet, entryFee);

        emit EmergencyWithdrawal(agentId, entryFee);
    }

    /// @notice Sponsor reclaims full deposit after cancellation.
    function sponsorWithdraw() external nonReentrant onlySponsor {
        if (phase != Phase.CANCELLED) revert NotCancelled();
        if (sponsorDeposit == 0) revert ZeroDeposit();

        uint256 amount = sponsorDeposit;
        sponsorDeposit = 0;
        totalPrizePool = 0;

        _safeTransferEth(sponsor, amount);
        emit SponsorRefunded(sponsor, amount);
    }

    // ============================================================
    //                        VIEW FUNCTIONS
    // ============================================================

    function getParticipantCount() external view returns (uint256) {
        return participants.length;
    }

    function getRanking() external view returns (uint256[] memory agentIds, uint256[] memory scores) {
        return (rankedAgents, rankedScores);
    }

    function getCommitment(uint256 agentId) external view returns (bytes32 hash, uint64 timestamp) {
        Commitment storage c = commitments[agentId];
        return (c.solutionHash, c.committedAt);
    }

    function isParticipant(uint256 agentId) external view returns (bool) {
        return _isParticipant[agentId];
    }

    function getPhase() external view returns (Phase) {
        return phase;
    }

    // ============================================================
    //                        INTERNALS
    // ============================================================

    function _safeTransferEth(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool success,) = to.call{value: amount}("");
        if (!success) revert TransferFailed(to, amount);
    }
}
