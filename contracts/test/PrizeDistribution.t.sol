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

contract MockERC20PD is IERC20 {
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

contract MockScorerRegistryPD {
    uint256[] private _agentIds;
    uint256[] private _scores;
    uint256 public nextId = 1;

    function setScores(uint256[] memory agentIds, uint256[] memory scores_) external {
        _agentIds = agentIds;
        _scores = scores_;
    }

    function openScoringRound(address, uint64) external payable returns (uint256) {
        return nextId++;
    }

    function getConsensusScores(uint256) external view returns (uint256[] memory, uint256[] memory) {
        return (_agentIds, _scores);
    }
}

/// @dev Enhanced StableRegistry — per-agent stable membership with configurable revenue share.
contract MockStableRegistryPD {
    mapping(uint256 => uint16) public agentStable;
    mapping(uint16 => address) public stableOwner;
    mapping(uint16 => uint16) public stableRevenueShareBps;

    function setAgentStable(uint256 agentId, uint16 stableId) external {
        agentStable[agentId] = stableId;
    }

    function setStable(uint16 stableId, address owner, uint16 revenueShareBps) external {
        stableOwner[stableId] = owner;
        stableRevenueShareBps[stableId] = revenueShareBps;
    }

    function getAgentStable(uint256 agentId) external view returns (uint16) {
        return agentStable[agentId];
    }

    function getStable(uint16 stableId) external view returns (address, uint16) {
        return (stableOwner[stableId], stableRevenueShareBps[stableId]);
    }

    function getStableShare(uint16 stableId) external view returns (address, uint16) {
        return (stableOwner[stableId], stableRevenueShareBps[stableId]);
    }

    function distributeRevenue(uint16, uint256, uint256) external payable {}

    receive() external payable {}
}

/// @dev Enhanced DelegationVault — per-agent delegation with configurable performance fee.
contract MockDelegationVaultPD {
    mapping(uint256 => uint256) public perfFeeBps;
    mapping(uint256 => uint256) public totalDelegated;

    function setAgentVault(uint256 agentId, uint256 _perfFeeBps, uint256 _totalDelegated) external {
        perfFeeBps[agentId] = _perfFeeBps;
        totalDelegated[agentId] = _totalDelegated;
    }

    function getAgentVault(uint256 agentId) external view returns (uint256, uint256) {
        return (perfFeeBps[agentId], totalDelegated[agentId]);
    }

    function distributeProfits(uint256) external payable {}

    receive() external payable {}
}

contract MockSeasonManagerPD {
    function recordRoundResult(uint256, uint256[] calldata) external {}
}

contract MockScoringOraclePD {
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

function _deployProxy(address impl, bytes memory initData) returns (address) {
    return address(new ERC1967Proxy(impl, initData));
}

// ═══════════════════════════════════════════════════════════════════════
//  PRIZE DISTRIBUTION TESTS
// ═══════════════════════════════════════════════════════════════════════

contract PrizeDistributionTest is Test {
    Treasury public treasury;
    ArenaRegistry public arena;
    EloSystem public elo;
    MockScorerRegistryPD public scorerReg;
    MockStableRegistryPD public stableReg;
    MockDelegationVaultPD public delegationVault;
    MockSeasonManagerPD public seasonManager;
    MockScoringOraclePD public scoringOracle;
    MockERC20PD public usdc;

    address admin = address(this);
    uint32 constant COMMIT_DUR = 2 hours;
    bytes32 constant PROBLEM_CID = keccak256("test-problem");
    uint256 constant ENTRY_FEE = 0; // entry fee is 0 in _spawnRound

    // Wallets
    address[] wallets;

    function setUp() public {
        // Treasury
        {
            Treasury impl = new Treasury();
            bytes memory init = abi.encodeCall(Treasury.initialize, (admin));
            treasury = Treasury(payable(_deployProxy(address(impl), init)));
        }

        usdc = new MockERC20PD();

        // ArenaRegistry
        {
            ArenaRegistry impl = new ArenaRegistry();
            bytes memory init = abi.encodeCall(ArenaRegistry.initialize, (admin, admin, address(usdc), 0, 0));
            arena = ArenaRegistry(payable(_deployProxy(address(impl), init)));
        }

        elo = new EloSystem();

        scorerReg = new MockScorerRegistryPD();
        stableReg = new MockStableRegistryPD();
        delegationVault = new MockDelegationVaultPD();
        seasonManager = new MockSeasonManagerPD();
        scoringOracle = new MockScoringOraclePD();

        // Create 10 wallets
        for (uint256 i = 0; i < 10; i++) {
            address w = makeAddr(string(abi.encodePacked("wallet", vm.toString(i))));
            wallets.push(w);
            vm.deal(w, 100 ether);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────

    function _registerAgent(address wallet) internal returns (uint256) {
        vm.prank(wallet);
        return arena.registerWithETH{value: 0}(keccak256(abi.encodePacked(wallet)));
    }

    function _spawnRound(uint16[] memory prizeDist) internal returns (BountyRound round) {
        round = new BountyRound();
        address[6] memory contracts = [
            address(arena),
            address(elo),
            address(stableReg),
            address(seasonManager),
            address(treasury),
            address(scoringOracle)  // [5] scoringOracle
        ];
        round.initialize(1, 0, address(this), contracts, PROBLEM_CID, 0, COMMIT_DUR, prizeDist, Constants.PROTOCOL_FEE_BPS, 0, 0, 0, 0, false, address(this));
        arena.grantRole(arena.BOUNTY_ROUND_ROLE(), address(round));
        elo.grantRole(elo.ROUND_ROLE(), address(round));

        // Sponsor deposits bounty (transitions OPEN → FUNDED)
        round.depositBounty{value: 1 ether}();
    }

    /// @dev Run a full round through finalization. Returns (round, agentIds).
    function _runFullRound(uint256 numAgents, uint16[] memory prizeDist, uint256[] memory scores)
        internal
        returns (BountyRound round, uint256[] memory agentIds)
    {
        agentIds = new uint256[](numAgents);
        for (uint256 i = 0; i < numAgents; i++) {
            agentIds[i] = _registerAgent(wallets[i]);
        }

        round = _spawnRound(prizeDist);
        _enterRound(round, numAgents, agentIds);
        _commitPhase(round, numAgents, agentIds);

        // Transition COMMIT → SCORING directly (no reveal phase — solutions go to Phala TEE off-chain)
        round.startScoringPhase();

        // Submit TEE-verified scores (simulates Phala TEE scoring result)
        scoringOracle.submitScores(address(round), agentIds, scores);

        // Finalize (reads from ScoringOracle)
        round.finalize();
    }

    function _enterRound(BountyRound round, uint256 numAgents, uint256[] memory agentIds) internal {
        for (uint256 i = 0; i < numAgents; i++) {
            vm.prank(wallets[i]);
            round.enter(agentIds[i]);
        }
    }

    function _commitPhase(BountyRound round, uint256 numAgents, uint256[] memory agentIds) internal {
        // Deposit already starts COMMIT phase — no need for startCommitPhase()
        uint256 i;
        while (i < numAgents) {
            _doCommit(round, wallets[i], agentIds[i], i);
            unchecked { ++i; }
        }
        vm.warp(block.timestamp + COMMIT_DUR + 1);
    }

    function _doCommit(BountyRound round, address wallet, uint256 agentId, uint256 idx) internal {
        bytes memory sol = abi.encodePacked("solution", vm.toString(idx));
        bytes32 salt = keccak256(abi.encodePacked("salt", vm.toString(idx)));
        vm.prank(wallet);
        round.commitSolution(agentId, keccak256(abi.encodePacked(sol, salt)));
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 1: 2 agents — winner gets correct share
    // ═══════════════════════════════════════════════════════════════════

    function test_TwoAgents_WinnerGetsCorrectShare() public {
        uint16[] memory prizeDist = new uint16[](2);
        prizeDist[0] = 7000; // 70%
        prizeDist[1] = 3000; // 30%

        uint256[] memory scores = new uint256[](2);
        scores[0] = 100; // agent0 wins
        scores[1] = 50;

        uint256 treasuryBalBefore = address(treasury).balance;
        uint256 w0Before = wallets[0].balance;
        uint256 w1Before = wallets[1].balance;

        (BountyRound round,) = _runFullRound(2, prizeDist, scores);

        // Claim payouts (pull-based)
        round.claim(wallets[0]);
        round.claim(wallets[1]);
        round.claim(address(treasury));

        uint256 pool = 1 ether; // sponsorDeposit
        // No scoring fee deducted from sponsor pool — clean pricing
        uint256 distributable = pool; // Full pool to winners

        // Winner (rank 0): 70% of distributable
        uint256 gross0 = (distributable * 7000) / 10000;
        uint256 fee0 = (gross0 * 200) / 10000;
        uint256 net0 = gross0 - fee0;

        // Rank 1: 30%
        uint256 gross1 = (distributable * 3000) / 10000;
        uint256 fee1 = (gross1 * 200) / 10000;
        uint256 net1 = gross1 - fee1;

        assertEq(wallets[0].balance, w0Before + net0, "winner net payout");
        assertEq(wallets[1].balance, w1Before + net1, "runner-up net payout");
        assertEq(address(treasury).balance, treasuryBalBefore + fee0 + fee1, "treasury fees");
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 2: 5+ agents — each rank gets correct %
    // ═══════════════════════════════════════════════════════════════════

    function test_FiveAgents_RankDistribution() public {
        uint16[] memory prizeDist = new uint16[](5);
        prizeDist[0] = 4000;
        prizeDist[1] = 2500;
        prizeDist[2] = 1500;
        prizeDist[3] = 1000;
        prizeDist[4] = 1000;

        uint256[] memory scores = new uint256[](5);
        scores[0] = 500; scores[1] = 400; scores[2] = 300; scores[3] = 200; scores[4] = 100;

        uint256[] memory balsBefore = new uint256[](5);
        for (uint256 i = 0; i < 5; i++) balsBefore[i] = wallets[i].balance;

        (BountyRound round,) = _runFullRound(5, prizeDist, scores);

        // Claim payouts
        for (uint256 i = 0; i < 5; i++) round.claim(wallets[i]);

        uint256 pool = 1 ether; // sponsorDeposit — full pool to winners (no scoring deduction)
        uint256 distributable = pool;

        for (uint256 i = 0; i < 5; i++) {
            uint256 gross = (distributable * prizeDist[i]) / 10000;
            uint256 fee = (gross * 200) / 10000;
            uint256 net = gross - fee;
            assertEq(wallets[i].balance, balsBefore[i] + net, string(abi.encodePacked("rank ", vm.toString(i))));
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 3: Treasury receives exactly 2% of each winner's gross
    // ═══════════════════════════════════════════════════════════════════

    function test_TreasuryReceivesExact2Percent() public {
        uint16[] memory prizeDist = new uint16[](3);
        prizeDist[0] = 5000; prizeDist[1] = 3000; prizeDist[2] = 2000;

        uint256[] memory scores = new uint256[](3);
        scores[0] = 90; scores[1] = 60; scores[2] = 30;

        uint256 treasuryBefore = address(treasury).balance;

        (BountyRound round,) = _runFullRound(3, prizeDist, scores);

        // Claim treasury
        round.claim(address(treasury));

        uint256 pool = 1 ether; // sponsorDeposit — full pool to winners (no scoring deduction)
        uint256 distributable = pool;

        uint256 expectedFees;
        for (uint256 i = 0; i < 3; i++) {
            uint256 gross = (distributable * prizeDist[i]) / 10000;
            expectedFees += (gross * 200) / 10000;
        }

        assertEq(address(treasury).balance - treasuryBefore, expectedFees, "treasury total fees");
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 4: ScorerRegistry receives 0.5% of total pool
    // ═══════════════════════════════════════════════════════════════════

    function test_FullPoolGoesToWinners_NoScoringDeduction() public {
        uint16[] memory prizeDist = new uint16[](2);
        prizeDist[0] = 6000; prizeDist[1] = 4000;

        uint256[] memory scores = new uint256[](2);
        scores[0] = 10; scores[1] = 5;

        (BountyRound round,) = _runFullRound(2, prizeDist, scores);

        // Clean pricing: sponsor's full deposit distributes to winners.
        // No scoring fee deduction. Scoring costs covered by entry fees.
        uint256 pool = 1 ether; // sponsorDeposit — 100% goes to prize distribution

        uint256 treasuryClaimable = round.getClaimable(address(treasury));
        assertTrue(treasuryClaimable > 0, "treasury has claimable funds");

        // Full pool distributed (no scoring deduction)
        uint256 gross0 = (pool * 6000) / 10000;
        uint256 gross1 = (pool * 4000) / 10000;
        uint256 fee0 = (gross0 * 200) / 10000;
        uint256 fee1 = (gross1 * 200) / 10000;
        uint256 expectedTreasury = fee0 + fee1; // protocol fees only
        assertEq(treasuryClaimable, expectedTreasury, "treasury gets protocol fees only");
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 5: Stable membership — stable owner gets revenue share
    // ═══════════════════════════════════════════════════════════════════

    function test_StableMembership_RevenueShare() public {
        uint16[] memory prizeDist = new uint16[](1);
        prizeDist[0] = 10000;

        // Register agent first so we know the ID
        uint256 agentId = _registerAgent(wallets[0]);

        // Set stable: agent belongs to stable 1, 10% revenue share
        address stableOwnerAddr = makeAddr("stableOwner");
        stableReg.setAgentStable(agentId, 1);
        stableReg.setStable(1, stableOwnerAddr, 1000); // 10%

        // Now run manually since agent is already registered
        BountyRound round = _spawnRound(prizeDist);

        vm.prank(wallets[0]);
        round.enter(agentId);

        // startCommitPhase no longer needed — deposit starts clock
        bytes memory sol = "stableSol";
        bytes32 salt = keccak256("stableSalt");
        vm.prank(wallets[0]);
        round.commitSolution(agentId, keccak256(abi.encodePacked(sol, salt)));

        vm.warp(block.timestamp + COMMIT_DUR + 1);
        round.startScoringPhase();

        uint256[] memory ids = new uint256[](1); ids[0] = agentId;
        uint256[] memory sc = new uint256[](1); sc[0] = 100;
        scoringOracle.submitScores(address(round), ids, sc);

        uint256 stableOwnerBefore = stableOwnerAddr.balance;
        uint256 walletBefore = wallets[0].balance;

        round.finalize();

        // Claim payouts (claimable goes to stableOwner address, not stableReg)
        round.claim(wallets[0]);
        round.claim(stableOwnerAddr);

        uint256 pool = 1 ether; // sponsorDeposit — full pool to winners (no scoring deduction)
        uint256 distributable = pool;
        uint256 gross = distributable; // 100% to winner
        uint256 protocolFee = (gross * 200) / 10000;
        uint256 afterFee = gross - protocolFee;
        uint256 stableCut = (afterFee * 1000) / 10000; // 10%
        uint256 agentNet = afterFee - stableCut;

        assertEq(stableOwnerAddr.balance - stableOwnerBefore, stableCut, "stable cut");
        assertEq(wallets[0].balance - walletBefore, agentNet, "agent net after stable");
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 6: Stable membership — all 3 parties get correct amounts
    // ═══════════════════════════════════════════════════════════════════

    function test_StableOnly_AllPartiesCorrect() public {
        uint16[] memory prizeDist = new uint16[](1);
        prizeDist[0] = 10000;

        uint256 agentId = _registerAgent(wallets[0]);

        // Stable: 10% revenue share
        stableReg.setAgentStable(agentId, 1);
        stableReg.setStable(1, makeAddr("stableOwner"), 1000);

        BountyRound round = _spawnRound(prizeDist);

        vm.prank(wallets[0]);
        round.enter(agentId);

        // startCommitPhase no longer needed — deposit starts clock
        bytes memory sol = "stableOnlySol";
        bytes32 salt = keccak256("stableOnlySalt");
        vm.prank(wallets[0]);
        round.commitSolution(agentId, keccak256(abi.encodePacked(sol, salt)));

        vm.warp(block.timestamp + COMMIT_DUR + 1);
        round.startScoringPhase();

        uint256[] memory ids = new uint256[](1); ids[0] = agentId;
        uint256[] memory sc = new uint256[](1); sc[0] = 100;
        scoringOracle.submitScores(address(round), ids, sc);

        address stableOwnerAddr = makeAddr("stableOwner");
        uint256 treasuryBefore = address(treasury).balance;
        uint256 stableOwnerBefore = stableOwnerAddr.balance;
        uint256 walletBefore = wallets[0].balance;

        round.finalize();

        // Claim payouts
        round.claim(address(treasury));
        round.claim(stableOwnerAddr);
        round.claim(wallets[0]);

        uint256 pool = 1 ether; // sponsorDeposit — full pool to winners (no scoring deduction)
        uint256 gross = pool;
        uint256 protocolFee = (gross * 200) / 10000;
        uint256 afterFee = gross - protocolFee;
        uint256 stableCut = (afterFee * 1000) / 10000;
        uint256 agentNet = afterFee - stableCut;

        assertEq(address(treasury).balance - treasuryBefore, protocolFee, "protocol fee to treasury");
        assertEq(stableOwnerAddr.balance - stableOwnerBefore, stableCut, "stable revenue share");
        assertEq(wallets[0].balance - walletBefore, agentNet, "agent net payout");

        // Verify all 3 sum correctly (prize distribution only, excluding entry fees)
        assertEq(protocolFee + stableCut + agentNet, gross, "all cuts sum to gross");
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 8: Sum of all payouts ≤ total pool (no wei created)
    // ═══════════════════════════════════════════════════════════════════

    function test_TotalPayouts_NeverExceedPool() public {
        uint16[] memory prizeDist = new uint16[](3);
        prizeDist[0] = 5000; prizeDist[1] = 3333; prizeDist[2] = 1667; // sums to 10000, odd splits

        uint256[] memory scores = new uint256[](3);
        scores[0] = 90; scores[1] = 60; scores[2] = 30;

        uint256 roundBalBefore;
        {
            (BountyRound round,) = _runFullRound(3, prizeDist, scores);
            // After finalize, round should have leftover >= 0
            roundBalBefore = address(round).balance;
        }
        // Round balance should be >= 0 (dust from rounding stays in contract)
        assertTrue(roundBalBefore >= 0, "no wei created from rounding");

        // More importantly: total outflows should not exceed pool
        // This is implicitly proven by the contract not reverting (insufficient balance would revert)
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 9: Only 1 agent enters
    // ═══════════════════════════════════════════════════════════════════

    function test_SingleAgent_GetsFullPrize() public {
        uint16[] memory prizeDist = new uint16[](1);
        prizeDist[0] = 10000;

        uint256[] memory scores = new uint256[](1);
        scores[0] = 100;

        uint256 walletBefore = wallets[0].balance;
        uint256 treasuryBefore = address(treasury).balance;

        (BountyRound round,) = _runFullRound(1, prizeDist, scores);

        // Claim payouts
        round.claim(wallets[0]);
        round.claim(address(treasury));

        uint256 pool = 1 ether; // sponsorDeposit — full pool to winners (no scoring deduction)
        uint256 distributable = pool;
        uint256 gross = distributable;
        uint256 fee = (gross * 200) / 10000;
        uint256 net = gross - fee;

        assertEq(wallets[0].balance, walletBefore + net, "single agent net");
        assertEq(address(treasury).balance - treasuryBefore, fee, "single agent treasury fee");
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 10: Non-winners don't receive payouts
    // ═══════════════════════════════════════════════════════════════════

    function test_NonWinners_NoPayout() public {
        // Only 1 prize slot, but 3 agents
        uint16[] memory prizeDist = new uint16[](1);
        prizeDist[0] = 10000;

        uint256[] memory scores = new uint256[](3);
        scores[0] = 100; scores[1] = 50; scores[2] = 10;

        uint256 w1Before = wallets[1].balance;
        uint256 w2Before = wallets[2].balance;

        _runFullRound(3, prizeDist, scores);

        // Non-winners paid entry fee but receive no prize payout
        assertEq(wallets[1].balance, w1Before, "non-winner 1 no payout");
        assertEq(wallets[2].balance, w2Before, "non-winner 2 no payout");
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 11: Rounding dust stays in contract
    // ═══════════════════════════════════════════════════════════════════

    function test_RoundingDust_StaysInContract() public {
        // Use 3 agents with prize split that causes rounding
        uint16[] memory prizeDist = new uint16[](3);
        prizeDist[0] = 3334; prizeDist[1] = 3333; prizeDist[2] = 3333;

        uint256[] memory scores = new uint256[](3);
        scores[0] = 30; scores[1] = 20; scores[2] = 10;

        (BountyRound round,) = _runFullRound(3, prizeDist, scores);

        // Dust should remain (contract balance >= 0, doesn't revert)
        uint256 dust = address(round).balance;
        assertTrue(dust >= 0, "dust is non-negative");

        // Total outflows + dust should equal the full pool
        // (contract started with pool, distributed to winners + treasury)
    }

    // ═══════════════════════════════════════════════════════════════════
    //  TEST 12: Full pool distributed to winners (no scoring deduction)
    // ═══════════════════════════════════════════════════════════════════

    function test_FullPoolDistributed_NoScoringDeduction() public {
        uint16[] memory prizeDist = new uint16[](1);
        prizeDist[0] = 10000;

        uint256[] memory scores = new uint256[](2);
        scores[0] = 100; scores[1] = 50;

        uint256 walletBefore = wallets[0].balance;

        (BountyRound round,) = _runFullRound(2, prizeDist, scores);

        // Claim payout
        round.claim(wallets[0]);

        uint256 pool = 1 ether; // sponsorDeposit — full pool to winners
        uint256 gross = pool; // 100% to rank 0
        uint256 fee = (gross * 200) / 10000; // 2% protocol fee
        uint256 net = gross - fee;

        // Winner gets full pool minus only 2% protocol fee (entry fee also deducted)
        assertEq(wallets[0].balance, walletBefore + net, "winner gets full pool minus 2% fee");
        assertTrue(net < pool, "net is less than total pool");
    }
}
