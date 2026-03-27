"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAccount } from "wagmi";
import { ConnectKitButton } from "connectkit";
import { useState, useEffect } from "react";
import { API_URL } from "@/lib/contracts";

/* ═══════════════════════════════════════════════════════════
 * Sponsor Dashboard
 *
 * Shows: created bounties, total spent, active/completed rounds,
 * solutions received, and quick actions.
 * ═══════════════════════════════════════════════════════════ */

const MOCK_STATS = {
  totalCreated: 0,
  totalSpent: "0.000",
  activeBounties: 0,
  solutionsReceived: 0,
};

interface BountyRow {
  id: number;
  title: string;
  prize: string;
  phase: string;
  agents: number;
  maxAgents: number;
  created: string;
  timeLeft: string;
}

const MOCK_BOUNTIES: BountyRow[] = [];

export default function SponsorDashboard() {
  const t = useTranslations("dashboardSponsor");
  const { address, isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-6">
          <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" /></svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{t("connectTitle")}</h1>
        <p className="text-slate-400 mb-6 text-center max-w-sm">{t("connectDesc")}</p>
        <ConnectKitButton />
      </div>
    );
  }

  // Fetch sponsor's bounties from API
  const [apiBounties, setApiBounties] = useState<BountyRow[]>([]);
  const [apiStats, setApiStats] = useState(MOCK_STATS);

  useEffect(() => {
    if (!address) return;
    fetch(`${API_URL}/bounties/?sponsor=${address}&limit=100`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: any[]) => {
        const mine = data;
        const rows: BountyRow[] = mine.map((b: any, i: number) => ({
          id: b.bounty_id || i,
          title: b.problem_title || b.title || `Bounty #${b.bounty_id || i}`,
          prize: `${b.total_bounty_eth || b.bounty_eth || 0} ETH`,
          phase: b.phase || "CREATED",
          agents: b.agents_entered || b.agent_count || 0,
          maxAgents: b.max_agents || 0,
          created: b.created_at || "—",
          timeLeft: b.phase === "COMMIT" ? "Active" : "—",
        }));
        setApiBounties(rows);

        const totalSpent = mine.reduce((sum: number, b: any) => sum + (b.total_bounty_eth || b.bounty_eth || 0), 0);
        const activeBounties = mine.filter((b: any) => ["FUNDED", "COMMIT", "SCORING"].includes(b.phase)).length;
        setApiStats({
          totalCreated: mine.length,
          totalSpent: totalSpent.toFixed(3),
          activeBounties,
          solutionsReceived: mine.filter((b: any) => b.phase === "SETTLED").length,
        });
      })
      .catch(() => {});
  }, [address]);

  const stats = apiStats;
  const bounties = apiBounties;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-400 font-mono mt-1">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
        </div>
        <Link
          href="/bounties/create"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {t("createBounty")}
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        <StatCard label={t("statCreated")} value={String(stats.totalCreated)} />
        <StatCard label={t("statSpent")} value={`${stats.totalSpent} ETH`} accent />
        <StatCard label={t("statActive")} value={String(stats.activeBounties)} />
        <StatCard label={t("statSolutions")} value={String(stats.solutionsReceived)} />
      </div>

      {/* My Bounties */}
      <section className="mb-10">
        <h2 className="text-sm font-bold text-slate-900 mb-4">{t("bountiesTitle")}</h2>
        {bounties.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
            </div>
            <p className="text-slate-400 text-sm mb-4">{t("bountiesEmpty")}</p>
            <Link href="/bounties/create" className="text-sm font-semibold text-amber-700 hover:text-amber-800">
              {t("bountiesCreate")} →
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-6 py-3">{t("colBounty")}</th>
                    <th className="text-center px-4 py-3">{t("colPhase")}</th>
                    <th className="text-center px-4 py-3">{t("colAgents")}</th>
                    <th className="text-right px-4 py-3">{t("colPrize")}</th>
                    <th className="text-right px-6 py-3">{t("colTime")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {bounties.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer">
                      <td className="px-6 py-3.5">
                        <div className="font-medium text-slate-900">{b.title}</div>
                        <div className="text-xs text-slate-400">Created {b.created}</div>
                      </td>
                      <td className="text-center px-4 py-3.5">
                        <PhaseTag phase={b.phase} />
                      </td>
                      <td className="text-center px-4 py-3.5">
                        <span className="text-slate-700 font-medium">{b.agents}</span>
                        <span className="text-slate-400">/{b.maxAgents}</span>
                      </td>
                      <td className="text-right px-4 py-3.5 font-semibold text-slate-900">{b.prize}</td>
                      <td className="text-right px-6 py-3.5 text-slate-400">{b.timeLeft}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section>
        <h2 className="text-sm font-bold text-slate-900 mb-4">{t("quickActions")}</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction
            href="/bounties/create"
            icon="+"
            title={t("actionCreate")}
            desc={t("actionCreateDesc")}
          />
          <QuickAction
            href="/bounties"
            icon="📋"
            title={t("actionBrowse")}
            desc={t("actionBrowseDesc")}
          />
          <QuickAction
            href="/docs/sponsor-guide"
            icon="📖"
            title={t("actionGuide")}
            desc={t("actionGuideDesc")}
          />
          <QuickAction
            href="/docs/scoring"
            icon="⚖️"
            title={t("actionScoring")}
            desc={t("actionScoringDesc")}
          />
        </div>
      </section>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────── */

function StatCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{label}</div>
      <div className={`text-sm font-bold mt-0.5 ${accent ? "text-amber-700" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function PhaseTag({ phase }: { phase: string }) {
  const colors: Record<string, string> = {
    Open: "bg-emerald-50 text-emerald-700 border-emerald-100",
    Commit: "bg-amber-50 text-amber-700 border-amber-100",
    Scoring: "bg-blue-50 text-blue-700 border-blue-100",
    Settled: "bg-slate-100 text-slate-500 border-slate-200",
    "Pending Deposit": "bg-yellow-50 text-yellow-700 border-yellow-100",
  };
  return <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${colors[phase] || colors.Open}`}>{phase}</span>;
}

function QuickAction({ href, icon, title, desc }: { href: string; icon: string; title: string; desc: string }) {
  return (
    <Link href={href} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all group flex items-center gap-3">
      <span className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 group-hover:bg-slate-900 group-hover:text-white transition-all flex-shrink-0">
        {icon}
      </span>
      <div>
        <div className="text-sm font-bold text-slate-900">{title}</div>
        <div className="text-[11px] text-slate-400">{desc}</div>
      </div>
    </Link>
  );
}
