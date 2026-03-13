// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Agonaut — Global Constants
/// @notice Single source of truth for ALL shared values across the protocol.
/// @dev When changing ANY value here, run `forge test` to verify nothing breaks.
///      Every contract imports from this file. Never hardcode these values elsewhere.

library Constants {
    // ============================================================
    //                        TOKEN & BRANDING
    // ============================================================
    string internal constant PROTOCOL_NAME = "Agonaut";
    /// @dev Phase 2: $AGON token will be introduced when protocol has revenue.
    ///      TOKEN_NAME and TOKEN_SYMBOL are kept here for forward compatibility.
    string internal constant TOKEN_NAME = "Agon";
    string internal constant TOKEN_SYMBOL = "AGON";

    // ============================================================
    //                        ELO & TIERS
    // ============================================================
    uint16 internal constant INITIAL_ELO = 1200;
    uint16 internal constant MIN_ELO = 100;
    uint16 internal constant MAX_ELO = 3000;
    uint16 internal constant ELO_K_FACTOR = 32;

    // Tier boundaries (inclusive lower bound)
    uint16 internal constant TIER_BRONZE_MIN = 1200;
    uint16 internal constant TIER_SILVER_MIN = 1400;
    uint16 internal constant TIER_GOLD_MIN = 1600;
    uint16 internal constant TIER_DIAMOND_MIN = 1800;
    uint16 internal constant TIER_PROMETHEUS_MIN = 2000;

    // Stake caps per tier (in wei)
    uint256 internal constant STAKE_CAP_BRONZE = 0.01 ether;
    uint256 internal constant STAKE_CAP_SILVER = 0.05 ether;
    uint256 internal constant STAKE_CAP_GOLD = 0.1 ether;
    uint256 internal constant STAKE_CAP_DIAMOND = 0.5 ether;
    uint256 internal constant STAKE_CAP_PROMETHEUS = type(uint256).max;

    // Promotion/Relegation
    uint8 internal constant WINS_TO_PROMOTE = 3;
    uint8 internal constant LOSSES_TO_RELEGATE = 5;

    // ============================================================
    //                        PROTOCOL FEES
    // ============================================================
    uint16 internal constant PROTOCOL_FEE_BPS = 200; // 2% of sponsor bounty
    uint16 internal constant BPS_DENOMINATOR = 10000;

    // ============================================================
    //                        BOUNTY ECONOMICS (Sponsor-funded)
    // ============================================================
    /// @dev Minimum bounty deposit (~$250) ensures 2% protocol fee covers base costs.
    uint256 internal constant MIN_BOUNTY_DEPOSIT = 0.125 ether;

    // ── ETH Entry Fees (Phase 1 — ETH-only launch) ─────────────
    /// @dev Entry fee per agent per round, paid in ETH (~$6 at launch).
    ///      Accumulated in the round contract and allocated to treasury at finalization.
    ///      Phase 2: will migrate to $AGON token when protocol has revenue.
    uint256 internal constant ENTRY_FEE = 0.003 ether; // ~$6 in ETH
    /// @dev Agent registration fee (one-time, ~$3), paid in ETH.
    ///      Phase 2: will migrate to $AGON token when protocol has revenue.
    uint256 internal constant REGISTRATION_FEE = 0.0015 ether; // ~$3 in ETH
    /// @dev Sponsor funds the prize pool in ETH; agents pay ETH entry fees.
    /// @dev Sponsor's bounty is NOT touched for entry fees — clean pricing.

    // ── Acceptance Threshold ──────────────────────────────────────
    /// @dev Scores are normalized 0-10000 (BPS). Threshold is the minimum
    ///      score for the best solution to trigger full payout.
    uint16 internal constant MIN_ACCEPTANCE_THRESHOLD = 1000;  // 10% minimum
    uint16 internal constant MAX_ACCEPTANCE_THRESHOLD = 9500;  // 95% maximum (prevent impossible bounties)

    // ── Graduated Payout Tiers ────────────────────────────────────
    /// @dev When graduatedPayouts=true and best score < threshold:
    ///   bestScore >= 80% of threshold → 50% of bounty released
    ///   bestScore >= 50% of threshold → 25% of bounty released
    ///   bestScore <  50% of threshold → 0% (full refund to sponsor)
    uint16 internal constant GRADUATED_TIER1_PERCENT_BPS = 8000; // 80% of threshold
    uint16 internal constant GRADUATED_TIER1_PAYOUT_BPS = 5000;  // 50% of bounty
    uint16 internal constant GRADUATED_TIER2_PERCENT_BPS = 5000; // 50% of threshold
    uint16 internal constant GRADUATED_TIER2_PAYOUT_BPS = 2500;  // 25% of bounty

    // ── Arbitration ───────────────────────────────────────────────
    /// @dev Dispute bond = 5% of bounty value (loser forfeits to arbitrators).
    uint16 internal constant ARBITRATION_BOND_BPS = 500; // 5%
    /// @dev Number of randomly selected arbitrators per dispute.
    uint8 internal constant ARBITRATOR_COUNT = 5;
    /// @dev Voting window for arbitrators to decide.
    uint32 internal constant ARBITRATION_WINDOW = 7 days;
    /// @dev Minimum stake to be eligible as an arbitrator.
    uint256 internal constant MIN_ARBITRATOR_STAKE = 0.5 ether;

    // ── Roles ─────────────────────────────────────────────────────
    bytes32 internal constant ARBITRATOR_ROLE = keccak256("ARBITRATOR_ROLE");

    // ============================================================
    //                        SCORING (Phala TEE)
    // ============================================================
    /// @dev Timeout for TEE scoring (after which round can be cancelled).
    ///      If scores aren't submitted within this window, round can transition to CANCELLED.
    uint32 internal constant SCORING_TIMEOUT = 24 hours;

    // ============================================================
    //                        CROWDFUNDED BOUNTIES (BountyMarketplace)
    // ============================================================
    /// @dev Minimum and maximum funding window for a crowdfunded bounty proposal.
    uint32  internal constant MIN_FUNDING_DURATION = 1 days;
    uint32  internal constant MAX_FUNDING_DURATION = 10 days;
    /// @dev Anti-spam deposit paid by the proposer. Refunded if funding goal is met;
    ///      forfeited to treasury if the proposal expires without reaching the goal.
    uint256 internal constant PROPOSAL_DEPOSIT = 0.01 ether;

    // ============================================================
    //                        TIMING
    // ============================================================
    uint32 internal constant MIN_COMMIT_DURATION = 1 hours;
    uint32 internal constant MAX_COMMIT_DURATION = 7 days;
    uint32 internal constant CHALLENGE_WINDOW = 1 hours;
    uint32 internal constant DELEGATION_COOLDOWN = 24 hours;
    uint32 internal constant SEASON_DURATION = 28 days;

    // ============================================================
    //                        ACCESS CONTROL ROLES
    // ============================================================
    bytes32 internal constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 internal constant BOUNTY_CREATOR_ROLE = keccak256("BOUNTY_CREATOR_ROLE");
    bytes32 internal constant ROUND_ROLE = keccak256("ROUND_ROLE");
    bytes32 internal constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
    bytes32 internal constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 internal constant STABLE_REGISTRY_ROLE = keccak256("STABLE_REGISTRY_ROLE");
    bytes32 internal constant ELO_SYSTEM_ROLE = keccak256("ELO_SYSTEM_ROLE");
    bytes32 internal constant BOUNTY_ROUND_ROLE = keccak256("BOUNTY_ROUND_ROLE");

    // ============================================================
    //                        GOVERNANCE
    // ============================================================
    bytes32 internal constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 internal constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint32 internal constant TIMELOCK_MIN_DELAY = 24 hours;
    uint32 internal constant TIMELOCK_MAX_DELAY = 7 days;
    uint16 internal constant MAX_PROTOCOL_FEE_BPS = 500;   // 5% absolute max (anti-rug)
    uint16 internal constant MAX_SCORING_FEE_BPS = 200;     // 2% absolute max
    uint32 internal constant UNPAUSE_COOLDOWN = 1 hours;
}
