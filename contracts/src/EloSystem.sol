// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title EloMath
/// @notice Pure fixed-point ELO calculation library using 1e3 precision.
library EloMath {
    uint256 internal constant K = 32;
    uint256 internal constant SCALE = 1000;
    uint16 internal constant MIN_ELO = 100;
    uint16 internal constant MAX_ELO = 3000;

    /// @notice Approximate 10^(x/400) scaled by SCALE using a piecewise linear lookup.
    /// @dev x can be negative, represented as (abs, negative). Maps rating diff to expected ratio.
    ///      We precompute 10^(d/400)*1000 for d in [0..400] at 25-point intervals, then interpolate.
    ///      For |diff| > 400, clamp.
    function _pow10Scaled(int256 diff) internal pure returns (uint256) {
        // 10^(d/400) * 1000 for d = 0,25,50,...,400
        // If diff is negative, 10^(diff/400) = 1 / 10^(|diff|/400), so we invert.
        bool neg = diff < 0;
        // forge-lint: disable-next-line(unsafe-typecast) diff is bounded by int256 range
        uint256 absDiff = neg ? uint256(-diff) : uint256(diff);
        if (absDiff > 400) absDiff = 400;

        // Lookup table: 10^(d/400)*1000 for d=0,25,...,400
        // 10^0=1000, 10^(25/400)=1148, 10^(50/400)=1318, 10^(75/400)=1514,
        // 10^(100/400)=1778, 10^(125/400)=2054, 10^(150/400)=2371, 10^(175/400)=2738,
        // 10^(200/400)=3162, 10^(225/400)=3652, 10^(250/400)=4217, 10^(275/400)=4870,
        // 10^(300/400)=5623, 10^(325/400)=6494, 10^(350/400)=7499, 10^(375/400)=8660,
        // 10^(400/400)=10000
        uint256[17] memory table = [
            uint256(1000), 1148, 1318, 1514, 1778, 2054, 2371, 2738,
            3162, 3652, 4217, 4870, 5623, 6494, 7499, 8660, 10000
        ];

        uint256 idx = absDiff / 25;
        uint256 rem = absDiff % 25;
        uint256 val;
        if (idx >= 16) {
            val = table[16];
        } else {
            uint256 lo = table[idx];
            uint256 hi = table[idx + 1];
            val = lo + ((hi - lo) * rem) / 25;
        }

        // If negative diff: 10^(-|d|/400) = 1/10^(|d|/400) → SCALE^2 / val
        if (neg) {
            return (SCALE * SCALE) / val;
        }
        return val;
    }

    /// @notice Calculate expected score (scaled by SCALE) of player A vs player B.
    /// @param ratingA ELO rating of player A.
    /// @param ratingB ELO rating of player B.
    /// @return Expected score * SCALE (i.e., 500 means 0.5).
    function expectedScore(uint16 ratingA, uint16 ratingB) internal pure returns (uint256) {
        int256 diff = int256(uint256(ratingB)) - int256(uint256(ratingA));
        uint256 pow = _pow10Scaled(diff); // 10^((Rb-Ra)/400) * SCALE
        // Ea = 1/(1 + pow/SCALE) = SCALE / (SCALE + pow/SCALE) ... let's be precise:
        // Ea = SCALE / (1 + pow/SCALE) = SCALE * SCALE / (SCALE + pow)
        return (SCALE * SCALE) / (SCALE + pow);
    }

    /// @notice Compute new ELO after comparing A against B.
    /// @param ratingA Current ELO of player A.
    /// @param ratingB Current ELO of player B.
    /// @param won True if A beat B, false if A lost to B.
    /// @return New rating for A (clamped to [MIN_ELO, MAX_ELO]).
    function computeNewRating(uint16 ratingA, uint16 ratingB, bool won) internal pure returns (uint16) {
        uint256 ea = expectedScore(ratingA, ratingB); // scaled by SCALE
        // Sa = won ? SCALE : 0
        uint256 sa = won ? SCALE : 0;
        // delta = K * (Sa - Ea) / SCALE  (but we need to handle negative)
        // forge-lint: disable-next-line(unsafe-typecast) K, sa, ea are small bounded values
        int256 delta = (int256(K) * (int256(sa) - int256(ea))) / int256(SCALE);
        int256 newRating = int256(uint256(ratingA)) + delta;
        if (newRating < int256(uint256(MIN_ELO))) return MIN_ELO;
        if (newRating > int256(uint256(MAX_ELO))) return MAX_ELO;
        // forge-lint: disable-next-line(unsafe-typecast) clamped to [MIN_ELO, MAX_ELO] above
        return uint16(uint256(newRating));
    }
}

/// @title EloSystem
/// @author Agonaut
/// @notice Manages ELO ratings, tier classification, stake caps, and promotion/relegation
///         for agents competing in Agonaut rounds.
contract EloSystem is AccessControl {
    using EloMath for uint16;

    // ──────────────────────────── Constants ────────────────────────────

    /// @notice Role hash authorising round-result submissions.
    bytes32 public constant ROUND_ROLE = keccak256("ROUND_ROLE");

    uint16 public constant DEFAULT_ELO = 1200;
    uint8 public constant WINS_TO_PROMOTE = 3;
    uint8 public constant LOSSES_TO_RELEGATE = 5;

    // ──────────────────────────── Types ─────────────────────────────────

    /// @notice Competitive tiers ordered by skill bracket.
    enum Tier { Bronze, Silver, Gold, Diamond, Prometheus }

    /// @dev Packed agent data (fits one slot: 16+8+8 = 32 bits, well within 256).
    struct AgentData {
        uint16 elo;
        uint8 consecutiveWins;
        uint8 consecutiveLosses;
    }

    // ──────────────────────────── Storage ───────────────────────────────

    /// @notice Agent id → rating data.
    mapping(uint256 => AgentData) internal _agents;

    // ──────────────────────────── Events ────────────────────────────────

    /// @notice Emitted whenever an agent's ELO changes.
    event EloUpdated(uint256 indexed agentId, uint16 oldElo, uint16 newElo);

    /// @notice Emitted when an agent crosses a tier boundary.
    event TierChanged(uint256 indexed agentId, Tier oldTier, Tier newTier);

    /// @notice Emitted when an agent is promoted via consecutive wins.
    event Promoted(uint256 indexed agentId, Tier newTier);

    /// @notice Emitted when an agent is relegated via consecutive losses.
    event Relegated(uint256 indexed agentId, Tier newTier);

    // ──────────────────────────── Constructor ───────────────────────────

    /// @notice Deploys the ELO system and grants admin + round roles to the deployer.
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ROUND_ROLE, msg.sender);
    }

    // ──────────────────────────── External mutative ─────────────────────

    /// @notice Process a completed round. Agents are listed best-to-worst.
    /// @dev Each agent is compared pairwise against every other agent in the ranking.
    ///      Higher-ranked agent is treated as the winner of each pair.
    ///      Consecutive-win/loss streaks and promotion/relegation are evaluated afterwards.
    /// @param rankedAgentIds Ordered array of agent ids, index 0 = 1st place.
    function updateAfterRound(uint256[] calldata rankedAgentIds) external onlyRole(ROUND_ROLE) {
        uint256 n = rankedAgentIds.length;
        if (n < 2) return;

        // Snapshot current ratings so pairwise updates use pre-round values.
        uint16[] memory oldRatings = new uint16[](n);
        for (uint256 i; i < n; ++i) {
            AgentData storage ag = _agents[rankedAgentIds[i]];
            if (ag.elo == 0) ag.elo = DEFAULT_ELO; // first appearance
            oldRatings[i] = ag.elo;
        }

        // Accumulate deltas using fixed-point pairwise comparisons.
        int256[] memory deltas = new int256[](n);
        for (uint256 i; i < n; ++i) {
            for (uint256 j = i + 1; j < n; ++j) {
                // i beat j (lower index = higher rank)
                uint256 eaI = EloMath.expectedScore(oldRatings[i], oldRatings[j]);
                uint256 eaJ = EloMath.expectedScore(oldRatings[j], oldRatings[i]);

                // delta_i += K * (1 - Ea_i) / SCALE
                // forge-lint: disable-next-line(unsafe-typecast) K, SCALE, eaI are small bounded values
                deltas[i] += (int256(EloMath.K) * (int256(EloMath.SCALE) - int256(eaI))) / int256(EloMath.SCALE);
                // delta_j += K * (0 - Ea_j) / SCALE
                // forge-lint: disable-next-line(unsafe-typecast) K, SCALE, eaJ are small bounded values
                deltas[j] -= (int256(EloMath.K) * int256(eaJ)) / int256(EloMath.SCALE);
            }
        }

        // Apply deltas, emit events, handle streaks.
        for (uint256 i; i < n; ++i) {
            uint256 agentId = rankedAgentIds[i];
            AgentData storage ag = _agents[agentId];
            uint16 oldElo = ag.elo;
            Tier oldTier = getTier(oldElo);

            int256 raw = int256(uint256(oldElo)) + deltas[i];
            if (raw < int256(uint256(EloMath.MIN_ELO))) raw = int256(uint256(EloMath.MIN_ELO));
            if (raw > int256(uint256(EloMath.MAX_ELO))) raw = int256(uint256(EloMath.MAX_ELO));
            // forge-lint: disable-next-line(unsafe-typecast) raw is clamped to [MIN_ELO, MAX_ELO] above
            uint16 newElo = uint16(uint256(raw));

            // Determine win/loss for streak tracking.
            // Top half (exclusive) = win, bottom half = loss. Exact middle in odd counts = loss.
            bool isWin = i < n / 2;

            if (isWin) {
                ag.consecutiveWins++;
                ag.consecutiveLosses = 0;
            } else {
                ag.consecutiveLosses++;
                ag.consecutiveWins = 0;
            }

            // Promotion check
            if (ag.consecutiveWins >= WINS_TO_PROMOTE && oldTier < Tier.Prometheus) {
                Tier promoted = Tier(uint8(oldTier) + 1);
                uint16 tierMin = _tierMinElo(promoted);
                if (newElo < tierMin) newElo = tierMin;
                ag.consecutiveWins = 0;
                ag.elo = newElo;
                emit Promoted(agentId, promoted);
            }
            // Relegation check
            else if (ag.consecutiveLosses >= LOSSES_TO_RELEGATE && oldTier > Tier.Bronze) {
                Tier relegated = Tier(uint8(oldTier) - 1);
                uint16 tierMax = _tierMaxElo(relegated);
                if (newElo > tierMax) newElo = tierMax;
                ag.consecutiveLosses = 0;
                ag.elo = newElo;
                emit Relegated(agentId, relegated);
            } else {
                ag.elo = newElo;
            }

            if (ag.elo != oldElo) {
                emit EloUpdated(agentId, oldElo, ag.elo);
            }

            Tier newTier = getTier(ag.elo);
            if (newTier != oldTier) {
                emit TierChanged(agentId, oldTier, newTier);
            }
        }
    }

    // ──────────────────────────── External views ────────────────────────

    /// @notice Return the tier for a given ELO rating.
    /// @param elo The ELO rating to classify.
    /// @return The corresponding Tier enum value.
    function getTier(uint16 elo) public pure returns (Tier) {
        if (elo >= 2000) return Tier.Prometheus;
        if (elo >= 1800) return Tier.Diamond;
        if (elo >= 1600) return Tier.Gold;
        if (elo >= 1400) return Tier.Silver;
        return Tier.Bronze;
    }

    /// @notice Return the maximum stake an agent in a given tier may wager.
    /// @param tier The tier to query.
    /// @return Maximum stake in wei.
    function getStakeCap(Tier tier) external pure returns (uint256) {
        if (tier == Tier.Bronze) return 0.01 ether;
        if (tier == Tier.Silver) return 0.05 ether;
        if (tier == Tier.Gold) return 0.1 ether;
        if (tier == Tier.Diamond) return 0.5 ether;
        return type(uint256).max; // Prometheus
    }

    /// @notice Check whether an agent's tier permits entry into a round of the given tier.
    /// @dev An agent may enter a round at their own tier or one tier below.
    /// @param agentId The agent to check.
    /// @param roundTier The tier of the round.
    /// @return True if the agent is allowed to participate.
    function canEnterRound(uint256 agentId, Tier roundTier) external view returns (bool) {
        uint16 elo = _agents[agentId].elo;
        if (elo == 0) elo = DEFAULT_ELO;
        Tier agentTier = getTier(elo);
        return agentTier == roundTier || (uint8(agentTier) > 0 && Tier(uint8(agentTier) - 1) == roundTier);
    }

    /// @notice Get the current ELO rating of an agent.
    /// @param agentId The agent to query.
    /// @return Current ELO (defaults to 1200 if unset).
    function getElo(uint256 agentId) external view returns (uint16) {
        uint16 elo = _agents[agentId].elo;
        return elo == 0 ? DEFAULT_ELO : elo;
    }

    /// @notice Get the consecutive win count for an agent.
    /// @param agentId The agent to query.
    /// @return Number of consecutive wins.
    function getConsecutiveWins(uint256 agentId) external view returns (uint8) {
        return _agents[agentId].consecutiveWins;
    }

    /// @notice Get the consecutive loss count for an agent.
    /// @param agentId The agent to query.
    /// @return Number of consecutive losses.
    function getConsecutiveLosses(uint256 agentId) external view returns (uint8) {
        return _agents[agentId].consecutiveLosses;
    }

    // ──────────────────────────── Internal helpers ──────────────────────

    /// @dev Minimum ELO for a tier.
    function _tierMinElo(Tier tier) internal pure returns (uint16) {
        if (tier == Tier.Bronze) return 100; // effectively no minimum beyond global
        if (tier == Tier.Silver) return 1400;
        if (tier == Tier.Gold) return 1600;
        if (tier == Tier.Diamond) return 1800;
        return 2000; // Prometheus
    }

    /// @dev Maximum ELO for a tier.
    function _tierMaxElo(Tier tier) internal pure returns (uint16) {
        if (tier == Tier.Bronze) return 1399;
        if (tier == Tier.Silver) return 1599;
        if (tier == Tier.Gold) return 1799;
        if (tier == Tier.Diamond) return 1999;
        return 3000; // Prometheus
    }
}
