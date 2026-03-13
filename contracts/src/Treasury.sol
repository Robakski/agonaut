// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Constants} from "./Constants.sol";

/**
 * @title Treasury
 * @author Agonaut
 * @notice Collects and manages all protocol fees — the financial backbone of Agonaut.
 * @dev UUPS-upgradeable contract using OpenZeppelin 5.x. Accepts ETH and ERC20 tokens (e.g., USDC).
 *      Withdrawals are gated behind Constants.GOVERNOR_ROLE and protected by ReentrancyGuard.
 *
 *      Upgrade flow:
 *        1. Deploy new implementation.
 *        2. Call `upgradeToAndCall` via the proxy, signed by an account holding Constants.UPGRADER_ROLE.
 *
 *      Storage layout:
 *        - Inherits from Initializable, AccessControlUpgradeable, ReentrancyGuardUpgradeable,
 *          UUPSUpgradeable (no additional storage slots required).
 */
contract Treasury is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Roles (from Constants.sol)
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /**
     * @notice Emitted whenever ETH is deposited into the Treasury.
     * @param from    The address that sent the ETH.
     * @param amount  The amount of ETH deposited (in wei).
     * @param reason  A human-readable description of the deposit.
     */
    event Deposit(address indexed from, uint256 amount, string reason);

    /**
     * @notice Emitted whenever ETH is withdrawn from the Treasury.
     * @param to      The recipient of the ETH.
     * @param amount  The amount of ETH withdrawn (in wei).
     * @param reason  A human-readable description of the withdrawal.
     */
    event Withdrawal(address indexed to, uint256 amount, string reason);

    /**
     * @notice Emitted whenever an ERC20 token is withdrawn from the Treasury.
     * @param token   The ERC20 token contract address.
     * @param to      The recipient of the tokens.
     * @param amount  The token amount withdrawn (in the token's native decimals).
     * @param reason  A human-readable description of the withdrawal.
     */
    event ERC20Withdrawal(
        address indexed token,
        address indexed to,
        uint256 amount,
        string reason
    );

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Thrown when a zero-address is supplied where a valid address is required.
    error ZeroAddress();

    /// @notice Thrown when attempting to withdraw more ETH than the contract holds.
    error InsufficientBalance(uint256 requested, uint256 available);

    /// @notice Thrown when the low-level ETH transfer call fails.
    error TransferFailed();

    /// @notice Thrown when a zero-value deposit is attempted.
    error ZeroDeposit();

    // -------------------------------------------------------------------------
    // Constructor / Initialiser
    // -------------------------------------------------------------------------

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialises the Treasury proxy.
     * @dev Called once after proxy deployment. Grants `DEFAULT_ADMIN_ROLE`, `Constants.GOVERNOR_ROLE`,
     *      and `Constants.UPGRADER_ROLE` to `admin`. The admin can later rotate roles as needed.
     * @param admin The address that receives all initial roles.
     */
    function initialize(address admin) external initializer {
        if (admin == address(0)) revert ZeroAddress();

        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(Constants.GOVERNOR_ROLE, admin);
        _grantRole(Constants.UPGRADER_ROLE, admin);
    }

    // -------------------------------------------------------------------------
    // Receive / Fallback — auto-deposit ETH
    // -------------------------------------------------------------------------

    /**
     * @notice Accepts plain ETH transfers with no calldata.
     * @dev Emits {Deposit} with an empty reason string so all inbound ETH is
     *      fully traceable on-chain even when sent by a contract or EOA with no data.
     */
    receive() external payable {
        if (msg.value == 0) revert ZeroDeposit();
        emit Deposit(msg.sender, msg.value, "");
    }

    /**
     * @notice Accepts ETH transfers sent with unrecognised calldata.
     * @dev Mirrors `receive()` behaviour. Emits {Deposit} so funds are never
     *      silently absorbed.
     */
    fallback() external payable {
        if (msg.value > 0) {
            emit Deposit(msg.sender, msg.value, "");
        }
    }

    // -------------------------------------------------------------------------
    // Deposit
    // -------------------------------------------------------------------------

    /**
     * @notice Deposits ETH into the Treasury with an attached reason.
     * @dev Reverts if no ETH is sent. Use this instead of a raw transfer when the
     *      caller wants the deposit to be labelled (e.g. "arena-fee", "sponsorship").
     * @param reason A short human-readable label for the deposit (stored in the event log).
     */
    function depositWithReason(string calldata reason) external payable {
        if (msg.value == 0) revert ZeroDeposit();
        emit Deposit(msg.sender, msg.value, reason);
    }

    // -------------------------------------------------------------------------
    // Withdrawals — ETH
    // -------------------------------------------------------------------------

    /**
     * @notice Withdraws ETH from the Treasury to a given address.
     * @dev Only callable by accounts with `Constants.GOVERNOR_ROLE`.
     *      Uses a low-level `call` (not `transfer`) to avoid the 2300-gas stipend
     *      restriction, which can cause failures when `to` is a smart contract.
     *      Protected by `nonReentrant` to prevent re-entrancy via the ETH callback.
     * @param to     The payable address that will receive the ETH.
     * @param amount The amount of ETH to send (in wei).
     * @param reason A short human-readable label for the withdrawal.
     */
    function withdraw(
        address payable to,
        uint256 amount,
        string calldata reason
    ) external onlyRole(Constants.GOVERNOR_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();

        uint256 available = address(this).balance;
        if (amount > available) revert InsufficientBalance(amount, available);

        emit Withdrawal(to, amount, reason);

        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    // -------------------------------------------------------------------------
    // Withdrawals — ERC20
    // -------------------------------------------------------------------------

    /**
     * @notice Withdraws an ERC20 token (e.g. USDC) from the Treasury.
     * @dev Only callable by accounts with `Constants.GOVERNOR_ROLE`.
     *      Uses OpenZeppelin's `SafeERC20.safeTransfer` to handle non-standard
     *      ERC20 implementations that do not return a boolean.
     *      Protected by `nonReentrant` to prevent re-entrancy via token callbacks.
     * @param token  The ERC20 token contract to withdraw from.
     * @param to     The recipient address.
     * @param amount The token amount to withdraw (in the token's native decimals).
     * @param reason A short human-readable label for the withdrawal.
     */
    function withdrawERC20(
        IERC20 token,
        address to,
        uint256 amount,
        string calldata reason
    ) external onlyRole(Constants.GOVERNOR_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (address(token) == address(0)) revert ZeroAddress();

        emit ERC20Withdrawal(address(token), to, amount, reason);

        token.safeTransfer(to, amount);
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    /**
     * @notice Returns the current ETH balance held by the Treasury.
     * @return The ETH balance in wei.
     */
    function balance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Returns the current balance of an ERC20 token held by the Treasury.
     * @param token The ERC20 token to query.
     * @return The token balance in the token's native decimals.
     */
    function balanceERC20(IERC20 token) external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    // -------------------------------------------------------------------------
    // UUPS upgrade authorisation
    // -------------------------------------------------------------------------

    /**
     * @notice Authorises a contract upgrade.
     * @dev Required by the UUPS pattern. Restricted to `Constants.UPGRADER_ROLE` so that
     *      upgrade authority can be separated from general governance if desired.
     * @param newImplementation The address of the new implementation contract.
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(Constants.UPGRADER_ROLE) {}
}
