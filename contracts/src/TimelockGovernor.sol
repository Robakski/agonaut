// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {Constants} from "./Constants.sol";

/// @title TimelockGovernor
/// @notice Wraps OpenZeppelin's TimelockController with Agonaut-specific helpers
///         for scheduling upgrades, role changes, and factory configuration.
contract TimelockGovernor is TimelockController {
    // ============================================================
    //                          EVENTS
    // ============================================================

    event UpgradeScheduled(
        address indexed proxy, address indexed newImpl, bytes32 operationId, uint256 executeAt
    );
    event RoleChangeScheduled(
        address indexed target,
        bytes32 indexed role,
        address indexed account,
        bool isGrant,
        bytes32 operationId
    );
    event SetAddressesScheduled(address indexed factory, bytes32 operationId, uint256 executeAt);

    // ============================================================
    //                          ERRORS
    // ============================================================

    error DelayTooLong(uint256 requested, uint256 max);

    // ============================================================
    //                       CONSTRUCTOR
    // ============================================================

    /// @param proposers Addresses allowed to schedule operations (e.g. multisig).
    /// @param executors Addresses allowed to execute after delay (address(0) = anyone).
    /// @param admin     Initial admin; should renounce after setup.
    constructor(address[] memory proposers, address[] memory executors, address admin)
        TimelockController(Constants.TIMELOCK_MIN_DELAY, proposers, executors, admin)
    {}

    // ============================================================
    //                   DELAY GUARD
    // ============================================================

    /// @dev Shadow variable for delay — avoids fragile assembly access to OZ5's
    ///      private ERC-7201 namespaced storage. This is the canonical delay value.
    uint256 private _agonautDelay;
    bool private _delayInitialized;

    /// @notice Returns the minimum delay. Overrides OZ to use our shadow variable.
    function getMinDelay() public view override returns (uint256) {
        if (_delayInitialized) {
            return _agonautDelay;
        }
        return super.getMinDelay();
    }

    /// @dev Override to enforce MAX_DELAY cap. Only callable by the timelock itself
    ///      (via a scheduled operation). Uses shadow variable instead of assembly.
    function updateDelay(uint256 newDelay) external override {
        if (_msgSender() != address(this)) {
            revert TimelockUnauthorizedCaller(_msgSender());
        }
        if (newDelay > Constants.TIMELOCK_MAX_DELAY) {
            revert DelayTooLong(newDelay, Constants.TIMELOCK_MAX_DELAY);
        }
        emit MinDelayChange(getMinDelay(), newDelay);
        _agonautDelay = newDelay;
        _delayInitialized = true;
    }

    // ============================================================
    //                   AGONAUT HELPERS
    // ============================================================

    /// @notice Schedule a UUPS proxy upgrade through the timelock.
    function scheduleUpgrade(address proxy, address newImpl, bytes calldata data)
        external
        onlyRole(PROPOSER_ROLE)
    {
        bytes memory payload =
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", newImpl, data);

        uint256 delay = getMinDelay();
        bytes32 opId = this.hashOperation(proxy, 0, payload, bytes32(0), bytes32(0));

        this.schedule(proxy, 0, payload, bytes32(0), bytes32(0), delay);

        emit UpgradeScheduled(proxy, newImpl, opId, block.timestamp + delay);
    }

    /// @notice Schedule granting a role on a target contract.
    function scheduleRoleGrant(address target, bytes32 role, address account)
        external
        onlyRole(PROPOSER_ROLE)
    {
        bytes memory payload = abi.encodeWithSignature("grantRole(bytes32,address)", role, account);

        uint256 delay = getMinDelay();
        bytes32 opId = this.hashOperation(target, 0, payload, bytes32(0), bytes32(0));

        this.schedule(target, 0, payload, bytes32(0), bytes32(0), delay);

        emit RoleChangeScheduled(target, role, account, true, opId);
    }

    /// @notice Schedule revoking a role on a target contract.
    function scheduleRoleRevoke(address target, bytes32 role, address account)
        external
        onlyRole(PROPOSER_ROLE)
    {
        bytes memory payload =
            abi.encodeWithSignature("revokeRole(bytes32,address)", role, account);

        uint256 delay = getMinDelay();
        bytes32 opId = this.hashOperation(target, 0, payload, bytes32(0), bytes32(0));

        this.schedule(target, 0, payload, bytes32(0), bytes32(0), delay);

        emit RoleChangeScheduled(target, role, account, false, opId);
    }

    /// @notice Schedule a BountyFactory.setContractAddresses call.
    function scheduleSetAddresses(address factory, bytes calldata data)
        external
        onlyRole(PROPOSER_ROLE)
    {
        uint256 delay = getMinDelay();
        bytes32 opId = hashOperation(factory, 0, data, bytes32(0), bytes32(0));

        schedule(factory, 0, data, bytes32(0), bytes32(0), delay);

        emit SetAddressesScheduled(factory, opId, block.timestamp + delay);
    }
}
