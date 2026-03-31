"use client";

import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { useReadContract } from "wagmi";
import { ENTRY_FEE, CONTRACTS, ACTIVE_CHAIN_ID, API_URL } from "@/lib/contracts";
import { BountyFactoryABI } from "@/lib/abis/BountyFactory";
import { useTranslations } from "next-intl";

interface Bounty {
  bounty_id: number;
  title: string;
  sponsor: string;
  bounty_eth: number;
  agents: number;
  max_agents: number;
  phase: string;
  tier: string;
  tags: string[];
  commit_hours: number;
  isPrivate?: boolean;
}

const PHASES = ["All", "OPEN", "COMMIT", "SCORING", "SETTLED"] as const;

export default function BountiesPage() {
  const [phaseFilter, setPhaseFilter] = useState<string>("All");
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const t = useTranslations("bounties");

  const { data: nextBountyId } = useReadContract({
    address: CONTRACTS.bountyFactory,
    abi: BountyFactoryABI,
    functionName: "nextBountyId",
    chainId: ACTIVE_CHAIN_ID,
  });

  const bountyCount = nextBountyId !== undefined ? Number(nextBountyId) - 1 : null;

  // Fetch bounties from API
  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/bounties/?limit=100`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          // Map backend phases to user-facing phases:
          // Contract OPEN = unfunded (hide), FUNDED = accepting agents (show as "OPEN")
          const PHASE_MAP: Record<string, string> = {
            "OPEN": "_HIDE_",      // Unfunded — don't show
            "CREATED": "_HIDE_",   // Legacy — don't show
            "FUNDED": "OPEN",      // Funded & accepting agents → user sees "OPEN"
            "COMMIT": "COMMIT",
            "SCORING": "SCORING",
            "SETTLED": "SETTLED",
            "CANCELLED": "CANCELLED",
            "DISPUTED": "DISPUTED",
          };
          setBounties(
            data
              .map((b) => ({
                bounty_id: b.bounty_id,
                title: b.problem_title || b.title || "Untitled",
                sponsor: b.sponsor ? `${b.sponsor.slice(0, 6)}...${b.sponsor.slice(-4)}` : "Unknown",
                bounty_eth: b.total_bounty_eth || 0,
                agents: b.agents_entered || 0,
                max_agents: b.max_agents || 0,
                phase: PHASE_MAP[b.phase] || b.phase,
                tier: "Bronze",
                tags: b.tags || [],
                commit_hours: b.commit_hours || 24,
                isPrivate: b.is_private || false,
              }))
              .filter((b) => b.phase !== "_HIDE_")  // Hide unfunded bounties
          );
        }
        setError(false);
      })
      .catch(() => { setError(true); })
      .finally(() => { setLoading(false); });
  }, []);
  const filtered = phaseFilter === "All"
    ? bounties
    : bounties.filter((b) => b.phase === phaseFilter);

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
          { label: t("open"), value: bounties.filter((b) => b.phase === "OPEN").length, color: "text-amber-700" },
          { label: t("inProgress"), value: bounties.filter((b) => b.phase === "COMMIT" || b.phase === "SCORING").length, color: "text-slate-700" },
          { label: t("totalPrizePool"), value: `${bounties.reduce((s, b) => s + b.bounty_eth, 0).toFixed(1)} ETH`, color: "text-slate-900" },
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
            {phase === "All" ? `${t("all")} (${bounties.length})` : t(`phase${phase}` as any)}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm animate-pulse">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-1/4 mb-3" />
                  <div className="h-5 bg-slate-200 rounded w-3/4 mb-3" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
                <div className="h-8 bg-slate-200 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="text-center py-20 bg-white border border-red-100 rounded-xl">
          <div className="text-4xl mb-4">⚠️</div>
          <h3 className="text-xl font-semibold text-slate-900">{t("errorTitle") || "Failed to load bounties"}</h3>
          <p className="text-slate-500 mt-2">{t("errorDesc") || "Please try again later."}</p>
          <button onClick={() => window.location.reload()} className="btn-primary mt-6 inline-block">{t("retry") || "Retry"}</button>
        </div>
      )}

      {/* Bounty cards */}
      {!loading && !error && <div className="space-y-4">
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
                  {"isPrivate" in bounty && (bounty as any).isPrivate && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium flex items-center gap-1">🔐 {t("privateBadge") || "Private"}</span>
                  )}
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
      </div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-xl">
          <div className="text-4xl mb-4">📭</div>
          <h3 className="text-xl font-semibold text-slate-900">{t("noResults")}</h3>
          <p className="text-slate-500 mt-2">{t("noResultsHint")}</p>
          <Link href="/bounties/create" className="btn-primary mt-6 inline-block">{t("createBounty")}</Link>
        </div>
      )}


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
