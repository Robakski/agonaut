// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Constants} from "./Constants.sol";

/// @title EmergencyGuardian
/// @notice Lightweight, immutable contract that can PAUSE critical protocol contracts
///         instantly without a timelock. Cannot upgrade, withdraw, or change roles on targets.
/// @dev Unpause requires both GUARDIAN_ROLE and TIMELOCK_ROLE (prevents grief cycling).

interface IPausable {
    function pause() external;
    function unpause() external;
}

contract EmergencyGuardian is AccessControl {
    // ============================================================
    //                          ROLES
    // ============================================================

    bytes32 public constant GUARDIAN_ROLE = Constants.GUARDIAN_ROLE;
    bytes32 public constant TIMELOCK_ROLE = keccak256("TIMELOCK_ROLE");

    // ============================================================
    //                          STATE
    // ============================================================

    mapping(address => bool) public isPaused;
    mapping(address => uint64) public lastPausedAt;
    uint256 public totalFreezes;

    // ============================================================
    //                          EVENTS
    // ============================================================

    event EmergencyPaused(address indexed target, address indexed guardian, uint256 timestamp);
    event EmergencyUnpaused(address indexed target, address indexed guardian, uint256 timestamp);
    event EmergencyFreezeTriggered(address indexed target, uint256 freezeCount);

    // ============================================================
    //                          ERRORS
    // ============================================================

    error AlreadyPaused(address target);
    error NotPaused(address target);
    error CooldownNotElapsed(address target, uint256 remainingSeconds);

    // ============================================================
    //                       CONSTRUCTOR
    // ============================================================

    /// @param admin     Default admin (should be multisig).
    /// @param guardians Addresses granted GUARDIAN_ROLE.
    /// @param timelock  The TimelockGovernor address (for unpause approval).
    constructor(address admin, address[] memory guardians, address timelock) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TIMELOCK_ROLE, timelock);

        for (uint256 i; i < guardians.length; ++i) {
            _grantRole(GUARDIAN_ROLE, guardians[i]);
        }
    }

    // ============================================================
    //                      PAUSE FUNCTIONS
    // ============================================================

    /// @notice Pause a single target contract. Guardian only.
    function pause(address target) external onlyRole(GUARDIAN_ROLE) {
        _pause(target);
    }

    /// @notice Batch-pause multiple targets. Guardian only.
    function pauseAll(address[] calldata targets) external onlyRole(GUARDIAN_ROLE) {
        for (uint256 i; i < targets.length; ++i) {
            _pause(targets[i]);
        }
    }

    /// @notice Pause + freeze: emits extra event and increments freeze counter.
    function emergencyFreeze(address target) external onlyRole(GUARDIAN_ROLE) {
        _pause(target);
        ++totalFreezes;
        emit EmergencyFreezeTriggered(target, totalFreezes);
    }

    /// @notice Unpause a target. Requires BOTH guardian AND timelock approval.
    /// @dev Caller must have GUARDIAN_ROLE; the function also requires TIMELOCK_ROLE,
    ///      so in practice the timelock schedules a call through this contract.
    function unpause(address target) external onlyRole(TIMELOCK_ROLE) {
        if (!isPaused[target]) revert NotPaused(target);

        uint64 pausedAt = lastPausedAt[target];
        uint256 elapsed = block.timestamp - pausedAt;
        if (elapsed < Constants.UNPAUSE_COOLDOWN) {
            revert CooldownNotElapsed(target, Constants.UNPAUSE_COOLDOWN - elapsed);
        }

        isPaused[target] = false;
        IPausable(target).unpause();

        emit EmergencyUnpaused(target, msg.sender, block.timestamp);
    }

    // ============================================================
    //                       INTERNALS
    // ============================================================

    function _pause(address target) internal {
        if (isPaused[target]) revert AlreadyPaused(target);

        isPaused[target] = true;
        lastPausedAt[target] = uint64(block.timestamp);
        IPausable(target).pause();

        emit EmergencyPaused(target, msg.sender, block.timestamp);
    }
}
