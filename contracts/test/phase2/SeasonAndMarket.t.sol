// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {SeasonManager} from "../../src/SeasonManager.sol";
import {PredictionMarket, NothingToClaim, RoundNotSettled} from "../../src/phase2/PredictionMarket.sol";
import {Constants} from "../../src/Constants.sol";

// ═══════════════════════════════════════════════════════════════════════
//  MOCKS
// ═══════════════════════════════════════════════════════════════════════

contract MockBountyFactoryForSeason {
    uint256 public lastBountyId;
    address public lastRoundAddr;
    uint256 private _roundCounter;

    function spawnRound(uint256 bountyId) external returns (address) {
        lastBountyId = bountyId;
        _roundCounter++;
        // forge-lint: disable-next-line(unsafe-typecast) counter is small, fits in uint160
        address round = address(uint160(0xBEEF0000 + _roundCounter));
        lastRoundAddr = round;
        return round;
    }
}

contract MockBountyRoundForMarket {
    uint8 public phase;
    uint256[] private _agentIds;
    uint256[] private _scores;

    function setPhase(uint8 p) external {
        phase = p;
    }

    function setRanking(uint256[] memory agentIds_, uint256[] memory scores_) external {
        _agentIds = agentIds_;
        _scores = scores_;
    }

    function getRanking() external view returns (uint256[] memory, uint256[] memory) {
        return (_agentIds, _scores);
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  SEASON MANAGER TESTS
// ═══════════════════════════════════════════════════════════════════════

contract SeasonManagerTest is Test {
    SeasonManager public season;
    MockBountyFactoryForSeason public factory;

    address admin = address(this);
    address operator = makeAddr("operator");
    address treasury = makeAddr("treasury");
    address roundRole = makeAddr("roundRole");

    function setUp() public {
        factory = new MockBountyFactoryForSeason();

        SeasonManager impl = new SeasonManager();
        bytes memory init = abi.encodeCall(
            SeasonManager.initialize,
            (admin, operator, treasury, address(factory))
        );
        season = SeasonManager(address(new ERC1967Proxy(address(impl), init)));

        season.grantRole(Constants.BOUNTY_ROUND_ROLE, roundRole);
    }

    function test_StartSeason() public {
        vm.prank(operator);
        season.startSeason();

        assertEq(season.currentSeasonId(), 1);
        assertEq(season.nextSeasonId(), 2);
        assertTrue(season.isSeasonActive(1));

        SeasonManager.Season memory s = season.getCurrentSeason();
        assertEq(s.seasonId, 1);
        assertTrue(s.active);
        assertEq(s.endTime, s.startTime + Constants.SEASON_DURATION);
        assertFalse(s.championshipSpawned);
        assertEq(s.prizePool, 0);
    }

    function test_RecordRoundResults() public {
        vm.prank(operator);
        season.startSeason();

        uint256[] memory agents = new uint256[](5);
        agents[0] = 10; // 1st → 100 pts
        agents[1] = 20; // 2nd → 75 pts
        agents[2] = 30; // 3rd → 60 pts
        agents[3] = 40; // 4th → 50 pts
        agents[4] = 50; // 5th → 40 pts

        vm.prank(roundRole);
        season.recordRoundResult(1, agents);

        assertEq(season.getAgentSeasonPoints(1, 10), 100);
        assertEq(season.getAgentSeasonPoints(1, 20), 75);
        assertEq(season.getAgentSeasonPoints(1, 30), 60);
        assertEq(season.getAgentSeasonPoints(1, 40), 50);
        assertEq(season.getAgentSeasonPoints(1, 50), 40);

        (uint256[] memory ids, uint256[] memory pts) = season.getSeasonLeaderboard(1, 5);
        assertEq(ids[0], 10);
        assertEq(pts[0], 100);
        assertEq(ids[4], 50);
        assertEq(pts[4], 40);
    }

    function test_EndSeason() public {
        vm.prank(operator);
        season.startSeason();

        season.addToSeasonPrizePool{value: 1 ether}(1);

        vm.warp(block.timestamp + Constants.SEASON_DURATION);
        season.endSeason(1);

        assertFalse(season.isSeasonActive(1));
        assertEq(season.currentSeasonId(), 0);
    }

    function test_ChampionshipSpawning() public {
        vm.prank(operator);
        season.startSeason();

        vm.prank(operator);
        season.setChampionshipBountyId(42);

        vm.prank(operator);
        season.spawnChampionship(1);

        assertEq(season.getSeasonRoundCount(1), 1);
        address roundAddr = season.getSeasonRound(1, 0);
        assertEq(roundAddr, factory.lastRoundAddr());
        assertEq(factory.lastBountyId(), 42);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(SeasonManager.ChampionshipAlreadySpawned.selector, 1));
        season.spawnChampionship(1);
    }

    function test_CannotRecordResultsForEndedSeason() public {
        vm.prank(operator);
        season.startSeason();

        vm.warp(block.timestamp + Constants.SEASON_DURATION);
        season.endSeason(1);

        uint256[] memory agents = new uint256[](1);
        agents[0] = 10;

        vm.prank(roundRole);
        vm.expectRevert(abi.encodeWithSelector(SeasonManager.SeasonNotActive.selector, 1));
        season.recordRoundResult(1, agents);
    }

    function test_MultipleSeasons() public {
        vm.prank(operator);
        season.startSeason();

        uint256[] memory agents1 = new uint256[](2);
        agents1[0] = 10;
        agents1[1] = 20;
        vm.prank(roundRole);
        season.recordRoundResult(1, agents1);

        vm.warp(block.timestamp + Constants.SEASON_DURATION);
        season.endSeason(1);

        vm.prank(operator);
        season.startSeason();
        assertEq(season.currentSeasonId(), 2);
        assertTrue(season.isSeasonActive(2));

        assertEq(season.getAgentSeasonPoints(2, 10), 0);
        assertEq(season.getAgentSeasonPoints(2, 20), 0);
        assertEq(season.getAgentSeasonPoints(1, 10), 100);
        assertEq(season.getAgentSeasonPoints(1, 20), 75);

        uint256[] memory agents2 = new uint256[](1);
        agents2[0] = 20;
        vm.prank(roundRole);
        season.recordRoundResult(2, agents2);
        assertEq(season.getAgentSeasonPoints(2, 20), 100);
    }

    receive() external payable {}
}

// ═══════════════════════════════════════════════════════════════════════
//  PREDICTION MARKET TESTS
// ═══════════════════════════════════════════════════════════════════════

contract PredictionMarketTest is Test {
    PredictionMarket public pm;
    MockBountyRoundForMarket public round;

    address treasury;
    address bettor1 = makeAddr("bettor1");
    address bettor2 = makeAddr("bettor2");
    address bettor3 = makeAddr("bettor3");

    uint16 constant FEE_BPS = 200;

    function setUp() public {
        treasury = makeAddr("treasury");
        round = new MockBountyRoundForMarket();
        pm = new PredictionMarket(treasury, FEE_BPS);

        vm.deal(bettor1, 10 ether);
        vm.deal(bettor2, 10 ether);
        vm.deal(bettor3, 10 ether);
    }

    function test_CreateMarket() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 marketId = pm.createMarket(address(round), 42, 3, deadline);

        assertEq(marketId, 1);
        assertEq(pm.nextMarketId(), 2);

        PredictionMarket.Market memory m = pm.getMarket(marketId);
        assertEq(m.roundAddr, address(round));
        assertEq(m.agentId, 42);
        assertEq(m.topN, 3);
        assertEq(m.deadline, deadline);
        assertFalse(m.resolved);
    }

    function test_BuyShares() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 id = pm.createMarket(address(round), 42, 3, deadline);

        vm.prank(bettor1);
        pm.betYes{value: 1 ether}(id);

        vm.prank(bettor2);
        pm.betNo{value: 2 ether}(id);

        PredictionMarket.Market memory m = pm.getMarket(id);
        assertEq(m.totalYesBets, 1 ether);
        assertEq(m.totalNoBets, 2 ether);

        (uint256 yesAmt, uint256 noAmt) = pm.getUserBets(id, bettor1);
        assertEq(yesAmt, 1 ether);
        assertEq(noAmt, 0);

        (uint256 yesPct, uint256 noPct) = pm.getOdds(id);
        assertEq(yesPct, 6666);
        assertEq(noPct, 3333);
    }

    function test_SettleAndClaim() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 id = pm.createMarket(address(round), 42, 3, deadline);

        vm.prank(bettor1);
        pm.betYes{value: 1 ether}(id);
        vm.prank(bettor2);
        pm.betNo{value: 1 ether}(id);

        round.setPhase(4);
        uint256[] memory agentIds = new uint256[](3);
        uint256[] memory scores = new uint256[](3);
        agentIds[0] = 42; agentIds[1] = 99; agentIds[2] = 77;
        scores[0] = 100; scores[1] = 80; scores[2] = 60;
        round.setRanking(agentIds, scores);

        pm.resolve(id);
        PredictionMarket.Market memory m = pm.getMarket(id);
        assertTrue(m.resolved);
        assertTrue(m.outcome);

        uint256 balBefore = bettor1.balance;
        vm.prank(bettor1);
        pm.claim(id);

        uint256 totalPool = 2 ether;
        uint256 fee = (totalPool * FEE_BPS) / 10000;
        uint256 netPool = totalPool - fee;
        assertEq(bettor1.balance - balBefore, netPool);

        vm.prank(bettor2);
        vm.expectRevert(abi.encodeWithSelector(NothingToClaim.selector, id, bettor2));
        pm.claim(id);
    }

    function test_CannotSettleBeforeRoundSettled() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 id = pm.createMarket(address(round), 42, 3, deadline);

        round.setPhase(2);

        vm.expectRevert(abi.encodeWithSelector(RoundNotSettled.selector, id));
        pm.resolve(id);
    }

    function test_AllBetsOnOneSide() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 id = pm.createMarket(address(round), 42, 1, deadline);

        vm.prank(bettor1);
        pm.betYes{value: 1 ether}(id);
        vm.prank(bettor2);
        pm.betYes{value: 1 ether}(id);

        round.setPhase(4);
        uint256[] memory agentIds = new uint256[](2);
        uint256[] memory scores = new uint256[](2);
        agentIds[0] = 42; agentIds[1] = 99;
        scores[0] = 100; scores[1] = 50;
        round.setRanking(agentIds, scores);

        pm.resolve(id);

        uint256 balBefore = bettor1.balance;
        vm.prank(bettor1);
        pm.claim(id);

        uint256 totalPool = 2 ether;
        uint256 fee = (totalPool * FEE_BPS) / 10000;
        uint256 netPool = totalPool - fee;
        uint256 expectedPayout = netPool / 2;
        assertEq(bettor1.balance - balBefore, expectedPayout);
    }
}
