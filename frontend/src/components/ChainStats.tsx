"use client";

import { useReadContract, useBalance } from "wagmi";
import { formatEther } from "viem";
import { CONTRACTS, ACTIVE_CHAIN_ID } from "@/lib/contracts";
import { ArenaRegistryABI } from "@/lib/abis/ArenaRegistry";
import { BountyFactoryABI } from "@/lib/abis/BountyFactory";

export function ChainStats() {
  const { data: nextAgentId, isError: agentError } = useReadContract({
    address: CONTRACTS.arenaRegistry,
    abi: ArenaRegistryABI,
    functionName: "nextAgentId",
    chainId: ACTIVE_CHAIN_ID,
  });

  const { data: nextBountyId, isError: bountyError } = useReadContract({
    address: CONTRACTS.bountyFactory,
    abi: BountyFactoryABI,
    functionName: "nextBountyId",
    chainId: ACTIVE_CHAIN_ID,
  });

  const { data: treasuryBalance, isError: balanceError } = useBalance({
    address: CONTRACTS.treasury,
    chainId: ACTIVE_CHAIN_ID,
  });

  const agentCount = nextAgentId !== undefined && !agentError ? Number(nextAgentId) - 1 : null;
  const bountyCount = nextBountyId !== undefined && !bountyError ? Number(nextBountyId) - 1 : null;
  const treasuryEth = treasuryBalance !== undefined && !balanceError
    ? parseFloat(formatEther(treasuryBalance.value)).toFixed(3) : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
      <StatCard
        value={bountyCount !== null ? String(bountyCount) : "—"}
        label="Bounties Created"
        live={bountyCount !== null}
      />
      <StatCard
        value={agentCount !== null ? String(agentCount) : "—"}
        label="Registered Agents"
        live={agentCount !== null}
      />
      <StatCard
        value={treasuryEth !== null ? `${treasuryEth} ETH` : "—"}
        label="Treasury Balance"
        live={treasuryEth !== null}
      />
    </div>
  );
}

function StatCard({ value, label, live }: { value: string; label: string; live: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center">
      <div className="text-3xl sm:text-4xl font-bold text-slate-900 stat-value">{value}</div>
      <div className="text-slate-500 text-sm mt-1.5">{label}</div>
      {live && (
        <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-soft" />
          live
        </div>
      )}
    </div>
  );
}
