// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Constants} from "./Constants.sol";

/**
 * @title ScoringOracle
 * @author Agonaut
 * @notice Receives and stores verified solution scores from the off-chain TEE scoring service.
 * @dev v1: Single authorized scorer (our scoring service backed by Phala TEE).
 *      v2: Multiple independent judge nodes with consensus.
 *
 *      The scorer address is our scoring service that:
 *      1. Receives encrypted solutions from agents
 *      2. Forwards to Phala Cloud TEE for AI evaluation
 *      3. Collects scores and submits here
 *
 *      Solutions NEVER touch this contract — only scores.
 *      Solution privacy is guaranteed by Phala TEE (Intel TDX hardware attestation).
 */
contract ScoringOracle is Initializable, AccessControlUpgradeable, UUPSUpgradeable {

    bytes32 public constant SCORER_ROLE = keccak256("SCORER_ROLE");

    struct RoundResult {
        bool verified;
        uint64 submittedAt;
        uint256[] agentIds;
        uint256[] scores;
    }

    /// @notice roundAddress => scoring result
    mapping(address => RoundResult) private _results;

    /// @notice TEE attestation document hash (for public verification)
    bytes32 public attestationHash;

    // Events
    event ScoresSubmitted(address indexed roundAddr, uint256 agentCount, uint64 timestamp);
    event AttestationUpdated(bytes32 oldHash, bytes32 newHash);

    // Errors
    error ResultAlreadySubmitted(address roundAddr);
    error ResultNotFound(address roundAddr);
    error ArrayLengthMismatch(uint256 idsLength, uint256 scoresLength);
    error EmptyResult();
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(address admin, address scorer) external initializer {
        if (admin == address(0) || scorer == address(0)) revert ZeroAddress();

        __AccessControl_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(Constants.UPGRADER_ROLE, admin);
        _grantRole(SCORER_ROLE, scorer);
    }

    /// @notice Submit scores for a bounty round. Only callable by authorized scorer.
    function submitScores(
        address roundAddr,
        uint256[] calldata agentIds,
        uint256[] calldata scores
    ) external onlyRole(SCORER_ROLE) {
        if (roundAddr == address(0)) revert ZeroAddress();
        if (agentIds.length == 0) revert EmptyResult();
        if (agentIds.length != scores.length) revert ArrayLengthMismatch(agentIds.length, scores.length);
        if (_results[roundAddr].verified) revert ResultAlreadySubmitted(roundAddr);

        _results[roundAddr] = RoundResult({
            verified: true,
            submittedAt: uint64(block.timestamp),
            agentIds: agentIds,
            scores: scores
        });

        emit ScoresSubmitted(roundAddr, agentIds.length, uint64(block.timestamp));
    }

    /// @notice Check if scores have been submitted for a round.
    function isResultVerified(address roundAddr) external view returns (bool) {
        return _results[roundAddr].verified;
    }

    /// @notice Get the scores for a round.
    function getScores(address roundAddr)
        external view
        returns (uint256[] memory agentIds, uint256[] memory scores)
    {
        RoundResult storage result = _results[roundAddr];
        if (!result.verified) revert ResultNotFound(roundAddr);
        return (result.agentIds, result.scores);
    }

    /// @notice Get score for a specific agent in a round.
    function getAgentScore(address roundAddr, uint256 agentId)
        external view
        returns (uint256 score, bool found)
    {
        RoundResult storage result = _results[roundAddr];
        if (!result.verified) return (0, false);

        for (uint256 i; i < result.agentIds.length; ++i) {
            if (result.agentIds[i] == agentId) {
                return (result.scores[i], true);
            }
        }
        return (0, false);
    }

    /// @notice Update the TEE attestation hash (for public verification).
    function setAttestationHash(bytes32 newHash) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 oldHash = attestationHash;
        attestationHash = newHash;
        emit AttestationUpdated(oldHash, newHash);
    }

    function _authorizeUpgrade(address) internal override onlyRole(Constants.UPGRADER_ROLE) {}
}
