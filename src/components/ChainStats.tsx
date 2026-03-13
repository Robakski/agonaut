"use client";

import { useReadContract, useBalance } from "wagmi";
import { formatEther } from "viem";
import { CONTRACTS, ACTIVE_CHAIN_ID } from "@/lib/contracts";
import { ArenaRegistryABI } from "@/lib/abis/ArenaRegistry";
import { BountyFactoryABI } from "@/lib/abis/BountyFactory";

/**
 * ChainStats — client component that reads live data from Base Sepolia contracts
 * and renders the key stats row on the landing page.
 */
export function ChainStats() {
  // Total registered agents: nextAgentId starts at 1, so count = nextAgentId - 1
  const { data: nextAgentId, isError: agentError } = useReadContract({
    address: CONTRACTS.arenaRegistry,
    abi: ArenaRegistryABI,
    functionName: "nextAgentId",
    chainId: ACTIVE_CHAIN_ID,
  });

  // Total bounties created: nextBountyId starts at 1, so count = nextBountyId - 1
  const { data: nextBountyId, isError: bountyError } = useReadContract({
    address: CONTRACTS.bountyFactory,
    abi: BountyFactoryABI,
    functionName: "nextBountyId",
    chainId: ACTIVE_CHAIN_ID,
  });

  // Treasury ETH balance
  const { data: treasuryBalance, isError: balanceError } = useBalance({
    address: CONTRACTS.treasury,
    chainId: ACTIVE_CHAIN_ID,
  });

  const agentCount =
    nextAgentId !== undefined && !agentError
      ? Number(nextAgentId) - 1
      : null;

  const bountyCount =
    nextBountyId !== undefined && !bountyError
      ? Number(nextBountyId) - 1
      : null;

  const treasuryEth =
    treasuryBalance !== undefined && !balanceError
      ? parseFloat(formatEther(treasuryBalance.value)).toFixed(3)
      : null;

  return (
    <section className="py-16 text-center">
      <div className="grid grid-cols-3 gap-8">
        <ChainStat
          value={bountyCount !== null ? String(bountyCount) : "—"}
          label="Bounties Created"
          live={bountyCount !== null}
        />
        <ChainStat
          value={agentCount !== null ? String(agentCount) : "—"}
          label="Registered Agents"
          live={agentCount !== null}
        />
        <ChainStat
          value={treasuryEth !== null ? `${treasuryEth} ETH` : "—"}
          label="Treasury Balance"
          live={treasuryEth !== null}
        />
      </div>
    </section>
  );
}

function ChainStat({
  value,
  label,
  live,
}: {
  value: string;
  label: string;
  live: boolean;
}) {
  return (
    <div>
      <div className="text-4xl font-bold text-white">{value}</div>
      <div className="text-gray-500 mt-1">{label}</div>
      {live && (
        <div className="mt-1 inline-flex items-center gap-1 text-xs text-green-500">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          live
        </div>
      )}
    </div>
  );
}
