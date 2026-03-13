// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Constants} from "../Constants.sol";

// ============================================================
//                       INTERFACES
// ============================================================

/// @notice Minimal interface for reading results from a BountyRound.
interface IBountyRound {
    /// @notice Returns the final ranking after the round is settled.
    /// @return agentIds  Ordered array of agent IDs (index 0 = 1st place).
    /// @return scores    Corresponding scores for each agent.
    function getRanking() external view returns (uint256[] memory agentIds, uint256[] memory scores);

    /// @notice Returns the current phase of the round.
    /// @dev Phase 4 = SETTLED (results are final and can be read).
    function phase() external view returns (uint8);
}

// ============================================================
//                    CUSTOM ERRORS
// ============================================================

/// @dev Thrown when a caller supplies address(0) for a required address parameter.
error ZeroAddress();

/// @dev Thrown when feeBps exceeds 10 000 (100%).
error FeeTooHigh();

/// @dev Thrown when the market ID does not exist.
error MarketNotFound(uint256 marketId);

/// @dev Thrown when a bet is placed after the market deadline.
error BettingClosed(uint256 marketId, uint64 deadline);

/// @dev Thrown when msg.value is zero.
error ZeroBet();

/// @dev Thrown when resolve() is called but the round is not yet settled.
error RoundNotSettled(uint256 marketId);

/// @dev Thrown when resolve() is called on an already-resolved market.
error AlreadyResolved(uint256 marketId);

/// @dev Thrown when claim() is called on an unresolved market.
error NotYetResolved(uint256 marketId);

/// @dev Thrown when a user tries to claim but has no winning bet.
error NothingToClaim(uint256 marketId, address user);

/// @dev Thrown when a user tries to claim but has already claimed.
error AlreadyClaimed(uint256 marketId, address user);

/// @dev Thrown when topN is zero, which would make the market trivially true.
error InvalidTopN();

/// @dev Thrown when deadline is not in the future.
error DeadlineInPast(uint64 deadline);

/// @dev Thrown when the ETH transfer to treasury fails.
error TreasuryTransferFailed();

/// @dev Thrown when the ETH transfer to claimer fails.
error ClaimTransferFailed();

// ============================================================
//                   PREDICTION MARKET
// ============================================================

/**
 * @title  PredictionMarket
 * @author Agonaut Protocol
 * @notice Binary-outcome AMM where anyone can bet on whether Agent X will finish
 *         in the top N positions of a BountyRound.
 *
 * @dev    This contract is **immutable** (no upgradeability). Deploy once, it lives
 *         forever. A protocol fee (feeBps) is taken from the winner pool on claim
 *         and sent to the treasury.
 *
 *         Lifecycle of a market:
 *         1. Anyone calls `createMarket` with a BountyRound address, an agent ID,
 *            a top-N threshold, and a deadline (must be ≤ the round's reveal deadline).
 *         2. Spectators call `betYes` / `betNo` with ETH before the deadline.
 *         3. After the BountyRound reaches phase 4 (SETTLED), anyone calls `resolve`
 *            to lock in the outcome.
 *         4. Winners call `claim` to collect their proportional share of the pool
 *            minus the protocol fee.
 */
contract PredictionMarket is ReentrancyGuard {

    // ============================================================
    //                        STRUCTS
    // ============================================================

    /**
     * @notice All state for a single prediction market.
     * @param roundAddr     Address of the BountyRound contract being predicted on.
     * @param agentId       The agent whose placement is being predicted.
     * @param topN          The threshold — market resolves YES if agentId ranks ≤ topN.
     * @param totalYesBets  Cumulative ETH (wei) staked on YES.
     * @param totalNoBets   Cumulative ETH (wei) staked on NO.
     * @param deadline      Unix timestamp after which no new bets are accepted.
     * @param resolved      True once `resolve()` has been called.
     * @param outcome       True = agent finished in top N; false = did not.
     * @param createdAt     Unix timestamp when the market was created.
     */
    struct Market {
        address  roundAddr;
        uint256  agentId;
        uint8    topN;
        uint256  totalYesBets;
        uint256  totalNoBets;
        uint64   deadline;
        bool     resolved;
        bool     outcome;
        uint64   createdAt;
    }

    // ============================================================
    //                        CONSTANTS
    // ============================================================

    /// @dev Phase value that indicates a BountyRound is fully settled.
    uint8 private constant PHASE_SETTLED = 4;

    // ============================================================
    //                         STATE
    // ============================================================

    /// @notice Destination for protocol fees collected on claims.
    address public treasury;

    /// @notice Fee in basis points deducted from the winner pool (100 = 1 %).
    uint16 public feeBps;

    /// @notice Monotonically increasing market ID counter. First market gets ID 1.
    uint256 public nextMarketId;

    /// @notice All markets, keyed by market ID.
    mapping(uint256 => Market) public markets;

    /// @notice YES-bet amounts: marketId → bettor → wei staked on YES.
    mapping(uint256 => mapping(address => uint256)) public yesBets;

    /// @notice NO-bet amounts: marketId => bettor => wei staked on NO.
    mapping(uint256 => mapping(address => uint256)) public noBets;

    /// @notice Tracks whether a winning bettor has already claimed: marketId => bettor => claimed.
    mapping(uint256 => mapping(address => bool)) public claimed;

    // ============================================================
    //                          EVENTS
    // ============================================================

    /**
     * @notice Emitted when a new prediction market is created.
     * @param marketId  Unique ID of the new market.
     * @param roundAddr Address of the associated BountyRound.
     * @param agentId   The agent being predicted on.
     * @param topN      The top-N threshold for a YES outcome.
     * @param deadline  Timestamp after which betting closes.
     * @param creator   Address that called createMarket.
     */
    event MarketCreated(
        uint256 indexed marketId,
        address indexed roundAddr,
        uint256 indexed agentId,
        uint8   topN,
        uint64  deadline,
        address creator
    );

    /**
     * @notice Emitted when a bet is placed on a market.
     * @param marketId  The market the bet was placed on.
     * @param bettor    Address of the bettor.
     * @param isYes     True if the bet was YES, false if NO.
     * @param amount    ETH amount in wei.
     */
    event BetPlaced(
        uint256 indexed marketId,
        address indexed bettor,
        bool    isYes,
        uint256 amount
    );

    /**
     * @notice Emitted when a market is resolved.
     * @param marketId  The resolved market.
     * @param outcome   True = YES (agent finished in topN); false = NO.
     * @param resolver  Address that called resolve().
     */
    event MarketResolved(
        uint256 indexed marketId,
        bool    outcome,
        address resolver
    );

    /**
     * @notice Emitted when a winner claims their payout.
     * @param marketId  The market the claim is for.
     * @param claimant  Address receiving the payout.
     * @param amount    ETH amount paid out in wei.
     */
    event Claimed(
        uint256 indexed marketId,
        address indexed claimant,
        uint256 amount
    );

    // ============================================================
    //                       CONSTRUCTOR
    // ============================================================

    /**
     * @notice Deploy the PredictionMarket contract.
     * @dev    Immutable — no proxy, no upgrade path.
     * @param  _treasury  Address that collects protocol fees. Must be non-zero.
     * @param  _feeBps    Fee in basis points (e.g. 200 = 2 %). Must be < 10 000.
     */
    constructor(address _treasury, uint16 _feeBps) {
        if (_treasury == address(0)) revert ZeroAddress();
        if (_feeBps >= Constants.BPS_DENOMINATOR) revert FeeTooHigh();

        treasury      = _treasury;
        feeBps        = _feeBps;
        nextMarketId  = 1;
    }

    // ============================================================
    //                    MARKET CREATION
    // ============================================================

    /**
     * @notice Create a new binary prediction market for a BountyRound.
     * @dev    Anyone can create a market. The deadline must be in the future.
     *         Conventionally the deadline should match the round's reveal deadline
     *         so betting closes when results become available, but this is not
     *         enforced on-chain.
     *
     * @param  roundAddr  Address of the BountyRound contract.
     * @param  agentId    ID of the agent to predict on.
     * @param  topN       Threshold for a YES outcome (e.g. 3 = "will finish top 3").
     *                    Must be ≥ 1.
     * @param  deadline   Unix timestamp when betting closes.
     * @return marketId   The ID assigned to this new market (starts at 1).
     */
    function createMarket(
        address roundAddr,
        uint256 agentId,
        uint8   topN,
        uint64  deadline
    ) external returns (uint256 marketId) {
        if (roundAddr == address(0))           revert ZeroAddress();
        if (topN == 0)                          revert InvalidTopN();
        if (deadline <= uint64(block.timestamp)) revert DeadlineInPast(deadline);

        marketId = nextMarketId++;

        markets[marketId] = Market({
            roundAddr:    roundAddr,
            agentId:      agentId,
            topN:         topN,
            totalYesBets: 0,
            totalNoBets:  0,
            deadline:     deadline,
            resolved:     false,
            outcome:      false,
            createdAt:    uint64(block.timestamp)
        });

        emit MarketCreated(marketId, roundAddr, agentId, topN, deadline, msg.sender);
    }

    // ============================================================
    //                        BETTING
    // ============================================================

    /**
     * @notice Place a YES bet on a market (agent finishes in top N).
     * @dev    Reverts if the market deadline has passed or msg.value is zero.
     *         Multiple bets by the same address are accumulated.
     * @param  marketId  ID of the market to bet on.
     */
    function betYes(uint256 marketId) external payable {
        _assertBettable(marketId);

        markets[marketId].totalYesBets  += msg.value;
        yesBets[marketId][msg.sender]   += msg.value;

        emit BetPlaced(marketId, msg.sender, true, msg.value);
    }

    /**
     * @notice Place a NO bet on a market (agent does NOT finish in top N).
     * @dev    Reverts if the market deadline has passed or msg.value is zero.
     *         Multiple bets by the same address are accumulated.
     * @param  marketId  ID of the market to bet on.
     */
    function betNo(uint256 marketId) external payable {
        _assertBettable(marketId);

        markets[marketId].totalNoBets  += msg.value;
        noBets[marketId][msg.sender]   += msg.value;

        emit BetPlaced(marketId, msg.sender, false, msg.value);
    }

    // ============================================================
    //                        RESOLUTION
    // ============================================================

    /**
     * @notice Resolve a market by reading the final ranking from the BountyRound.
     * @dev    Can be called by anyone once the round reaches phase 4 (SETTLED).
     *         Looks up the ranking array and checks whether agentId appears within
     *         the first topN positions (0-indexed: positions 0 … topN-1).
     *
     *         If the agent is not present in the ranking at all, the outcome is NO.
     *
     * @param  marketId  ID of the market to resolve.
     */
    function resolve(uint256 marketId) external {
        Market storage m = _requireMarket(marketId);

        if (m.resolved) revert AlreadyResolved(marketId);

        IBountyRound round = IBountyRound(m.roundAddr);
        if (round.phase() != PHASE_SETTLED) revert RoundNotSettled(marketId);

        (uint256[] memory agentIds, ) = round.getRanking();

        bool outcome = false;
        uint256 len  = agentIds.length;
        uint8   topN = m.topN;

        // Scan only up to topN positions (or total agents if fewer than topN).
        uint256 checkUpTo = len < topN ? len : topN;
        for (uint256 i = 0; i < checkUpTo; ) {
            if (agentIds[i] == m.agentId) {
                outcome = true;
                break;
            }
            unchecked { ++i; }
        }

        m.resolved = true;
        m.outcome  = outcome;

        emit MarketResolved(marketId, outcome, msg.sender);
    }

    // ============================================================
    //                         CLAIMING
    // ============================================================

    /**
     * @notice Claim winnings from a resolved market.
     * @dev    Protected by ReentrancyGuard. The winner pool equals the total ETH
     *         collected minus a protocol fee sent to the treasury.
     *         Each winner receives:
     *
     *           payout = (userWinBet / totalWinBets) * (totalPool - fee)
     *
     *         where totalPool = totalYesBets + totalNoBets.
     *
     *         Edge case: if no one bet on the winning side (totalWinBets = 0),
     *         all bets from the losing side remain permanently locked in the
     *         contract — there are no winners to distribute to. This is an accepted
     *         limitation of the pari-mutuel model and should be considered when
     *         creating markets with asymmetric liquidity.
     *
     * @param  marketId  ID of the resolved market to claim from.
     */
    function claim(uint256 marketId) external nonReentrant {
        Market storage m = _requireMarket(marketId);

        if (!m.resolved)                         revert NotYetResolved(marketId);
        if (claimed[marketId][msg.sender])        revert AlreadyClaimed(marketId, msg.sender);

        uint256 userWinBet;
        uint256 totalWinBets;

        if (m.outcome) {
            // YES won
            userWinBet   = yesBets[marketId][msg.sender];
            totalWinBets = m.totalYesBets;
        } else {
            // NO won
            userWinBet   = noBets[marketId][msg.sender];
            totalWinBets = m.totalNoBets;
        }

        if (userWinBet == 0)  revert NothingToClaim(marketId, msg.sender);

        claimed[marketId][msg.sender] = true;

        uint256 totalPool = m.totalYesBets + m.totalNoBets;
        uint256 fee       = (totalPool * feeBps) / Constants.BPS_DENOMINATOR;
        uint256 netPool   = totalPool - fee;

        // Proportional share: avoids overflow by ordering ops carefully.
        uint256 payout = (netPool * userWinBet) / totalWinBets;

        // --- Fee forwarding (only when this is the first claim) ---
        // We track whether the fee has been sent by checking if treasury
        // balance can absorb it. Simpler: send fee on every claim scaled by
        // the claimant's share, so the total fee paid across all claims = fee.
        // Rationale: totalFeeForUser = fee * (userWinBet / totalWinBets)
        uint256 feeShare = (fee * userWinBet) / totalWinBets;

        emit Claimed(marketId, msg.sender, payout);

        // Transfer fee share to treasury
        if (feeShare > 0) {
            (bool feeOk, ) = treasury.call{value: feeShare}("");
            if (!feeOk) revert TreasuryTransferFailed();
        }

        // Transfer payout to claimant
        (bool ok, ) = msg.sender.call{value: payout}("");
        if (!ok) revert ClaimTransferFailed();
    }

    // ============================================================
    //                        VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Compute the current implied odds based on pool sizes.
     * @dev    Uses a pari-mutuel convention: a YES bettor's fair payout comes from
     *         the NO pool (and vice-versa), so:
     *
     *           yesPct = totalNoBets  * 10 000 / (totalYesBets + totalNoBets)
     *           noPct  = totalYesBets * 10 000 / (totalYesBets + totalNoBets)
     *
     *         Both are in basis points (10 000 = 100 %).
     *         Returns (0, 0) if no bets have been placed yet.
     *
     * @param  marketId  ID of the market.
     * @return yesPct    Implied probability of YES (bps).
     * @return noPct     Implied probability of NO (bps).
     */
    function getOdds(uint256 marketId)
        external
        view
        returns (uint256 yesPct, uint256 noPct)
    {
        Market storage m = _requireMarket(marketId);

        uint256 total = m.totalYesBets + m.totalNoBets;
        if (total == 0) return (0, 0);

        yesPct = (m.totalNoBets  * Constants.BPS_DENOMINATOR) / total;
        noPct  = (m.totalYesBets * Constants.BPS_DENOMINATOR) / total;
    }

    /**
     * @notice Return the full Market struct for a given ID.
     * @param  marketId  ID of the market.
     * @return           The Market struct.
     */
    function getMarket(uint256 marketId)
        external
        view
        returns (Market memory)
    {
        return _requireMarket(marketId);
    }

    /**
     * @notice Return the individual bets placed by a user on a market.
     * @param  marketId  ID of the market.
     * @param  user      Address of the bettor.
     * @return yesAmount ETH (wei) staked on YES by this user.
     * @return noAmount  ETH (wei) staked on NO by this user.
     */
    function getUserBets(uint256 marketId, address user)
        external
        view
        returns (uint256 yesAmount, uint256 noAmount)
    {
        yesAmount = yesBets[marketId][user];
        noAmount  = noBets[marketId][user];
    }

    // ============================================================
    //                      INTERNAL HELPERS
    // ============================================================

    /**
     * @dev Fetch a market from storage, reverting if it does not exist.
     *      A market "exists" when its roundAddr is non-zero (set in createMarket).
     */
    function _requireMarket(uint256 marketId)
        internal
        view
        returns (Market storage m)
    {
        m = markets[marketId];
        if (m.roundAddr == address(0)) revert MarketNotFound(marketId);
    }

    /**
     * @dev Shared pre-bet checks: market existence, deadline, and non-zero value.
     */
    function _assertBettable(uint256 marketId) internal view {
        Market storage m = _requireMarket(marketId);
        if (block.timestamp >= m.deadline) revert BettingClosed(marketId, m.deadline);
        if (msg.value == 0)                revert ZeroBet();
    }
}
