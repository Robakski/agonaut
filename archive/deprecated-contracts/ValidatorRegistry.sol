// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/*
 * ██████╗ ██████╗  ██████╗ ███╗   ███╗███████╗████████╗██╗  ██╗███████╗██╗   ██╗███████╗
 * ██╔══██╗██╔══██╗██╔═══██╗████╗ ████║██╔════╝╚══██╔══╝██║  ██║██╔════╝██║   ██║██╔════╝
 * ██████╔╝██████╔╝██║   ██║██╔████╔██║█████╗     ██║   ███████║█████╗  ██║   ██║███████╗
 * ██╔═══╝ ██╔══██╗██║   ██║██║╚██╔╝██║██╔══╝     ██║   ██╔══██║██╔══╝  ██║   ██║╚════██║
 * ██║     ██║  ██║╚██████╔╝██║ ╚═╝ ██║███████╗   ██║   ██║  ██║███████╗╚██████╔╝███████║
 * ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚══════╝
 *
 * ██╗   ██╗ █████╗ ██╗     ██╗██████╗  █████╗ ████████╗ ██████╗ ██████╗
 * ██║   ██║██╔══██╗██║     ██║██╔══██╗██╔══██╗╚══██╔══╝██╔═══██╗██╔══██╗
 * ██║   ██║███████║██║     ██║██║  ██║███████║   ██║   ██║   ██║██████╔╝
 * ╚██╗ ██╔╝██╔══██║██║     ██║██║  ██║██╔══██║   ██║   ██║   ██║██╔══██╗
 *  ╚████╔╝ ██║  ██║███████╗██║██████╔╝██║  ██║   ██║   ╚██████╔╝██║  ██║
 *   ╚═══╝  ╚═╝  ╚═╝╚══════╝╚═╝╚═════╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝
 *
 * ██████╗ ███████╗ ██████╗ ██╗███████╗████████╗██████╗ ██╗   ██╗
 * ██╔══██╗██╔════╝██╔════╝ ██║██╔════╝╚══██╔══╝██╔══██╗╚██╗ ██╔╝
 * ██████╔╝█████╗  ██║  ███╗██║███████╗   ██║   ██████╔╝ ╚████╔╝
 * ██╔══██╗██╔══╝  ██║   ██║██║╚════██║   ██║   ██╔══██╗  ╚██╔╝
 * ██║  ██║███████╗╚██████╔╝██║███████║   ██║   ██║  ██║   ██║
 * ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝
 */

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import {Constants} from "../Constants.sol";

// ============================================================
//  VALIDATOR INTERFACE
// ============================================================

/**
 * @title IValidator
 * @notice Interface that every deterministic scoring contract registered in
 *         the ValidatorRegistry must implement.
 * @dev    All implementations MUST be pure/view — no state changes, no external
 *         calls that modify state. The `score` function is called in a view context
 *         by the registry, so any mutable implementation will be rejected at runtime.
 */
interface IValidator {
    /**
     * @notice Score a submitted agent solution against the given problem.
     * @param solution   ABI-encoded solution payload submitted by the agent.
     * @param problemCid IPFS CID (as bytes32) of the problem specification.
     * @return           A score in the range [0, maxScore()].
     */
    function score(bytes calldata solution, bytes32 problemCid) external view returns (uint256);

    /**
     * @notice The maximum possible score this validator can award.
     * @dev    Used to normalise scores across different validator implementations.
     * @return Upper bound of the scoring range.
     */
    function maxScore() external view returns (uint256);
}

// ============================================================
//  VALIDATOR REGISTRY
// ============================================================

/**
 * @title ValidatorRegistry
 * @author Agonaut
 * @notice Manages the catalogue of deterministic scoring functions (validators)
 *         that judge agent solutions in the Agonaut protocol.
 *
 * @dev Each validator is an external smart contract implementing {IValidator}.
 *      On registration the contract's bytecode hash is captured via `extcodehash`
 *      so that any post-deployment tampering (e.g., via a mutable proxy) can be
 *      detected through {verifyIntegrity} / {reportIntegrity}.
 *
 *      UUPS upgradeable (OpenZeppelin 5.x). Role architecture:
 *
 *       ┌─────────────────────┬────────────────────────────────────────────────┐
 *       │ Role                │ Capability                                     │
 *       ├─────────────────────┼────────────────────────────────────────────────┤
 *       │ DEFAULT_ADMIN_ROLE  │ Grant / revoke all roles; last-resort admin    │
 *       │ Constants.UPGRADER_ROLE  │ Authorise UUPS implementation upgrades    │
 *       │ Constants.OPERATOR_ROLE  │ Add, deactivate, reactivate validators    │
 *       └─────────────────────┴────────────────────────────────────────────────┘
 */
contract ValidatorRegistry is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    // ═══════════════════════════════════════════════════════════════════════
    //  STRUCTS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice On-chain record for a registered scoring validator.
     * @param contractAddr  Address of the deployed {IValidator} implementation.
     * @param codeHash      `extcodehash` of `contractAddr` at registration time.
     *                      Used by {verifyIntegrity} to detect code alteration.
     * @param name          Short human-readable label (e.g. "ExactMatchValidator").
     * @param description   Longer description of what the validator scores.
     * @param active        Whether this validator is currently usable.
     * @param addedAt       Unix timestamp when the validator was registered.
     */
    struct Validator {
        address contractAddr;
        bytes32 codeHash;
        string  name;
        string  description;
        bool    active;
        uint64  addedAt;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  STATE
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Auto-incrementing counter; next ID to be assigned on {addValidator}.
    ///         Starts at 1 — ID 0 is reserved as a null sentinel.
    uint256 public nextValidatorId;

    /// @dev validatorId → Validator record
    mapping(uint256 => Validator) private _validators;

    // ═══════════════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Emitted when a new validator is successfully registered.
     * @param id           The newly assigned validator ID.
     * @param contractAddr Address of the validator implementation.
     * @param codeHash     `extcodehash` captured at registration time.
     * @param name         Short label supplied by the registrant.
     */
    event ValidatorAdded(
        uint256 indexed id,
        address indexed contractAddr,
        bytes32         codeHash,
        string          name
    );

    /**
     * @notice Emitted when a validator is deactivated and can no longer be used for scoring.
     * @param id The validator that was deactivated.
     */
    event ValidatorDeactivated(uint256 indexed id);

    /**
     * @notice Emitted when a previously deactivated validator is reactivated.
     * @param id The validator that was reactivated.
     */
    event ValidatorReactivated(uint256 indexed id);

    /**
     * @notice Emitted when an integrity check reveals that a validator's deployed
     *         bytecode no longer matches the hash captured at registration.
     * @param id          The affected validator ID.
     * @param storedHash  The `extcodehash` recorded at registration.
     * @param currentHash The `extcodehash` observed at check time.
     */
    event IntegrityCheckFailed(
        uint256 indexed id,
        bytes32         storedHash,
        bytes32         currentHash
    );

    // ═══════════════════════════════════════════════════════════════════════
    //  ERRORS
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Thrown when a function references a validator ID that does not exist.
    error ValidatorNotFound(uint256 id);

    /// @notice Thrown when {deactivate} is called on a validator that is already inactive.
    error ValidatorAlreadyInactive(uint256 id);

    /// @notice Thrown when {reactivate} is called on a validator that is already active.
    error ValidatorAlreadyActive(uint256 id);

    /// @notice Thrown when a zero address is supplied where a contract address is required.
    error ZeroAddress();

    /// @notice Thrown when the supplied address has no deployed bytecode.
    error NotAContract(address contractAddr);

    /// @notice Thrown when {score} is called on a validator that is currently inactive.
    error ValidatorInactive(uint256 id);

    /// @notice Thrown when the external {IValidator.score} call reverts or returns
    ///         a value exceeding the validator's declared {IValidator.maxScore}.
    error ScoringFailed(uint256 validatorId, address contractAddr);

    // ═══════════════════════════════════════════════════════════════════════
    //  INITIALIZER
    // ═══════════════════════════════════════════════════════════════════════

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialises the ValidatorRegistry proxy.
     * @dev Called exactly once via the UUPS proxy at deployment. Sets up role
     *      hierarchy and initialises the validator ID counter.
     *
     * @param admin    Address granted DEFAULT_ADMIN_ROLE and UPGRADER_ROLE.
     *                 Should be a timelock or multisig in production.
     * @param operator Address granted OPERATOR_ROLE; can manage validators.
     */
    function initialize(address admin, address operator) external initializer {
        if (admin    == address(0)) revert ZeroAddress();
        if (operator == address(0)) revert ZeroAddress();

        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE,       admin);
        _grantRole(Constants.UPGRADER_ROLE,  admin);
        _grantRole(Constants.OPERATOR_ROLE,  operator);

        // Validator IDs start at 1; 0 is the null sentinel
        nextValidatorId = 1;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  OPERATOR FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Register a new deterministic scoring validator.
     *
     * @dev The function performs the following checks before registering:
     *      1. `contractAddr` must be non-zero.
     *      2. `contractAddr` must have deployed code (`extcodehash != 0` and `!= EMPTY_HASH`).
     *      3. `contractAddr` must implement {IValidator} (verified via static calls to
     *         `score` and `maxScore`; if either reverts, the registration is rejected).
     *
     *      The `extcodehash` is stored so that future calls to {verifyIntegrity} can detect
     *      if the contract's code was somehow replaced (e.g., a malicious proxy upgrade).
     *
     *      Emits {ValidatorAdded}.
     *
     * @param contractAddr Address of the deployed {IValidator} implementation.
     * @param name         Short human-readable label for the validator.
     * @param description  Longer description of the validator's scoring logic.
     * @return id          The newly assigned validator ID (1-indexed).
     */
    function addValidator(
        address contractAddr,
        string calldata name,
        string calldata description
    )
        external
        onlyRole(Constants.OPERATOR_ROLE)
        returns (uint256 id)
    {
        if (contractAddr == address(0)) revert ZeroAddress();

        // Ensure there is actually code deployed at the address.
        bytes32 codeHash;
        assembly {
            codeHash := extcodehash(contractAddr)
        }
        // extcodehash returns 0 for non-existent accounts and
        // keccak256("") for accounts with no code.
        if (codeHash == bytes32(0) || codeHash == 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470) {
            revert NotAContract(contractAddr);
        }

        // Verify the contract implements IValidator by probing both selectors.
        // We do not care about the actual return values at registration time —
        // only that the calls do not revert.
        _assertImplementsIValidator(contractAddr);

        id = nextValidatorId;
        unchecked { nextValidatorId = id + 1; }

        _validators[id] = Validator({
            contractAddr: contractAddr,
            codeHash:     codeHash,
            name:         name,
            description:  description,
            active:       true,
            addedAt:      uint64(block.timestamp)
        });

        emit ValidatorAdded(id, contractAddr, codeHash, name);
    }

    /**
     * @notice Deactivate a validator, preventing it from being used for future scoring.
     * @dev    Deactivated validators remain in storage so historical score lookups remain
     *         possible. Emits {ValidatorDeactivated}.
     *
     * @param id The validator ID to deactivate.
     */
    function deactivate(uint256 id) external onlyRole(Constants.OPERATOR_ROLE) {
        Validator storage v = _requireExists(id);
        if (!v.active) revert ValidatorAlreadyInactive(id);

        v.active = false;
        emit ValidatorDeactivated(id);
    }

    /**
     * @notice Reactivate a previously deactivated validator.
     * @dev    Emits {ValidatorReactivated}.
     *
     * @param id The validator ID to reactivate.
     */
    function reactivate(uint256 id) external onlyRole(Constants.OPERATOR_ROLE) {
        Validator storage v = _requireExists(id);
        if (v.active) revert ValidatorAlreadyActive(id);

        v.active = true;
        emit ValidatorReactivated(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  SCORING
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Delegate scoring of an agent solution to the registered validator contract.
     *
     * @dev    The validator must be active. The call is forwarded as a `staticcall`
     *         (enforced by Solidity's `view` context) so validators cannot modify state.
     *
     *         Reverts with {ValidatorInactive} if the validator is deactivated, and with
     *         {ScoringFailed} if the underlying {IValidator.score} call fails.
     *
     * @param validatorId The ID of the validator to use.
     * @param solution    ABI-encoded solution payload produced by the agent.
     * @param problemCid  IPFS CID (as bytes32) identifying the problem specification.
     * @return            Score awarded by the validator in [0, IValidator.maxScore()].
     */
    function score(
        uint256 validatorId,
        bytes calldata solution,
        bytes32 problemCid
    )
        external
        view
        returns (uint256)
    {
        Validator storage v = _requireExists(validatorId);
        if (!v.active) revert ValidatorInactive(validatorId);

        // staticcall is guaranteed by the `view` modifier; the IValidator interface
        // also declares `score` as `view`, so this call cannot modify state.
        try IValidator(v.contractAddr).score(solution, problemCid) returns (uint256 result) {
            return result;
        } catch {
            revert ScoringFailed(validatorId, v.contractAddr);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Check whether a validator is currently active.
     * @param id The validator ID to query.
     * @return   True if the validator exists and `active == true`.
     */
    function isActive(uint256 id) external view returns (bool) {
        return _requireExists(id).active;
    }

    /**
     * @notice Verify that the validator contract's deployed bytecode has not changed
     *         since it was registered.
     *
     * @dev    Compares the stored `codeHash` against the live `extcodehash` of the
     *         validator's address. A mismatch indicates the implementation was swapped
     *         (e.g., via a malicious proxy upgrade or `selfdestruct` + redeploy).
     *
     *         This function is `view` and does NOT emit an event. To record an integrity
     *         violation on-chain (and emit {IntegrityCheckFailed}), call {reportIntegrity}.
     *
     * @param id The validator ID to inspect.
     * @return   True if the current bytecode hash matches the stored hash; false otherwise.
     */
    function verifyIntegrity(uint256 id) external view returns (bool) {
        return _checkIntegrity(id);
    }

    /**
     * @notice Return the full {Validator} struct for a given validator ID.
     * @param id The validator ID to query.
     * @return   Memory copy of the stored {Validator} struct.
     */
    function getValidator(uint256 id) external view returns (Validator memory) {
        _requireExists(id);
        return _validators[id];
    }

    /**
     * @notice Return the total number of validators that have ever been registered
     *         (including deactivated ones).
     * @return count Equal to `nextValidatorId - 1` (IDs are 1-indexed).
     */
    function getValidatorCount() external view returns (uint256 count) {
        unchecked { count = nextValidatorId - 1; }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  INTEGRITY REPORTING (state-changing)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Check validator integrity and emit {IntegrityCheckFailed} if the
     *         bytecode has been altered.
     *
     * @dev    Unlike {verifyIntegrity}, this function is state-changing so it can
     *         emit the on-chain event. Anyone may call it — there is no role restriction,
     *         making it suitable for automated watchdog scripts and public keepers.
     *
     *         Emits {IntegrityCheckFailed} if the check fails; otherwise produces no
     *         event or state change.
     *
     * @param id    The validator ID to inspect.
     * @return ok   True if the bytecode is intact; false if tampering is detected.
     */
    function reportIntegrity(uint256 id) external returns (bool ok) {
        ok = _checkIntegrity(id);
        if (!ok) {
            Validator storage v = _validators[id];
            bytes32 currentHash;
            address addr = v.contractAddr;
            assembly {
                currentHash := extcodehash(addr)
            }
            emit IntegrityCheckFailed(id, v.codeHash, currentHash);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Loads the validator at `id` from storage and reverts with
     *      {ValidatorNotFound} if it has not been registered yet.
     *
     *      A validator is considered to exist once its `contractAddr` is non-zero,
     *      which is guaranteed by {addValidator}'s zero-address check.
     *
     * @param id The validator ID to look up.
     * @return v  Storage reference to the {Validator} record.
     */
    function _requireExists(uint256 id) internal view returns (Validator storage v) {
        v = _validators[id];
        if (v.contractAddr == address(0)) revert ValidatorNotFound(id);
    }

    /**
     * @dev Pure integrity check — reads the live `extcodehash` and compares it to
     *      the stored value. Returns `true` if they match.
     *
     * @param id The validator ID to inspect.
     * @return   True if bytecode is unchanged; false if a mismatch is detected.
     */
    function _checkIntegrity(uint256 id) internal view returns (bool) {
        Validator storage v = _requireExists(id);
        bytes32 currentHash;
        address addr = v.contractAddr;
        assembly {
            currentHash := extcodehash(addr)
        }
        return currentHash == v.codeHash;
    }

    /**
     * @dev Validates that `contractAddr` exposes the {IValidator} interface by
     *      making two static probe calls. Reverts with {ScoringFailed} if either
     *      selector is absent or the call reverts.
     *
     *      A zero-length solution and zero `problemCid` are used for the probe;
     *      validators must tolerate these degenerate inputs gracefully (they can
     *      return 0 — the call just must not revert on a pure interface basis).
     *
     * @param contractAddr The address to probe.
     */
    function _assertImplementsIValidator(address contractAddr) internal view {
        // Probe maxScore() — no arguments, just check it doesn't revert
        try IValidator(contractAddr).maxScore() returns (uint256) {
            // success — interface present
        } catch {
            revert ScoringFailed(0, contractAddr);
        }

        // Probe score() with empty/zero inputs
        try IValidator(contractAddr).score("", bytes32(0)) returns (uint256) {
            // success — interface present
        } catch {
            revert ScoringFailed(0, contractAddr);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  UUPS UPGRADE AUTHORISATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @dev Restricts UUPS implementation upgrades to addresses holding
     *      {Constants.UPGRADER_ROLE}. Called internally by the proxy mechanism.
     *
     * @param newImplementation Address of the incoming implementation contract.
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(Constants.UPGRADER_ROLE)
    {}
}
