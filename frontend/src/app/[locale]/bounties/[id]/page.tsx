"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { API_URL, ENTRY_FEE, BASESCAN_URL } from "@/lib/contracts";

type BountyDetail = {
  bounty_id: number;
  problem_title?: string;
  title?: string;
  description?: string;
  sponsor?: string;
  total_bounty_eth?: number;
  bounty_eth?: number;
  phase?: string;
  max_agents?: number;
  agents_entered?: number;
  agent_count?: number;
  commit_hours?: number;
  threshold?: number;
  graduated?: boolean;
  round_address?: string;
  problem_cid?: string;
  tags?: string[];
  is_private?: boolean;
  privacy_notice?: string;
  rubric?: { criteria: Array<{ name: string; checks: Array<{ description: string; weight: number; required: boolean }> }> };
};

type PageState =
  | { kind: "loading" }
  | { kind: "loaded"; bounty: BountyDetail }
  | { kind: "error"; message: string };

export default function BountyDetailPage() {
  const params = useParams();
  const bountyId = params.id as string;
  const { address } = useAccount();
  const t = useTranslations("bountyDetail");
  const [state, setState] = useState<PageState>({ kind: "loading" });

  useEffect(() => {
    if (!bountyId) return;

    // Try numeric bounty ID first, then treat as round address
    const endpoint = bountyId.startsWith("0x")
      ? `${API_URL}/bounties/?limit=100` // Will filter client-side
      : `${API_URL}/bounties/${bountyId}`;

    fetch(endpoint)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          // Find by round address
          const match = data.find((b: any) => b.round_address?.toLowerCase() === bountyId.toLowerCase());
          if (match) setState({ kind: "loaded", bounty: match });
          else setState({ kind: "error", message: "Bounty not found" });
        } else {
          setState({ kind: "loaded", bounty: data });
        }
      })
      .catch(() => setState({ kind: "error", message: "Failed to load bounty" }));
  }, [bountyId]);

  if (state.kind === "loading") {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-2/3" />
          <div className="h-4 bg-slate-100 rounded w-1/3" />
          <div className="h-48 bg-slate-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center bg-white border border-slate-200 rounded-2xl p-12">
          <div className="text-4xl mb-4">📭</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">{t("notFound")}</h2>
          <p className="text-slate-500 mb-6">{state.message}</p>
          <Link href="/bounties" className="text-sm text-amber-700 hover:text-amber-800 font-medium">
            ← {t("backToBounties")}
          </Link>
        </div>
      </div>
    );
  }

  const b = state.bounty;
  const title = b.problem_title || b.title || "Untitled Bounty";
  const eth = b.total_bounty_eth || b.bounty_eth || 0;
  const agents = b.agents_entered || b.agent_count || 0;
  const maxAgents = b.max_agents || 0;
  const sponsor = b.sponsor || "";
  const phase = b.phase || "CREATED";
  const roundAddr = b.round_address || "";
  const isPrivate = b.is_private || false;
  const isSponsor = address && sponsor && address.toLowerCase() === sponsor.toLowerCase();

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <Link href="/bounties" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
        ← {t("backToBounties")}
      </Link>

      {/* Header */}
      <div className="mt-4 mb-8">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <PhaseTag phase={phase} />
          {isPrivate && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium flex items-center gap-1">
              🔐 {t("private")}
            </span>
          )}
          {b.tags?.map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{tag}</span>
          ))}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-400 mt-1">
          {t("by")} <span className="font-mono">{sponsor ? `${sponsor.slice(0, 8)}...${sponsor.slice(-6)}` : "Unknown"}</span>
          {roundAddr && (
            <>
              {" · "}
              <a href={`${BASESCAN_URL}/address/${roundAddr}`} target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:text-amber-800">
                {t("viewOnChain")} ↗
              </a>
            </>
          )}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label={t("prize")} value={`${eth} ETH`} />
        <StatCard label={t("entryFee")} value={`${ENTRY_FEE} ETH`} />
        <StatCard label={t("agents")} value={maxAgents > 0 ? `${agents}/${maxAgents}` : `${agents}`} />
        <StatCard label={t("commitWindow")} value={b.commit_hours ? `${b.commit_hours}h` : "—"} />
      </div>

      {/* Description */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">{t("description")}</h2>
        {isPrivate ? (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-lg p-4">
            <span className="text-lg">🔐</span>
            <div>
              <p className="text-sm font-medium text-blue-800">{t("privateDesc")}</p>
              <p className="text-xs text-blue-600 mt-1">{b.privacy_notice || t("payToAccess")}</p>
              {roundAddr && (
                <Link
                  href={`/bounties/${roundAddr}/problem`}
                  className="inline-block mt-3 text-sm font-medium text-blue-700 hover:text-blue-800 underline"
                >
                  🔓 {t("viewProblem")}
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="prose prose-slate max-w-none text-sm whitespace-pre-wrap">
            {b.description || t("noDescription")}
          </div>
        )}
      </div>

      {/* Rubric (public bounties only) */}
      {!isPrivate && b.rubric?.criteria && b.rubric.criteria.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">{t("scoringCriteria")}</h2>
          {b.rubric.criteria.map((criterion, i) => (
            <div key={i} className="mb-4">
              <h3 className="font-medium text-slate-800 mb-2">{criterion.name}</h3>
              <ul className="space-y-2">
                {criterion.checks?.map((check, j) => (
                  <li key={j} className="flex items-start gap-3 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-mono ${check.required ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                      {(check.weight / 100).toFixed(0)}%{check.required ? " ⛔" : ""}
                    </span>
                    <span className="text-slate-600">{check.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mb-8">
        {/* Agent actions */}
        {phase === "COMMIT" && roundAddr && (
          <Link
            href={isPrivate ? `/bounties/${roundAddr}/problem` : "#"}
            className="px-6 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors"
          >
            🤖 {t("enterRound")}
          </Link>
        )}

        {/* Sponsor actions */}
        {isSponsor && roundAddr && (
          <Link
            href={`/bounties/${roundAddr}/solution`}
            className="px-6 py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 transition-colors"
          >
            📄 {t("viewSolutions")}
          </Link>
        )}

        {/* Problem viewer for agents on private bounties */}
        {isPrivate && roundAddr && !isSponsor && (
          <Link
            href={`/bounties/${roundAddr}/problem`}
            className="px-6 py-3 border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors"
          >
            🔓 {t("viewProblem")}
          </Link>
        )}
      </div>

      {/* Settings */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
        <h3 className="font-semibold text-slate-700 mb-2">{t("settings")}</h3>
        <ul className="space-y-1">
          <li>{t("threshold")}: {b.threshold ? `${(b.threshold / 100).toFixed(0)}%` : "70%"}</li>
          <li>{t("graduated")}: {b.graduated !== false ? "✅" : "❌"}</li>
          <li>{t("protocolFee")}: {isPrivate ? "2.5%" : "2%"}</li>
          {roundAddr && <li>{t("roundAddress")}: <span className="font-mono text-xs">{roundAddr}</span></li>}
        </ul>
      </div>
    </div>
  );
}

function PhaseTag({ phase }: { phase: string }) {
  const styles: Record<string, string> = {
    OPEN: "bg-amber-50 text-amber-700 border-amber-200",
    FUNDED: "bg-amber-50 text-amber-800 border-amber-200",
    CREATED: "bg-slate-100 text-slate-600 border-slate-200",
    COMMIT: "bg-slate-100 text-slate-700 border-slate-200",
    SCORING: "bg-slate-100 text-slate-800 border-slate-300",
    SETTLED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    CANCELLED: "bg-slate-50 text-slate-400 border-slate-200",
  };
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${styles[phase] || "bg-slate-100 text-slate-500 border-slate-200"}`}>{phase}</span>;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-1">{value}</p>
    </div>
  );
}
