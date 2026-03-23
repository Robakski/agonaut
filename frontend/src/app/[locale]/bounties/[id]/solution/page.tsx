"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectKitButton } from "connectkit";
import { Link } from "@/i18n/navigation";
import { API_URL } from "@/lib/contracts";
import { useParams } from "next/navigation";

/* ─── Types ─── */
interface WinningSolution {
  agent_address: string;
  agent_id: number;
  score: number;
  solution: string;
  stored_at: number;
  expires_at: number;
}

export default function SolutionViewerPage() {
  const t = useTranslations("solutionViewer");
  const { isConnected, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const params = useParams();
  const roundAddress = params.id as string;

  const [solutions, setSolutions] = useState<WinningSolution[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestAccess = useCallback(async () => {
    if (!address || !roundAddress) return;
    setLoading(true);
    setError(null);

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const message = `Agonaut Solution Access\nRound: ${roundAddress}\nTimestamp: ${timestamp}`;

      // Sign with wallet
      const signature = await signMessageAsync({ message });

      // Request solutions from backend
      const res = await fetch(`${API_URL}/solutions/sponsor-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          round_address: roundAddress,
          sponsor_address: address,
          signature,
          message,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Access denied");
      }

      const data = await res.json();
      setSolutions(data.solutions);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to retrieve solutions";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [address, roundAddress, signMessageAsync]);

  /* ─── Not connected ─── */
  if (!isConnected) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">🔐</span>
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">{t("connectTitle")}</h3>
          <p className="text-slate-500 mb-6">{t("connectDesc")}</p>
          <ConnectKitButton />
        </div>
      </div>
    );
  }

  /* ─── Solutions loaded ─── */
  if (solutions) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {t("roundLabel")}: <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">{roundAddress}</code>
            </p>
          </div>
          <Link href="/dashboard/sponsor" className="text-sm text-slate-500 hover:text-slate-700">
            ← {t("backToDashboard")}
          </Link>
        </div>

        <div className="space-y-6">
          {solutions.map((sol, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-sm font-bold text-amber-700">
                    #{i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {t("agentLabel")}: <code className="text-xs">{sol.agent_address.slice(0, 6)}...{sol.agent_address.slice(-4)}</code>
                    </p>
                    <p className="text-xs text-slate-400">
                      {t("scoreLabel")}: {sol.score} BPS ({(sol.score / 100).toFixed(1)}%)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(sol.solution);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-all"
                >
                  {t("copySolution")}
                </button>
              </div>

              {/* Solution content */}
              <div className="p-6">
                <pre className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm text-slate-800 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-[600px] overflow-y-auto">
                  {sol.solution}
                </pre>
              </div>

              {/* Footer */}
              <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>{t("storedAt")}: {new Date(sol.stored_at * 1000).toLocaleString()}</span>
                <span>{t("expiresAt")}: {new Date(sol.expires_at * 1000).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Security note */}
        <div className="mt-8 text-center">
          <p className="text-xs text-slate-400 max-w-lg mx-auto">
            {t("securityNote")}
          </p>
        </div>
      </div>
    );
  }

  /* ─── Request access state ─── */
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-20">
      <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-slate-900 mb-2">{t("accessTitle")}</h3>
        <p className="text-slate-500 mb-2 max-w-md mx-auto">{t("accessDesc")}</p>
        <p className="text-xs text-slate-400 mb-6">{t("accessNote")}</p>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2 mb-4 max-w-sm mx-auto">
            {error}
          </div>
        )}

        <button
          onClick={requestAccess}
          disabled={loading}
          className="px-8 py-3 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-40 transition-all"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t("verifying")}
            </span>
          ) : (
            t("signToAccess")
          )}
        </button>
      </div>
    </div>
  );
}
