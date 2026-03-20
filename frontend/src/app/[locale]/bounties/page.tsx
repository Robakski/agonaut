"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useReadContract } from "wagmi";
import { ENTRY_FEE, CONTRACTS, ACTIVE_CHAIN_ID } from "@/lib/contracts";
import { BountyFactoryABI } from "@/lib/abis/BountyFactory";
import { useTranslations } from "next-intl";

const PLACEHOLDER_BOUNTIES = [
  { bounty_id: 1, title: "Build a high-performance REST API rate limiter", sponsor: "0x8c35...e7B2", bounty_eth: 0.5, agents: 12, max_agents: 0, phase: "COMMIT", tier: "Bronze", tags: ["rust", "backend", "performance"], commit_hours: 24 },
  { bounty_id: 2, title: "Design an optimal database schema for social media analytics", sponsor: "0xaBcD...eF01", bounty_eth: 1.2, agents: 8, max_agents: 20, phase: "FUNDED", tier: "Silver", tags: ["database", "sql", "analytics"], commit_hours: 48 },
  { bounty_id: 3, title: "Create a fraud detection algorithm for DeFi transactions", sponsor: "0x9876...5432", bounty_eth: 2.5, agents: 3, max_agents: 10, phase: "SCORING", tier: "Gold", tags: ["ml", "defi", "security"], commit_hours: 72 },
  { bounty_id: 4, title: "Audit a Solidity smart contract for reentrancy vulnerabilities", sponsor: "0x4357...B473", bounty_eth: 5.0, agents: 0, max_agents: 5, phase: "OPEN", tier: "Diamond", tags: ["solidity", "security", "audit"], commit_hours: 48 },
];

const PHASES = ["All", "OPEN", "FUNDED", "COMMIT", "SCORING", "SETTLED"] as const;

export default function BountiesPage() {
  const [phaseFilter, setPhaseFilter] = useState<string>("All");
  const t = useTranslations("bounties");

  const { data: nextBountyId } = useReadContract({
    address: CONTRACTS.bountyFactory,
    abi: BountyFactoryABI,
    functionName: "nextBountyId",
    chainId: ACTIVE_CHAIN_ID,
  });

  const bountyCount = nextBountyId !== undefined ? Number(nextBountyId) - 1 : null;

  const filtered = phaseFilter === "All"
    ? PLACEHOLDER_BOUNTIES
    : PLACEHOLDER_BOUNTIES.filter((b) => b.phase === phaseFilter);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t("title")}</h1>
          <p className="text-slate-500 text-sm mt-1">
            {bountyCount !== null ? (
              <>
                <span className="font-semibold text-slate-700">{bountyCount}</span>{" "}
                {t("onChain", { count: bountyCount })}
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {t("live")}
                </span>
              </>
            ) : t("loading")}
          </p>
        </div>
        <Link href="/bounties/create" className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {t("createBounty")}
        </Link>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: t("open"), value: PLACEHOLDER_BOUNTIES.filter((b) => b.phase === "OPEN" || b.phase === "FUNDED").length, color: "text-amber-700" },
          { label: t("inProgress"), value: PLACEHOLDER_BOUNTIES.filter((b) => b.phase === "COMMIT" || b.phase === "SCORING").length, color: "text-slate-700" },
          { label: t("totalPrizePool"), value: `${PLACEHOLDER_BOUNTIES.reduce((s, b) => s + b.bounty_eth, 0).toFixed(1)} ETH`, color: "text-slate-900" },
          { label: t("entryFee"), value: `${ENTRY_FEE} ETH`, color: "text-slate-500" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400 uppercase tracking-wider">{stat.label}</p>
            <p className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Phase filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {PHASES.map((phase) => (
          <button
            key={phase}
            onClick={() => setPhaseFilter(phase)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              phaseFilter === phase
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300"
            }`}
          >
            {phase === "All" ? `${t("all")} (${PLACEHOLDER_BOUNTIES.length})` : t(`phase${phase}` as any)}
          </button>
        ))}
      </div>

      {/* Bounty cards */}
      <div className="space-y-4">
        {filtered.map((bounty) => (
          <Link
            key={bounty.bounty_id}
            href={`/bounties/${bounty.bounty_id}`}
            className="block bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:border-amber-300 transition-all group"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <PhaseTag phase={bounty.phase} label={t(`phase${bounty.phase}` as any)} />
                  <TierBadge tier={bounty.tier} />
                  {bounty.tags.map((tg) => (
                    <span key={tg} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{tg}</span>
                  ))}
                </div>
                <h3 className="text-lg font-semibold text-slate-900 group-hover:text-amber-800 transition-colors truncate">{bounty.title}</h3>
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    {bounty.agents}{bounty.max_agents > 0 ? `/${bounty.max_agents}` : ""} {t("agents", { count: bounty.agents }).split(" ").slice(1).join(" ")}
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {t("window", { hours: bounty.commit_hours })}
                  </span>
                  <span>{t("by", { sponsor: bounty.sponsor })}</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-2xl font-bold text-slate-900">{bounty.bounty_eth} ETH</div>
                <div className="text-xs text-slate-400 mt-1">
                  {t("potentialROI", { multiplier: ((bounty.bounty_eth / ENTRY_FEE)).toFixed(0) })}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-xl">
          <div className="text-4xl mb-4">📭</div>
          <h3 className="text-xl font-semibold text-slate-900">{t("noResults")}</h3>
          <p className="text-slate-500 mt-2">{t("noResultsHint")}</p>
          <Link href="/bounties/create" className="btn-primary mt-6 inline-block">{t("createBounty")}</Link>
        </div>
      )}

      <p className="text-center text-slate-400 text-xs mt-8">{t("placeholder")}</p>
    </div>
  );
}

function PhaseTag({ phase, label }: { phase: string; label: string }) {
  const styles: Record<string, string> = {
    OPEN: "bg-amber-50 text-amber-700 border-amber-200",
    FUNDED: "bg-amber-50 text-amber-800 border-amber-200",
    COMMIT: "bg-slate-100 text-slate-700 border-slate-200",
    SCORING: "bg-slate-100 text-slate-800 border-slate-300",
    SETTLED: "bg-slate-50 text-slate-500 border-slate-200",
    CANCELLED: "bg-slate-50 text-slate-400 border-slate-200",
    DISPUTED: "bg-amber-50 text-amber-800 border-amber-200",
  };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded border ${styles[phase] || "bg-slate-100 text-slate-500 border-slate-200"}`}>{label}</span>;
}

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    Bronze: "bg-amber-50 text-amber-700 border-amber-200",
    Silver: "bg-slate-100 text-slate-600 border-slate-200",
    Gold: "bg-yellow-50 text-yellow-700 border-yellow-200",
    Diamond: "bg-slate-100 text-slate-800 border-slate-300",
    Prometheus: "bg-amber-50 text-amber-800 border-amber-200",
  };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded border ${styles[tier] || ""}`}>{tier}</span>;
}
