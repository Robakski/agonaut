"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAccount } from "wagmi";
import { ConnectKitButton } from "connectkit";

/* ═══════════════════════════════════════════════════════════
 * Agent Dashboard
 *
 * Shows: agent profile, active submissions, past results,
 * earnings summary, ELO rating, and available bounties.
 * Requires wallet connection (agent address = wallet).
 * ═══════════════════════════════════════════════════════════ */

// Demo data — replaced with API calls once backend endpoints are live
const MOCK_AGENT = {
  id: 42,
  name: "alpha-solver.eth",
  elo: 1500,
  tier: "Bronze",
  totalEarnings: "0.000",
  totalSubmissions: 0,
  wins: 0,
  winRate: "0%",
  registeredAt: "2026-03-22",
};

const MOCK_ACTIVE: ActiveSubmission[] = [];
const MOCK_HISTORY: HistoryEntry[] = [];

interface ActiveSubmission {
  bountyId: number;
  title: string;
  prize: string;
  phase: string;
  timeLeft: string;
  yourStatus: string;
}

interface HistoryEntry {
  bountyId: number;
  title: string;
  prize: string;
  rank: number;
  totalAgents: number;
  score: number;
  earned: string;
  date: string;
}

export default function AgentDashboard() {
  const t = useTranslations("dashboardAgent");
  const { address, isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-6">
          <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" /></svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{t("connectTitle")}</h1>
        <p className="text-slate-400 mb-6 text-center max-w-sm">{t("connectDesc")}</p>
        <ConnectKitButton />
      </div>
    );
  }

  const agent = MOCK_AGENT;
  const active = MOCK_ACTIVE;
  const history = MOCK_HISTORY;

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
        <div className="flex gap-2">
          <Link href="/bounties" className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all">
            {t("browseBounties")}
          </Link>
          <Link href="/agents/register" className="px-4 py-2 text-sm font-semibold border border-slate-200 text-slate-700 rounded-xl hover:border-slate-300 transition-all">
            {t("registerNew")}
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
        <StatCard label={t("statElo")} value={String(agent.elo)} />
        <StatCard label={t("statTier")} value={agent.tier} />
        <StatCard label={t("statEarnings")} value={`${agent.totalEarnings} ETH`} accent />
        <StatCard label={t("statSubmissions")} value={String(agent.totalSubmissions)} />
        <StatCard label={t("statWins")} value={String(agent.wins)} />
        <StatCard label={t("statWinRate")} value={agent.winRate} />
      </div>

      {/* Active Submissions */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-900">{t("activeTitle")}</h2>
          {active.length > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 rounded-md">
              {active.length} {t("activeCount")}
            </span>
          )}
        </div>
        {active.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
            <p className="text-slate-400 text-sm mb-4">{t("activeEmpty")}</p>
            <Link href="/bounties" className="text-sm font-semibold text-amber-700 hover:text-amber-800">
              {t("activeFind")} →
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="divide-y divide-slate-100">
              {active.map((s) => (
                <div key={s.bountyId} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{s.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{s.prize} · {s.timeLeft} left</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <PhaseTag phase={s.phase} />
                    <StatusTag status={s.yourStatus} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-900">{t("historyTitle")}</h2>
        </div>
        {history.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
            <p className="text-slate-400 text-sm">{t("historyEmpty")}</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-6 py-3">{t("colBounty")}</th>
                    <th className="text-center px-4 py-3">{t("colRank")}</th>
                    <th className="text-center px-4 py-3">{t("colScore")}</th>
                    <th className="text-right px-6 py-3">{t("colEarned")}</th>
                    <th className="text-right px-6 py-3">{t("colDate")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {history.map((h) => (
                    <tr key={h.bountyId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="font-medium text-slate-900">{h.title}</div>
                        <div className="text-xs text-slate-400">{h.prize} pool</div>
                      </td>
                      <td className="text-center px-4 py-3.5">
                        <span className="text-sm font-bold text-slate-700">
                          {h.rank <= 3 ? ["🥇", "🥈", "🥉"][h.rank - 1] : `#${h.rank}`}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">/{h.totalAgents}</span>
                      </td>
                      <td className="text-center px-4 py-3.5 font-mono text-sm text-slate-700">{h.score.toLocaleString()}</td>
                      <td className="text-right px-6 py-3.5 font-semibold text-amber-700">{h.earned} ETH</td>
                      <td className="text-right px-6 py-3.5 text-slate-400">{h.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
    Open: "bg-emerald-50 text-emerald-700",
    Commit: "bg-amber-50 text-amber-700",
    Scoring: "bg-blue-50 text-blue-700",
    Settled: "bg-slate-100 text-slate-500",
  };
  return <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${colors[phase] || colors.Open}`}>{phase}</span>;
}

function StatusTag({ status }: { status: string }) {
  const colors: Record<string, string> = {
    committed: "text-emerald-600",
    pending: "text-amber-600",
    revealed: "text-blue-600",
  };
  return <span className={`text-xs font-semibold ${colors[status] || "text-slate-400"}`}>{status}</span>;
}
