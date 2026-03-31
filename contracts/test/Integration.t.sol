// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ArenaRegistry} from "../src/ArenaRegistry.sol";
import {BountyRound} from "../src/BountyRound.sol";
import {Treasury} from "../src/Treasury.sol";
import {EloSystem} from "../src/EloSystem.sol";
import {Constants} from "../src/Constants.sol";

// ═══════════════════════════════════════════════════════════════════════
//  MOCKS
// ═══════════════════════════════════════════════════════════════════════

/// @dev Minimal ERC20 for ArenaRegistry's USDC requirement.
contract MockERC20 is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    uint256 public override totalSupply;

    function transfer(address to, uint256 amount) external override returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }
}

/// @dev Stub StableRegistry — agents are independent (stableId=0).
contract MockStableRegistry {
    function getAgentStable(uint256) external pure returns (uint16) {
        return 0;
    }

    function getStable(uint16) external pure returns (address, uint16) {
        return (address(0), 0);
    }

    function distributeRevenue(uint16, uint256, uint256) external payable {}
}

/// @dev Stub SeasonManager — no-op.
contract MockSeasonManager {
    function recordRoundResult(uint256, uint256[] calldata) external {}
}

/// @dev Stub ScoringOracle — stores scores as if Phala TEE scoring service submitted them.
contract MockScoringOracle {
    uint256[] private _agentIds;
    uint256[] private _scores;
    mapping(address => bool) private _verified;

    function submitScores(address roundAddr, uint256[] memory agentIds, uint256[] memory scores_) public {
        _agentIds = agentIds;
        _scores = scores_;
        _verified[roundAddr] = true;
    }

    function isResultVerified(address roundAddr) external view returns (bool) {
        return _verified[roundAddr];
    }

    function getScores(address) external view returns (uint256[] memory, uint256[] memory) {
        return (_agentIds, _scores);
    }

    function getAgentScore(address roundAddr, uint256 agentId) external view returns (uint256 score, bool found) {
        if (!_verified[roundAddr]) return (0, false);
        for (uint256 i; i < _agentIds.length; ++i) {
            if (_agentIds[i] == agentId) return (_scores[i], true);
        }
        return (0, false);
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════

/// @dev Deploy a UUPS proxy with an implementation and initializer calldata.
function _deployProxy(address impl, bytes memory initData) returns (address) {
    return address(new ERC1967Proxy(impl, initData));
}

// ═══════════════════════════════════════════════════════════════════════
//  INTEGRATION TEST
// ═══════════════════════════════════════════════════════════════════════

contract IntegrationTest is Test {
    // ── Contracts ─────────────────────────────────────────────────────
    Treasury public treasury;
    ArenaRegistry public arena;
    EloSystem public elo;
    MockStableRegistry public stableReg;
    MockSeasonManager public seasonManager;
    MockScoringOracle public scoringOracle;
    MockERC20 public usdc;

    // ── Addresses ─────────────────────────────────────────────────────
    address admin = address(this);
    address agent1Wallet = makeAddr("agent1");
    address agent2Wallet = makeAddr("agent2");
    address agent3Wallet = makeAddr("agent3");

    // ── Config ────────────────────────────────────────────────────────
    uint256 constant ENTRY_FEE = Constants.ENTRY_FEE;
    uint32 constant COMMIT_DUR = 2 hours;
    bytes32 constant PROBLEM_CID = keccak256("test-problem");

    function setUp() public {
        // 1. Treasury (UUPS)
        {
            Treasury impl = new Treasury();
            bytes memory init = abi.encodeCall(Treasury.initialize, (admin));
            treasury = Treasury(payable(_deployProxy(address(impl), init)));
        }

        // 2. USDC mock
        usdc = new MockERC20();

        // 3. ArenaRegistry (UUPS)
        {
            ArenaRegistry impl = new ArenaRegistry();
            bytes memory init = abi.encodeCall(
                ArenaRegistry.initialize,
                (admin, admin, address(usdc), 0, 0) // zero entry fees for testing
            );
            arena = ArenaRegistry(payable(_deployProxy(address(impl), init)));
        }

        // 4. EloSystem (plain, not upgradeable)
        elo = new EloSystem();

        // 5. Mock peripherals
        stableReg = new MockStableRegistry();
        seasonManager = new MockSeasonManager();
        scoringOracle = new MockScoringOracle();

        // 6. Fund agent wallets
        vm.deal(agent1Wallet, 10 ether);
        vm.deal(agent2Wallet, 10 ether);
        vm.deal(agent3Wallet, 10 ether);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════════

    /// @dev Register an agent from `wallet`, returns agentId.
    function _registerAgent(address wallet, bytes32 meta) internal returns (uint256 agentId) {
        vm.prank(wallet);
        agentId = arena.registerWithETH{value: 0}(meta);
    }

    /// @dev Deploy & initialize a BountyRound directly (bypassing BountyFactory).
    function _spawnRound(uint8 tier) internal returns (BountyRound round) {
        round = new BountyRound();

        uint16[] memory prizeDist = new uint16[](3);
        prizeDist[0] = 5000; // 50%
        prizeDist[1] = 3000; // 30%
        prizeDist[2] = 2000; // 20%

        address[6] memory contracts = [
            address(arena),
            address(elo),
            address(stableReg),
            address(seasonManager),
            address(treasury),
            address(scoringOracle)  // [5] scoringOracle
        ];

        round.initialize(
            1,                  // bountyId
            0,                  // roundIndex
            address(this),      // factory (we act as factory)
            contracts,
            PROBLEM_CID,
            ENTRY_FEE,          // entryFee (ETH)
            COMMIT_DUR,
            prizeDist,
            Constants.PROTOCOL_FEE_BPS, // 200 bps = 2%
            0,                  // maxAgents (unlimited)
            tier,               // requiredTier
            0,                  // seasonId (none)
            5000,               // acceptanceThreshold (50%)
            false,              // graduatedPayouts
            address(this)       // sponsor
        );

        // Grant BOUNTY_ROUND_ROLE on ArenaRegistry to this round so it can record results
        arena.grantRole(arena.BOUNTY_ROUND_ROLE(), address(round));
        // Grant ROUND_ROLE on EloSystem to this round
        elo.grantRole(elo.ROUND_ROLE(), address(round));

        // Sponsor deposits bounty (transitions OPEN → FUNDED so agents can enter)
        round.depositBounty{value: 1 ether}();
    }

    function _commitHash(bytes memory solution, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(solution, salt));
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 1: Full Round Lifecycle
    // ═══════════════════════════════════════════════════════════════════

    function test_FullRoundLifecycle() public {
        // a. Register 3 agents
        uint256 id1 = _registerAgent(agent1Wallet, keccak256("agent1"));
        uint256 id2 = _registerAgent(agent2Wallet, keccak256("agent2"));
        uint256 id3 = _registerAgent(agent3Wallet, keccak256("agent3"));

        // Verify initial ELO = 1200 → tier Bronze (0)
        assertEq(arena.getTier(id1), 0, "agent1 should be Bronze");
        assertEq(arena.getTier(id2), 0, "agent2 should be Bronze");
        assertEq(arena.getTier(id3), 0, "agent3 should be Bronze");

        // b/c. Spawn round (tier = Bronze = 0)
        BountyRound round = _spawnRound(0);
        assertEq(uint8(round.getPhase()), uint8(BountyRound.Phase.COMMIT));

        // d. All 3 agents enter with ETH entry fee
        vm.prank(agent1Wallet);
        round.enter{value: ENTRY_FEE}(id1);
        vm.prank(agent2Wallet);
        round.enter{value: ENTRY_FEE}(id2);
        vm.prank(agent3Wallet);
        round.enter{value: ENTRY_FEE}(id3);

        assertEq(round.getParticipantCount(), 3);

        // l. Verify prize pool = sponsor deposit (1 ether)
        assertEq(round.totalPrizePool(), 1 ether, "prize pool should be sponsor deposit");

        // e. Start commit phase (we are factory)
        // startCommitPhase no longer needed — deposit starts clock
        assertEq(uint8(round.getPhase()), uint8(BountyRound.Phase.COMMIT));

        // f. All 3 agents commit different solutions
        bytes memory sol1 = "solution_alpha";
        bytes memory sol2 = "solution_beta";
        bytes memory sol3 = "solution_gamma";
        bytes32 salt1 = keccak256("salt1");
        bytes32 salt2 = keccak256("salt2");
        bytes32 salt3 = keccak256("salt3");

        vm.prank(agent1Wallet);
        round.commitSolution(id1, _commitHash(sol1, salt1));
        vm.prank(agent2Wallet);
        round.commitSolution(id2, _commitHash(sol2, salt2));
        vm.prank(agent3Wallet);
        round.commitSolution(id3, _commitHash(sol3, salt3));

        // g. Warp past commitDeadline
        vm.warp(block.timestamp + COMMIT_DUR + 1);

        // h. Start scoring phase (anyone can call after commit deadline — no reveal phase)
        //    Solutions are submitted off-chain to the Phala TEE scoring service.
        round.startScoringPhase();
        assertEq(uint8(round.getPhase()), uint8(BountyRound.Phase.SCORING));
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 2: Agent Registration & Deregistration
    // ═══════════════════════════════════════════════════════════════════

    function test_AgentRegistration() public {
        uint256 id = _registerAgent(agent1Wallet, keccak256("meta"));

        // Check tier is Bronze (1200 ELO → tier 0)
        assertEq(arena.getTier(id), 0, "initial tier should be Bronze");

        // Check agent is active
        assertTrue(arena.isActive(id), "agent should be active");

        // Deregister
        vm.prank(agent1Wallet);
        arena.deregister(id);

        assertFalse(arena.isActive(id), "agent should be inactive after deregister");
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 3: Cannot Enter Wrong Tier
    // ═══════════════════════════════════════════════════════════════════

    function test_CannotEnterWrongTier() public {
        uint256 id = _registerAgent(agent1Wallet, keccak256("meta"));

        // Spawn a Silver-tier round (tier = 1)
        BountyRound round = _spawnRound(1);

        // Agent has Bronze ELO (1200) — should fail (tier check is before fee check)
        vm.prank(agent1Wallet);
        vm.expectRevert(
            abi.encodeWithSelector(BountyRound.TierMismatch.selector, uint8(0), uint8(1))
        );
        round.enter{value: ENTRY_FEE}(id);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 4: Cannot Commit After Deadline
    // ═══════════════════════════════════════════════════════════════════

    function test_CannotCommitAfterDeadline() public {
        uint256 id = _registerAgent(agent1Wallet, keccak256("meta"));

        BountyRound round = _spawnRound(0);

        vm.prank(agent1Wallet);
        round.enter{value: ENTRY_FEE}(id);

        // startCommitPhase no longer needed — deposit starts clock

        // Warp past commit deadline
        vm.warp(block.timestamp + COMMIT_DUR + 1);

        vm.prank(agent1Wallet);
        vm.expectRevert(BountyRound.CommitDeadlinePassed.selector);
        round.commitSolution(id, keccak256("anything"));
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 5: COMMIT → SCORING transition (no reveal phase)
    // ═══════════════════════════════════════════════════════════════════

    function test_CommitToScoringTransition() public {
        uint256 id = _registerAgent(agent1Wallet, keccak256("meta"));

        BountyRound round = _spawnRound(0);

        vm.prank(agent1Wallet);
        round.enter{value: ENTRY_FEE}(id);

        // startCommitPhase no longer needed — deposit starts clock
        assertEq(uint8(round.getPhase()), uint8(BountyRound.Phase.COMMIT));

        bytes memory solution = "real_solution";
        bytes32 salt = keccak256("real_salt");
        bytes32 hash = _commitHash(solution, salt);

        vm.prank(agent1Wallet);
        round.commitSolution(id, hash);

        // Warp past commit deadline, then transition directly to SCORING (no reveal)
        vm.warp(block.timestamp + COMMIT_DUR + 1);
        round.startScoringPhase();
        assertEq(uint8(round.getPhase()), uint8(BountyRound.Phase.SCORING));
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 6: Cannot Double Enter
    // ═══════════════════════════════════════════════════════════════════

    function test_CannotDoubleEnter() public {
        uint256 id = _registerAgent(agent1Wallet, keccak256("meta"));

        BountyRound round = _spawnRound(0);

        vm.prank(agent1Wallet);
        round.enter{value: ENTRY_FEE}(id);

        vm.prank(agent1Wallet);
        vm.expectRevert(abi.encodeWithSelector(BountyRound.AlreadyEntered.selector, id));
        round.enter{value: ENTRY_FEE}(id);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 7: Emergency Withdraw On Cancel
    // ═══════════════════════════════════════════════════════════════════

    function test_EmergencyWithdrawOnCancel() public {
        uint256 id1 = _registerAgent(agent1Wallet, keccak256("a1"));
        uint256 id2 = _registerAgent(agent2Wallet, keccak256("a2"));

        BountyRound round = _spawnRound(0);

        uint256 bal1Before = agent1Wallet.balance;
        uint256 bal2Before = agent2Wallet.balance;

        vm.prank(agent1Wallet);
        round.enter{value: ENTRY_FEE}(id1);
        vm.prank(agent2Wallet);
        round.enter{value: ENTRY_FEE}(id2);

        // Cancel (we are factory)
        round.cancel("test cancellation");
        assertEq(uint8(round.getPhase()), uint8(BountyRound.Phase.CANCELLED));

        // Both agents withdraw — entry fee is refunded on cancel
        vm.prank(agent1Wallet);
        round.emergencyWithdraw(id1);
        vm.prank(agent2Wallet);
        round.emergencyWithdraw(id2);

        // Entry fees fully refunded, balances restored to pre-entry values
        assertEq(agent1Wallet.balance, bal1Before, "agent1 ETH refunded");
        assertEq(agent2Wallet.balance, bal2Before, "agent2 ETH refunded");
    }
}
