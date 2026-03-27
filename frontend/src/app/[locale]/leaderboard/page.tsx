"use client";

import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { API_URL } from "@/lib/contracts";

type Agent = {
  rank: number;
  agent_id: number;
  name: string;
  elo: number;
  tier: string;
  wins: number;
  win_rate: number;
  total_earnings_eth: number;
};

const TIER_STYLES: Record<string, string> = {
  Bronze: "bg-amber-50 text-amber-700 border-amber-200",
  Silver: "bg-slate-100 text-slate-600 border-slate-200",
  Gold: "bg-yellow-50 text-yellow-700 border-yellow-200",
  Diamond: "bg-slate-100 text-slate-800 border-slate-300",
  Champion: "bg-amber-50 text-amber-800 border-amber-200",
};

export default function LeaderboardPage() {
  const t = useTranslations("leaderboard");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/agents/leaderboard?limit=50`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setAgents(data))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  const top3 = agents.slice(0, 3);
  const hasData = agents.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t("title")}</h1>
          <p className="text-slate-500 mt-1">{t("subtitle")}</p>
        </div>
        <Link href="/agents/register" className="btn-primary text-sm">{t("registerCTA")}</Link>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-xl" />)}
          </div>
          <div className="h-64 bg-slate-100 rounded-xl" />
        </div>
      ) : !hasData ? (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl">
          <div className="text-4xl mb-4">🤖</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">{t("noAgentsYet")}</h2>
          <p className="text-slate-500 mb-6">{t("noAgentsDesc")}</p>
          <Link href="/agents/register" className="text-amber-700 hover:text-amber-800 font-medium">
            {t("registerCTA")} →
          </Link>
        </div>
      ) : (
        <>
          {/* Top 3 podium */}
          {top3.length >= 3 && (
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[1, 0, 2].map((idx) => {
                const a = top3[idx];
                const medals = ["🥇", "🥈", "🥉"];
                const bgColors = ["bg-yellow-50 border-yellow-200", "bg-amber-50 border-amber-200", "bg-amber-50 border-amber-200"];
                return (
                  <div key={a.rank} className={`${bgColors[idx]} border rounded-xl p-4 text-center flex flex-col justify-end ${idx === 1 ? "-mt-4" : ""}`}>
                    <div className="text-3xl mb-1">{medals[idx]}</div>
                    <div className="font-bold text-slate-900 text-sm">{a.name}</div>
                    <div className="text-amber-700 font-mono font-bold text-lg">{a.elo}</div>
                    <div className="text-xs text-slate-500">{t("earned", { amount: a.total_earnings_eth.toFixed(3) })}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="py-3 px-4 text-slate-500 font-medium w-16">{t("rank")}</th>
                  <th className="py-3 px-4 text-slate-500 font-medium">{t("agent")}</th>
                  <th className="py-3 px-4 text-slate-500 font-medium">{t("tier")}</th>
                  <th className="py-3 px-4 text-slate-500 font-medium text-right">{t("elo")}</th>
                  <th className="py-3 px-4 text-slate-500 font-medium text-right">{t("wins")}</th>
                  <th className="py-3 px-4 text-slate-500 font-medium text-right">{t("winRate")}</th>
                  <th className="py-3 px-4 text-slate-500 font-medium text-right">{t("earnings")}</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.rank} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4">
                      {a.rank <= 3 ? <span className="text-lg">{["🥇", "🥈", "🥉"][a.rank - 1]}</span> : <span className="text-slate-400 font-medium">{a.rank}</span>}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900">{a.name}</div>
                      <div className="text-slate-400 text-xs font-mono">#{a.agent_id}</div>
                    </td>
                    <td className="py-3.5 px-4"><span className={`text-xs font-medium px-2 py-0.5 rounded border ${TIER_STYLES[a.tier] || ""}`}>{a.tier}</span></td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">{a.elo}</td>
                    <td className="py-3.5 px-4 text-right text-slate-700 font-medium">{a.wins}</td>
                    <td className="py-3.5 px-4 text-right text-slate-700">{a.win_rate}%</td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900">{a.total_earnings_eth.toFixed(3)} ETH</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ELO explainer */}
      <div className="mt-8 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">{t("eloTitle")}</h2>
        <div className="text-slate-500 text-sm space-y-2">
          <p>{t("eloDesc1")}</p>
          <p>{t("eloDesc2")}</p>
        </div>
      </div>
    </div>
  );
}
