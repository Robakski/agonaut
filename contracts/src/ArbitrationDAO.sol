// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {Constants} from "./Constants.sol";

/// @notice Minimal interface to query BountyRound state.
interface IBountyRound {
    enum Phase { OPEN, COMMIT, REVEAL, SCORING, SETTLED, CANCELLED }
    function getPhase() external view returns (Phase);
    function totalPrizePool() external view returns (uint256);
    function factory() external view returns (address);
}

/// @title ArbitrationDAO
/// @author Agonaut Protocol
/// @notice Dispute resolution for bounty rounds. Arbitrators stake ETH, get
///         pseudo-randomly selected to vote on disputes, and earn fees from
///         forfeited dispute bonds.
contract ArbitrationDAO is
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    // ============================================================
    //                        ENUMS & STRUCTS
    // ============================================================

    enum DisputeStatus { OPEN, UPHELD, REJECTED, NO_MAJORITY }

    struct Dispute {
        uint256 id;
        address opener;
        address round;
        uint256 bond;
        string reason;
        uint64 openedAt;
        uint64 deadline;
        DisputeStatus status;
        address[] arbitrators;
        uint8 votesFor;
        uint8 votesAgainst;
        bool resolved;
    }

    // ============================================================
    //                        CUSTOM ERRORS
    // ============================================================

    error NotEnoughArbitrators(uint256 available, uint256 required);
    error AlreadyRegistered();
    error NotRegistered();
    error AssignedToActiveDispute();
    error InvalidRoundPhase();
    error RoundAlreadyDisputed(address round);
    error InsufficientBond(uint256 sent, uint256 required);
    error NotSelectedArbitrator(uint256 disputeId, address caller);
    error AlreadyVoted(uint256 disputeId, address caller);
    error DisputeNotOpen(uint256 disputeId);
    error DisputeNotResolvable(uint256 disputeId);
    error TransferFailed(address to, uint256 amount);
    error ZeroAddress();

    // ============================================================
    //                        EVENTS
    // ============================================================

    event ArbitratorRegistered(address indexed arbitrator, uint256 stake);
    event ArbitratorUnregistered(address indexed arbitrator, uint256 stake);
    event DisputeOpened(uint256 indexed disputeId, address indexed opener, address indexed round, uint256 bond, string reason);
    event ArbitratorSelected(uint256 indexed disputeId, address indexed arbitrator);
    event ArbitratorVoted(uint256 indexed disputeId, address indexed arbitrator, bool supportDispute);
    event DisputeResolved(uint256 indexed disputeId, DisputeStatus outcome);

    // ============================================================
    //                        STATE
    // ============================================================

    /// @dev Minimum time an arbitrator must have been staked before being eligible for selection.
    ///      Prevents flash-loan-stake-vote-unstake attacks within a single block.
    uint64 public constant MIN_STAKE_AGE = 7 days;

    /// @dev Registered arbitrators (index-addressable for random selection).
    address[] public arbitratorList;
    mapping(address => uint256) public arbitratorStake;
    /// @dev Timestamp when each arbitrator registered (staked). Used for MIN_STAKE_AGE enforcement.
    mapping(address => uint64) public stakedAt;
    /// @dev Index+1 in arbitratorList (0 means not registered).
    mapping(address => uint256) private _arbitratorIndex;

    /// @dev Track active dispute assignments per arbitrator.
    mapping(address => uint256) public activeDisputeCount;

    /// @dev Disputes.
    uint256 public nextDisputeId;
    mapping(uint256 => Dispute) public disputes;
    /// @dev One active dispute per round.
    mapping(address => uint256) public roundToDisputeId;
    mapping(address => bool) public roundDisputed;

    /// @dev Vote tracking: disputeId => arbitrator => voted.
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    // ============================================================
    //                        INITIALIZER
    // ============================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        if (admin == address(0)) revert ZeroAddress();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(Constants.UPGRADER_ROLE, admin);
        nextDisputeId = 1;
    }

    // ============================================================
    //                        ARBITRATOR REGISTRATION
    // ============================================================

    /// @notice Stake ETH to become an eligible arbitrator.
    function registerArbitrator() external payable nonReentrant {
        if (_arbitratorIndex[msg.sender] != 0) revert AlreadyRegistered();
        if (msg.value < Constants.MIN_ARBITRATOR_STAKE) {
            revert InsufficientBond(msg.value, Constants.MIN_ARBITRATOR_STAKE);
        }

        arbitratorList.push(msg.sender);
        _arbitratorIndex[msg.sender] = arbitratorList.length; // 1-indexed
        arbitratorStake[msg.sender] = msg.value;
        stakedAt[msg.sender] = uint64(block.timestamp);

        _grantRole(Constants.ARBITRATOR_ROLE, msg.sender);

        emit ArbitratorRegistered(msg.sender, msg.value);
    }

    /// @notice Withdraw stake and deregister. Fails if assigned to active disputes.
    function unregisterArbitrator() external nonReentrant {
        if (_arbitratorIndex[msg.sender] == 0) revert NotRegistered();
        if (activeDisputeCount[msg.sender] > 0) revert AssignedToActiveDispute();

        uint256 stake = arbitratorStake[msg.sender];
        uint256 idx = _arbitratorIndex[msg.sender] - 1;

        // Swap-and-pop
        uint256 lastIdx = arbitratorList.length - 1;
        if (idx != lastIdx) {
            address last = arbitratorList[lastIdx];
            arbitratorList[idx] = last;
            _arbitratorIndex[last] = idx + 1;
        }
        arbitratorList.pop();
        delete _arbitratorIndex[msg.sender];
        delete arbitratorStake[msg.sender];

        _revokeRole(Constants.ARBITRATOR_ROLE, msg.sender);

        _safeTransferEth(msg.sender, stake);

        emit ArbitratorUnregistered(msg.sender, stake);
    }

    // ============================================================
    //                        OPEN DISPUTE
    // ============================================================

    /// @notice Open a dispute against a bounty round's outcome.
    /// @param roundAddr The BountyRound contract address.
    /// @param reason Human-readable explanation.
    function openDispute(address roundAddr, string calldata reason) external payable nonReentrant {
        if (roundAddr == address(0)) revert ZeroAddress();
        if (roundDisputed[roundAddr]) revert RoundAlreadyDisputed(roundAddr);

        // Verify round phase
        IBountyRound round = IBountyRound(roundAddr);
        IBountyRound.Phase p = round.getPhase();
        if (p != IBountyRound.Phase.SCORING && p != IBountyRound.Phase.SETTLED) {
            revert InvalidRoundPhase();
        }

        // Calculate and verify bond
        uint256 bountyValue = round.totalPrizePool();
        uint256 requiredBond = (bountyValue * Constants.ARBITRATION_BOND_BPS) / Constants.BPS_DENOMINATOR;
        if (msg.value < requiredBond) revert InsufficientBond(msg.value, requiredBond);

        // Need enough arbitrators
        uint256 count = Constants.ARBITRATOR_COUNT;
        if (arbitratorList.length < count) {
            revert NotEnoughArbitrators(arbitratorList.length, count);
        }

        // Create dispute
        uint256 disputeId = nextDisputeId++;
        Dispute storage d = disputes[disputeId];
        d.id = disputeId;
        d.opener = msg.sender;
        d.round = roundAddr;
        d.bond = msg.value;
        d.reason = reason;
        d.openedAt = uint64(block.timestamp);
        d.deadline = uint64(block.timestamp) + Constants.ARBITRATION_WINDOW;
        d.status = DisputeStatus.OPEN;

        roundDisputed[roundAddr] = true;
        roundToDisputeId[roundAddr] = disputeId;

        // Select arbitrators pseudo-randomly
        _selectArbitrators(disputeId);

        emit DisputeOpened(disputeId, msg.sender, roundAddr, msg.value, reason);
    }

    // ============================================================
    //                        VOTING
    // ============================================================

    /// @notice Cast a vote on an open dispute. Only selected arbitrators.
    /// @param disputeId The dispute to vote on.
    /// @param supportDispute True = uphold the dispute, false = reject.
    function vote(uint256 disputeId, bool supportDispute) external {
        Dispute storage d = disputes[disputeId];
        if (d.status != DisputeStatus.OPEN) revert DisputeNotOpen(disputeId);
        if (hasVoted[disputeId][msg.sender]) revert AlreadyVoted(disputeId, msg.sender);

        // Check caller is a selected arbitrator
        bool found;
        for (uint256 i; i < d.arbitrators.length; ++i) {
            if (d.arbitrators[i] == msg.sender) { found = true; break; }
        }
        if (!found) revert NotSelectedArbitrator(disputeId, msg.sender);

        hasVoted[disputeId][msg.sender] = true;

        if (supportDispute) {
            d.votesFor++;
        } else {
            d.votesAgainst++;
        }

        emit ArbitratorVoted(disputeId, msg.sender, supportDispute);
    }

    // ============================================================
    //                        RESOLUTION
    // ============================================================

    /// @notice Resolve a dispute after majority is reached or window expires.
    /// @param disputeId The dispute to resolve.
    function resolveDispute(uint256 disputeId) external nonReentrant {
        Dispute storage d = disputes[disputeId];
        if (d.status != DisputeStatus.OPEN) revert DisputeNotOpen(disputeId);

        uint8 majority = (Constants.ARBITRATOR_COUNT / 2) + 1; // 3
        bool hasMajority = d.votesFor >= majority || d.votesAgainst >= majority;
        bool expired = block.timestamp >= d.deadline;

        if (!hasMajority && !expired) revert DisputeNotResolvable(disputeId);

        // Decrement active counts for selected arbitrators
        for (uint256 i; i < d.arbitrators.length; ++i) {
            if (activeDisputeCount[d.arbitrators[i]] > 0) {
                activeDisputeCount[d.arbitrators[i]]--;
            }
        }

        if (d.votesFor >= majority) {
            // UPHELD — refund bond to opener
            d.status = DisputeStatus.UPHELD;
            d.resolved = true;
            _safeTransferEth(d.opener, d.bond);
        } else if (d.votesAgainst >= majority) {
            // REJECTED — bond split among arbitrators
            d.status = DisputeStatus.REJECTED;
            d.resolved = true;
            uint256 share = d.bond / d.arbitrators.length;
            for (uint256 i; i < d.arbitrators.length; ++i) {
                _safeTransferEth(d.arbitrators[i], share);
            }
        } else {
            // NO MAJORITY (timeout) — bond returned to opener
            d.status = DisputeStatus.NO_MAJORITY;
            d.resolved = true;
            _safeTransferEth(d.opener, d.bond);
        }

        emit DisputeResolved(disputeId, d.status);
    }

    // ============================================================
    //                        VIEW FUNCTIONS
    // ============================================================

    /// @notice Check if a round has an active (unresolved) dispute.
    function isDisputed(address roundAddr) external view returns (bool) {
        if (!roundDisputed[roundAddr]) return false;
        uint256 did = roundToDisputeId[roundAddr];
        return disputes[did].status == DisputeStatus.OPEN;
    }

    /// @notice Get dispute details.
    function getDispute(uint256 disputeId)
        external
        view
        returns (
            address opener,
            address round,
            uint256 bond,
            string memory reason,
            uint64 openedAt,
            uint64 deadline,
            DisputeStatus status,
            uint8 votesFor,
            uint8 votesAgainst,
            address[] memory arbitrators
        )
    {
        Dispute storage d = disputes[disputeId];
        return (d.opener, d.round, d.bond, d.reason, d.openedAt, d.deadline, d.status, d.votesFor, d.votesAgainst, d.arbitrators);
    }

    /// @notice Number of registered arbitrators.
    function arbitratorCount() external view returns (uint256) {
        return arbitratorList.length;
    }

    // ============================================================
    //                        INTERNALS
    // ============================================================

    /// @dev Pseudo-random selection of ARBITRATOR_COUNT arbitrators from the eligible pool.
    ///      Only arbitrators who have been staked for at least MIN_STAKE_AGE are eligible.
    ///      This prevents flash-loan-stake-vote-unstake attacks within a single block.
    function _selectArbitrators(uint256 disputeId) internal {
        uint256 poolSize = arbitratorList.length;
        uint256 count = Constants.ARBITRATOR_COUNT;
        Dispute storage d = disputes[disputeId];

        // Build eligible pool: only arbitrators whose stake has aged past MIN_STAKE_AGE
        address[] memory eligiblePool = new address[](poolSize);
        uint256 eligibleCount = 0;
        for (uint256 i; i < poolSize; ++i) {
            address a = arbitratorList[i];
            if (block.timestamp >= stakedAt[a] + MIN_STAKE_AGE) {
                eligiblePool[eligibleCount] = a;
                ++eligibleCount;
            }
        }

        if (eligibleCount < count) revert NotEnoughArbitrators(eligibleCount, count);

        // Fisher-Yates partial shuffle on eligible pool
        for (uint256 i; i < count; ++i) {
            uint256 remaining = eligibleCount - i;
            uint256 rand = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), disputeId, i)));
            uint256 idx = i + (rand % remaining);

            // Swap
            (eligiblePool[i], eligiblePool[idx]) = (eligiblePool[idx], eligiblePool[i]);

            address selected = eligiblePool[i];
            d.arbitrators.push(selected);
            activeDisputeCount[selected]++;

            emit ArbitratorSelected(disputeId, selected);
        }
    }

    /// @dev Safe ETH transfer.
    function _safeTransferEth(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool success,) = to.call{value: amount}("");
        if (!success) revert TransferFailed(to, amount);
    }

    /// @dev UUPS upgrade authorization.
    function _authorizeUpgrade(address) internal override onlyRole(Constants.UPGRADER_ROLE) {}
}
