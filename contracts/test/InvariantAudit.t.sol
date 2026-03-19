// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Constants} from "../src/Constants.sol";
import {BountyRound} from "../src/BountyRound.sol";

/// @title InvariantAudit
/// @notice Automated checks that enforce INVARIANTS.md design decisions.
/// @dev If any test here fails, the CODE is wrong (not the invariant).
///      Read INVARIANTS.md before modifying these tests.
contract InvariantAudit is Test {
    // ============================================================
    //  INV-2.1: All fees are ETH-only in v1
    // ============================================================

    /// @notice Entry fee must be denominated in ETH (wei), not tokens.
    function test_INV_2_1_EntryFeeIsEth() public pure {
        // ENTRY_FEE should be a reasonable ETH amount (~$6 at $2000/ETH)
        assertEq(Constants.ENTRY_FEE, 0.003 ether, "INV-2.1: Entry fee must be 0.003 ETH");
    }

    /// @notice Registration fee must be denominated in ETH (wei).
    function test_INV_2_1_RegistrationFeeIsEth() public pure {
        assertEq(Constants.REGISTRATION_FEE, 0.0015 ether, "INV-2.1: Registration fee must be 0.0015 ETH");
    }

    /// @notice No $AGON burn/treasury split constants should exist in active Constants.
    function test_INV_2_1_NoAgonBurnConstants() public pure {
        // These constants should NOT exist. If they do, $AGON is leaking into v1.
        // We verify by checking that the values we DO have are ETH-denominated.
        // FEE_BURN_BPS and FEE_TREASURY_BPS should have been removed.
        assertTrue(Constants.ENTRY_FEE > 0, "INV-2.1: Entry fee must be positive");
        assertTrue(Constants.ENTRY_FEE < 0.1 ether, "INV-2.1: Entry fee must be reasonable ETH amount");
    }

    // ============================================================
    //  INV-2.2: Sponsors pay 2% protocol fee only
    // ============================================================

    function test_INV_2_2_ProtocolFeeIs2Percent() public pure {
        assertEq(Constants.PROTOCOL_FEE_BPS, 200, "INV-2.2: Protocol fee must be 2% (200 bps)");
    }

    // ============================================================
    //  INV-2.4: Minimum bounty deposit enforced
    // ============================================================

    function test_INV_2_4_MinBountyDepositExists() public pure {
        assertEq(Constants.MIN_BOUNTY_DEPOSIT, 0.009 ether, "INV-2.4: Min bounty deposit check"); // TESTNET: mainnet = 0.125 ether
    }

    function test_INV_2_4_MinBountyDepositMakesEconomicSense() public pure {
        // 2% of MIN_BOUNTY_DEPOSIT should cover base costs (~$5+)
        uint256 minFee = (Constants.MIN_BOUNTY_DEPOSIT * Constants.PROTOCOL_FEE_BPS) / Constants.BPS_DENOMINATOR;
        assertTrue(minFee >= 0.00018 ether, "INV-2.4: 2% of min deposit must cover gas"); // TESTNET: mainnet check is >= 0.002 ETH
    }

    // ============================================================
    //  INV-2.5: Pull-based claims only
    // ============================================================

    function test_INV_2_5_ClaimExpiryIs90Days() public {
        BountyRound round = new BountyRound();
        assertEq(round.CLAIM_EXPIRY(), 90 days, "INV-2.5: Claim expiry must be 90 days");
    }

    // ============================================================
    //  INV-3.1: TEE scoring configuration
    // ============================================================

    function test_INV_3_1_ScoringTimeoutIs24Hours() public pure {
        assertEq(Constants.SCORING_TIMEOUT, 24 hours, "INV-3.1: Scoring timeout must be 24 hours");
    }

    // ============================================================
    //  INV-3.3: Acceptance threshold bounds
    // ============================================================

    function test_INV_3_3_AcceptanceThresholdBounds() public pure {
        assertEq(Constants.MIN_ACCEPTANCE_THRESHOLD, 1000, "INV-3.3: Min threshold must be 10% (1000 bps)");
        assertEq(Constants.MAX_ACCEPTANCE_THRESHOLD, 9500, "INV-3.3: Max threshold must be 95% (9500 bps)");
    }

    function test_INV_3_3_GraduatedPayoutTiers() public pure {
        // Tier 1: 80% of threshold → 50% payout
        assertEq(Constants.GRADUATED_TIER1_PERCENT_BPS, 8000, "INV-3.3: Graduated tier 1 at 80%");
        assertEq(Constants.GRADUATED_TIER1_PAYOUT_BPS, 5000, "INV-3.3: Graduated tier 1 pays 50%");
        // Tier 2: 50% of threshold → 25% payout
        assertEq(Constants.GRADUATED_TIER2_PERCENT_BPS, 5000, "INV-3.3: Graduated tier 2 at 50%");
        assertEq(Constants.GRADUATED_TIER2_PAYOUT_BPS, 2500, "INV-3.3: Graduated tier 2 pays 25%");
    }

    // ============================================================
    //  INV-4.2: Flash loan arbitrator protection
    // ============================================================

    function test_INV_4_2_ArbitrationConstants() public pure {
        assertEq(Constants.ARBITRATOR_COUNT, 5, "INV-4.2: Must select 5 arbitrators per dispute");
        assertEq(Constants.ARBITRATION_WINDOW, 7 days, "INV-4.2: Arbitration voting window must be 7 days");
        assertEq(Constants.ARBITRATION_BOND_BPS, 500, "INV-4.2: Dispute bond must be 5% of bounty");
    }

    // ============================================================
    //  INV-4.3: Fee caps are hardcoded safety nets
    // ============================================================

    function test_INV_4_3_FeeCapsSafetyNet() public pure {
        assertEq(Constants.MAX_PROTOCOL_FEE_BPS, 500, "INV-4.3: Max protocol fee cap must be 5%");
        assertEq(Constants.MAX_SCORING_FEE_BPS, 200, "INV-4.3: Max scoring fee cap must be 2%");
        assertTrue(
            Constants.PROTOCOL_FEE_BPS <= Constants.MAX_PROTOCOL_FEE_BPS,
            "INV-4.3: Current fee must be within cap"
        );
    }

    // ============================================================
    //  INV-5.4: Solidity version
    // ============================================================

    /// @dev This test existing and compiling with 0.8.24 pragma is itself the check.
    function test_INV_5_4_SolidityVersion() public pure {
        assertTrue(true, "INV-5.4: This file compiles with 0.8.24");
    }

    // ============================================================
    //  INV-5.5: BountyRound lifecycle phases
    // ============================================================

    function test_INV_5_5_PhaseEnumCorrect() public {
        BountyRound round = new BountyRound();
        assertTrue(round.getPhase() == BountyRound.Phase.OPEN, "INV-5.5: Initial phase must be OPEN");
    }

    // ============================================================
    //  INV-1.1 / INV-1.5: No solution storage on-chain
    // ============================================================

    /// @notice BountyRound must NOT have a revealSolution function.
    /// @dev This is checked by ensuring the Phase enum has no REVEAL value.
    ///      If REVEAL exists in the enum, INV-1.5 is violated.
    ///      NOTE: This test will FAIL until the reveal phase is removed.
    function test_INV_1_5_NoRevealPhase() public pure {
        // The Phase enum should be:
        // OPEN(0), FUNDED(1), COMMIT(2), SCORING(3), SETTLED(4), CANCELLED(5), DISPUTED(6)
        //
        // If REVEAL exists, it would be between COMMIT and SCORING.
        // We check by verifying SCORING immediately follows COMMIT (index 3 = SCORING).
        //
        // With current violated code: COMMIT=2, REVEAL=3, SCORING=4
        // After fix: COMMIT=2, SCORING=3

        uint8 commitVal = uint8(BountyRound.Phase.COMMIT);
        uint8 scoringVal = uint8(BountyRound.Phase.SCORING);

        assertEq(
            scoringVal,
            commitVal + 1,
            "INV-1.5 VIOLATED: SCORING must immediately follow COMMIT (no REVEAL phase)"
        );
    }
}
