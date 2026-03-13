// SPDX-License-Identifier: MIT
// Phase 2 — not used at launch. Will be integrated when protocol has revenue.
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Constants} from "./Constants.sol";

/// @title AgonToken ($AGON)
/// @notice The native utility token of the Agonaut protocol.
/// @dev Used for agent registration fees and round entry fees.
///      67% of all fees are burned (deflationary), 33% go to treasury reserve.
///      NOT upgradeable — token contract is immutable once deployed.
///
/// Token distribution (1 billion total supply):
///   - 40% Protocol Treasury (vested over 4 years)
///   - 20% Team & Advisors (vested over 3 years, 1 year cliff)
///   - 15% Early Participants (airdrop + initial liquidity)
///   - 15% Ecosystem Fund (grants, partnerships)
///   - 10% Initial Liquidity (DEX pool on Base)
contract AgonToken is ERC20, ERC20Burnable, ERC20Permit, AccessControl {
    // ============================================================
    //                        CONSTANTS
    // ============================================================

    /// @notice Total supply: 1 billion $AGON (18 decimals).
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;

    /// @notice Role that can mint tokens (disabled after initial distribution).
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Whether initial minting is complete. Once true, no more minting.
    bool public mintingFinalized;

    // ============================================================
    //                        ERRORS
    // ============================================================

    /// @notice Thrown when trying to mint after finalization.
    error MintingFinalized();

    /// @notice Thrown when trying to mint beyond total supply.
    error ExceedsTotalSupply(uint256 requested, uint256 remaining);

    // ============================================================
    //                        EVENTS
    // ============================================================

    /// @notice Emitted when minting is permanently disabled.
    event MintingFinalizedEvent();

    // ============================================================
    //                        CONSTRUCTOR
    // ============================================================

    /// @notice Deploy $AGON token with initial admin.
    /// @param admin Address receiving DEFAULT_ADMIN_ROLE and MINTER_ROLE.
    ///        After distributing tokens, admin should call finalizeMinting().
    constructor(address admin)
        ERC20(Constants.TOKEN_NAME, Constants.TOKEN_SYMBOL)
        ERC20Permit(Constants.TOKEN_NAME)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    // ============================================================
    //                        MINTING (one-time distribution)
    // ============================================================

    /// @notice Mint tokens for initial distribution. Only before finalization.
    /// @param to Recipient address.
    /// @param amount Amount of $AGON to mint (18 decimals).
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (mintingFinalized) revert MintingFinalized();
        if (totalSupply() + amount > TOTAL_SUPPLY) {
            revert ExceedsTotalSupply(amount, TOTAL_SUPPLY - totalSupply());
        }
        _mint(to, amount);
    }

    /// @notice Permanently disable minting. Irreversible.
    /// @dev Call this after all initial distribution is complete.
    function finalizeMinting() external onlyRole(DEFAULT_ADMIN_ROLE) {
        mintingFinalized = true;
        emit MintingFinalizedEvent();
    }

    // ============================================================
    //                        BURN HELPERS
    // ============================================================

    /// @notice Burn tokens from caller. Inherited from ERC20Burnable.
    ///         Used by BountyRound and ArenaRegistry for fee burns.

    /// @notice Calculate burn and treasury amounts for a given fee.
    /// @dev Phase 2: 67% burned, 33% to treasury. Hardcoded here since the
    ///      burn/treasury BPS constants live in this contract's domain.
    /// @param feeAmount Total fee in $AGON.
    /// @return burnAmount Amount to burn (67%).
    /// @return treasuryAmount Amount to send to treasury (33%).
    function splitFee(uint256 feeAmount)
        external
        pure
        returns (uint256 burnAmount, uint256 treasuryAmount)
    {
        // 67% burned, 33% to treasury (6700 bps burn, 3300 bps treasury)
        burnAmount = (feeAmount * 6700) / 10000;
        treasuryAmount = feeAmount - burnAmount; // Remainder to avoid rounding loss
    }
}
