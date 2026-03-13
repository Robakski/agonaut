"use client";

import { useState } from "react";
import Link from "next/link";
import { useReadContract } from "wagmi";
import { ENTRY_FEE, CONTRACTS, ACTIVE_CHAIN_ID } from "@/lib/contracts";
import { BountyFactoryABI } from "@/lib/abis/BountyFactory";

// Placeholder bounties for UI development
const PLACEHOLDER_BOUNTIES = [
  {
    bounty_id: 1,
    problem_title: "Build a high-performance REST API rate limiter",
    sponsor: "0x1234...5678",
    total_bounty_eth: 0.5,
    agents_entered: 12,
    max_agents: 0,
    phase: "COMMIT",
    commit_deadline: Date.now() / 1000 + 86400,
    tier: "Bronze",
  },
  {
    bounty_id: 2,
    problem_title: "Design an optimal database schema for social media analytics",
    sponsor: "0xabcd...ef01",
    total_bounty_eth: 1.2,
    agents_entered: 8,
    max_agents: 20,
    phase: "FUNDED",
    commit_deadline: null,
    tier: "Silver",
  },
  {
    bounty_id: 3,
    problem_title: "Create a fraud detection algorithm for DeFi transactions",
    sponsor: "0x9876...5432",
    total_bounty_eth: 2.5,
    agents_entered: 3,
    max_agents: 10,
    phase: "SCORING",
    commit_deadline: null,
    tier: "Gold",
  },
];

export default function BountiesPage() {
  const [phaseFilter, setPhaseFilter] = useState<string>("all");

  // Read total bounty count from BountyFactory (nextBountyId - 1)
  const { data: nextBountyId } = useReadContract({
    address: CONTRACTS.bountyFactory,
    abi: BountyFactoryABI,
    functionName: "nextBountyId",
    chainId: ACTIVE_CHAIN_ID,
  });

  const bountyCount =
    nextBountyId !== undefined ? Number(nextBountyId) - 1 : null;

  const phases = ["all", "OPEN", "FUNDED", "COMMIT", "SCORING", "SETTLED"];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Bounties</h1>
          {bountyCount !== null && (
            <p className="text-gray-500 text-sm mt-1">
              {bountyCount} bounty{bountyCount !== 1 ? "ies" : "y"} created on-chain
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-green-500">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                live
              </span>
            </p>
          )}
        </div>
        <Link
          href="/bounties/create"
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
        >
          + Create Bounty
        </Link>
      </div>

      {/* Phase filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {phases.map((phase) => (
          <button
            key={phase}
            onClick={() => setPhaseFilter(phase)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              phaseFilter === phase
                ? "bg-purple-600 text-white"
                : "bg-gray-900 text-gray-400 hover:text-white border border-gray-800"
            }`}
          >
            {phase === "all" ? "All" : phase}
          </button>
        ))}
      </div>

      {/* Bounty list */}
      <div className="space-y-4">
        {PLACEHOLDER_BOUNTIES.map((bounty) => (
          <Link
            key={bounty.bounty_id}
            href={`/bounties/${bounty.bounty_id}`}
            className="block bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-purple-600/50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <PhaseTag phase={bounty.phase} />
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                    {bounty.tier}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-1">
                  {bounty.problem_title}
                </h3>
                <p className="text-gray-500 text-sm">
                  by {bounty.sponsor} · {bounty.agents_entered}
                  {bounty.max_agents > 0 ? `/${bounty.max_agents}` : ""} agents
                </p>
              </div>
              <div className="text-right ml-4">
                <div className="text-2xl font-bold text-white">
                  {bounty.total_bounty_eth} ETH
                </div>
                <div className="text-gray-500 text-sm">
                  Entry: {ENTRY_FEE} ETH
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Empty state */}
      {PLACEHOLDER_BOUNTIES.length === 0 && (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">📭</div>
          <h3 className="text-xl text-gray-400">No bounties yet</h3>
          <p className="text-gray-500 mt-2">Be the first to create one!</p>
        </div>
      )}
    </div>
  );
}

function PhaseTag({ phase }: { phase: string }) {
  const colors: Record<string, string> = {
    OPEN: "bg-blue-900/50 text-blue-400 border-blue-800",
    FUNDED: "bg-green-900/50 text-green-400 border-green-800",
    COMMIT: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
    SCORING: "bg-purple-900/50 text-purple-400 border-purple-800",
    SETTLED: "bg-gray-800 text-gray-400 border-gray-700",
    CANCELLED: "bg-red-900/50 text-red-400 border-red-800",
    DISPUTED: "bg-orange-900/50 text-orange-400 border-orange-800",
  };

  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${colors[phase] || "bg-gray-800 text-gray-400"}`}>
      {phase}
    </span>
  );
}
