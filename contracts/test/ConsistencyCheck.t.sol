// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Constants} from "../src/Constants.sol";

/// @title Consistency Check Tests
/// @notice These tests verify that all shared constants are valid and consistent.
/// @dev Run these FIRST after any change to Constants.sol.
///      If any of these fail, something is fundamentally broken.
contract ConsistencyCheckTest is Test {
    
    function test_TierBoundariesAreOrdered() public pure {
        assert(Constants.TIER_BRONZE_MIN < Constants.TIER_SILVER_MIN);
        assert(Constants.TIER_SILVER_MIN < Constants.TIER_GOLD_MIN);
        assert(Constants.TIER_GOLD_MIN < Constants.TIER_DIAMOND_MIN);
        assert(Constants.TIER_DIAMOND_MIN < Constants.TIER_PROMETHEUS_MIN);
    }

    function test_TierBoundariesWithinEloRange() public pure {
        assert(Constants.TIER_BRONZE_MIN >= Constants.MIN_ELO);
        assert(Constants.TIER_PROMETHEUS_MIN <= Constants.MAX_ELO);
    }

    function test_StakeCapsIncreaseWithTier() public pure {
        assert(Constants.STAKE_CAP_BRONZE < Constants.STAKE_CAP_SILVER);
        assert(Constants.STAKE_CAP_SILVER < Constants.STAKE_CAP_GOLD);
        assert(Constants.STAKE_CAP_GOLD < Constants.STAKE_CAP_DIAMOND);
        assert(Constants.STAKE_CAP_DIAMOND < Constants.STAKE_CAP_PROMETHEUS);
    }

    function test_ProtocolFeeIsReasonable() public pure {
        // Fee should be between 0.1% and 10%
        assert(Constants.PROTOCOL_FEE_BPS >= 10);
        assert(Constants.PROTOCOL_FEE_BPS <= 1000);
    }

    function test_TimingConstraints() public pure {
        assert(Constants.MIN_COMMIT_DURATION < Constants.MAX_COMMIT_DURATION);
        assert(Constants.CHALLENGE_WINDOW > 0);
        assert(Constants.DELEGATION_COOLDOWN > 0);
        assert(Constants.SEASON_DURATION > 0);
    }

    function test_InitialEloMatchesBronzeTier() public pure {
        assert(Constants.INITIAL_ELO >= Constants.TIER_BRONZE_MIN);
        assert(Constants.INITIAL_ELO < Constants.TIER_SILVER_MIN);
    }

    function test_RoleHashesAreUnique() public pure {
        // Verify no two roles accidentally hash to the same value
        bytes32[8] memory roles = [
            Constants.OPERATOR_ROLE,
            Constants.BOUNTY_CREATOR_ROLE,
            Constants.ROUND_ROLE,
            Constants.GOVERNOR_ROLE,
            Constants.UPGRADER_ROLE,
            Constants.STABLE_REGISTRY_ROLE,
            Constants.ELO_SYSTEM_ROLE,
            Constants.BOUNTY_ROUND_ROLE
        ];
        for (uint i = 0; i < roles.length; i++) {
            for (uint j = i + 1; j < roles.length; j++) {
                assert(roles[i] != roles[j]);
            }
        }
    }
}
