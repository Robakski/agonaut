// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {Constants} from "../Constants.sol";

/// @title PartisiaMpcVerifier
/// @notice Verifies MPC scoring results from Partisia Blockchain nodes on Base L2.
/// @dev UUPS upgradeable. MPC nodes sign scoring results off-chain; this contract
///      verifies threshold signatures and stores verified results for BountyRound consumption.
contract PartisiaMpcVerifier is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    // ============================================================
    //                        CUSTOM ERRORS
    // ============================================================

    error NodeAlreadyRegistered(address node);
    error NodeNotRegistered(address node);
    error RoundAlreadyRegistered(address round);
    error RoundNotRegistered(address round);
    error ResultAlreadyVerified(address round);
    error ArrayLengthMismatch(uint256 agentIdsLen, uint256 scoresLen);
    error SignaturesLengthMismatch(uint256 provided, uint256 required);
    error InsufficientValidSignatures(uint256 valid, uint256 required);
    error InvalidSignature(uint256 index);
    error DuplicateSigner(address signer);
    error ResultNotVerified(address round);
    error RoundNotTimedOut(address round);
    error ZeroAddress();

    // ============================================================
    //                        EVENTS
    // ============================================================

    event MpcNodeRegistered(address indexed node);
    event MpcNodeRemoved(address indexed node);
    event RoundRegistered(address indexed round, bytes32 problemCid, uint256[] agentIds);
    event MpcResultVerified(address indexed round, uint256[] agentIds, uint256[] scores);
    event MpcResultTimedOut(address indexed round);

    // ============================================================
    //                        STATE
    // ============================================================

    mapping(address => bool) public isMpcNode;
    address[] public mpcNodes;

    struct MpcRound {
        bytes32 problemCid;
        uint256[] agentIds;
        uint64 registeredAt;
        bool resultVerified;
        uint256[] verifiedAgentIds;
        uint256[] verifiedScores;
    }

    mapping(address => MpcRound) internal _rounds;

    // ============================================================
    //                        INITIALIZER
    // ============================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the verifier.
    /// @param admin Default admin address.
    function initialize(address admin) external initializer {
        if (admin == address(0)) revert ZeroAddress();
        __AccessControl_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(Constants.OPERATOR_ROLE, admin);
        _grantRole(Constants.UPGRADER_ROLE, admin);
    }

    // ============================================================
    //                        UPGRADE AUTH
    // ============================================================

    function _authorizeUpgrade(address) internal override onlyRole(Constants.UPGRADER_ROLE) {}

    // ============================================================
    //                        MPC NODE MANAGEMENT
    // ============================================================

    /// @notice Register a Partisia MPC node address.
    function registerMpcNode(address nodeAddress) external onlyRole(Constants.OPERATOR_ROLE) {
        if (nodeAddress == address(0)) revert ZeroAddress();
        if (isMpcNode[nodeAddress]) revert NodeAlreadyRegistered(nodeAddress);

        isMpcNode[nodeAddress] = true;
        mpcNodes.push(nodeAddress);

        emit MpcNodeRegistered(nodeAddress);
    }

    /// @notice Remove a registered MPC node.
    function removeMpcNode(address nodeAddress) external onlyRole(Constants.OPERATOR_ROLE) {
        if (!isMpcNode[nodeAddress]) revert NodeNotRegistered(nodeAddress);

        isMpcNode[nodeAddress] = false;

        // Swap-and-pop removal
        uint256 len = mpcNodes.length;
        for (uint256 i; i < len; ++i) {
            if (mpcNodes[i] == nodeAddress) {
                mpcNodes[i] = mpcNodes[len - 1];
                mpcNodes.pop();
                break;
            }
        }

        emit MpcNodeRemoved(nodeAddress);
    }

    /// @notice Get all registered MPC node addresses.
    function getMpcNodes() external view returns (address[] memory) {
        return mpcNodes;
    }

    // ============================================================
    //                        ROUND REGISTRATION
    // ============================================================

    /// @notice Register a round for MPC scoring.
    /// @dev Called by BountyFactory when spawning a round.
    function registerRound(
        address roundAddr,
        bytes32 problemCid,
        uint256[] calldata agentIds
    ) external onlyRole(Constants.BOUNTY_ROUND_ROLE) {
        if (roundAddr == address(0)) revert ZeroAddress();
        if (_rounds[roundAddr].registeredAt != 0) revert RoundAlreadyRegistered(roundAddr);

        MpcRound storage r = _rounds[roundAddr];
        r.problemCid = problemCid;
        r.agentIds = agentIds;
        r.registeredAt = uint64(block.timestamp);

        emit RoundRegistered(roundAddr, problemCid, agentIds);
    }

    // ============================================================
    //                        SUBMIT MPC RESULT
    // ============================================================

    /// @notice Submit and verify an MPC-signed scoring result.
    /// @dev Anyone can relay. Requires MPC_SIGNATURE_THRESHOLD valid signatures from registered nodes.
    function submitMpcResult(
        address roundAddr,
        uint256[] calldata agentIds,
        uint256[] calldata scores,
        bytes[] calldata signatures
    ) external {
        MpcRound storage r = _rounds[roundAddr];
        if (r.registeredAt == 0) revert RoundNotRegistered(roundAddr);
        if (r.resultVerified) revert ResultAlreadyVerified(roundAddr);
        if (agentIds.length != scores.length) revert ArrayLengthMismatch(agentIds.length, scores.length);
        if (signatures.length < Constants.MPC_SIGNATURE_THRESHOLD) {
            revert SignaturesLengthMismatch(signatures.length, Constants.MPC_SIGNATURE_THRESHOLD);
        }

        // Build message hash — MUST use sha256 (not keccak256) because Partisia
        // Blockchain signs SHA-256 hashes. See INVARIANTS.md INV-1.10.
        bytes32 messageHash = sha256(abi.encodePacked(roundAddr, agentIds, scores));

        // Verify signatures — track signers to prevent duplicates
        uint256 validCount;
        address[] memory seen = new address[](signatures.length);

        for (uint256 i; i < signatures.length; ++i) {
            address signer = _recoverSigner(messageHash, signatures[i]);
            if (signer == address(0)) revert InvalidSignature(i);
            if (!isMpcNode[signer]) continue; // skip non-registered nodes

            // Check duplicate
            for (uint256 j; j < validCount; ++j) {
                if (seen[j] == signer) revert DuplicateSigner(signer);
            }
            seen[validCount] = signer;
            ++validCount;
        }

        if (validCount < Constants.MPC_SIGNATURE_THRESHOLD) {
            revert InsufficientValidSignatures(validCount, Constants.MPC_SIGNATURE_THRESHOLD);
        }

        // Store verified result
        r.resultVerified = true;
        r.verifiedAgentIds = agentIds;
        r.verifiedScores = scores;

        emit MpcResultVerified(roundAddr, agentIds, scores);
    }

    // ============================================================
    //                        RESULT RETRIEVAL
    // ============================================================

    /// @notice Get verified scores for a round.
    /// @return agentIds The agent IDs in scoring order.
    /// @return scores The corresponding scores.
    function getVerifiedScores(address roundAddr)
        external
        view
        returns (uint256[] memory agentIds, uint256[] memory scores)
    {
        MpcRound storage r = _rounds[roundAddr];
        if (!r.resultVerified) revert ResultNotVerified(roundAddr);
        return (r.verifiedAgentIds, r.verifiedScores);
    }

    /// @notice Check if a round's MPC result has been verified.
    function isResultVerified(address roundAddr) external view returns (bool) {
        return _rounds[roundAddr].resultVerified;
    }

    // ============================================================
    //                        TIMEOUT
    // ============================================================

    /// @notice Check if a round has timed out waiting for MPC results.
    function isTimedOut(address roundAddr) external view returns (bool) {
        MpcRound storage r = _rounds[roundAddr];
        if (r.registeredAt == 0) return false;
        if (r.resultVerified) return false;
        return block.timestamp > r.registeredAt + Constants.MPC_COMPUTATION_TIMEOUT;
    }

    // ============================================================
    //                        VIEW HELPERS
    // ============================================================

    /// @notice Get round info.
    function getRound(address roundAddr)
        external
        view
        returns (
            bytes32 problemCid,
            uint256[] memory agentIds,
            uint64 registeredAt,
            bool resultVerified,
            uint256[] memory verifiedAgentIds,
            uint256[] memory verifiedScores
        )
    {
        MpcRound storage r = _rounds[roundAddr];
        return (r.problemCid, r.agentIds, r.registeredAt, r.resultVerified, r.verifiedAgentIds, r.verifiedScores);
    }

    // ============================================================
    //                        INTERNALS
    // ============================================================

    /// @dev Recover signer from raw ECDSA signature (no Ethereum prefix).
    function _recoverSigner(bytes32 hash, bytes memory sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);

        bytes32 r;
        bytes32 s;
        uint8 v;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }

        // EIP-2: restrict s to lower half order to prevent signature malleability
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }

        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);

        return ecrecover(hash, v, r, s);
    }
}
