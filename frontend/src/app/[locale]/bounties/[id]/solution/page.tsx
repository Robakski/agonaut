"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAccount, useWalletClient } from "wagmi";
import { ConnectKitButton } from "connectkit";
import { useTranslations } from "next-intl";
import { API_URL } from "@/lib/contracts";
import { Link } from "@/i18n/navigation";
import type { EncryptedSolution } from "@/lib/ecies";

type ViewState =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "fetching" }
  | { kind: "decrypting" }
  | { kind: "success"; solutions: DecryptedSolution[] }
  | { kind: "error"; message: string };

interface DecryptedSolution {
  agent_address: string;
  agent_id: number;
  score: number;
  solution: string;
}

export default function SolutionViewerPage() {
  const t = useTranslations("solutionViewer");
  const params = useParams();
  const roundAddress = params.id as string;
  const { isConnected, address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [state, setState] = useState<ViewState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  const handleDecrypt = useCallback(async () => {
    if (!address || !walletClient) return;

    try {
      setState({ kind: "signing" });
      const timestamp = Math.floor(Date.now() / 1000);
      const message = `Agonaut Solution Access\nRound: ${roundAddress}\nTimestamp: ${timestamp}`;
      const signature = await walletClient.signMessage({ account: address, message });

      setState({ kind: "fetching" });
      const res = await fetch(`${API_URL}/solutions/sponsor-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round_address: roundAddress, sponsor_address: address, signature, message }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Request failed" }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const encryptedSolutions = data.solutions as Array<{
        agent_address: string; agent_id: number; score: number;
        encrypted_solution: EncryptedSolution;
      }>;

      setState({ kind: "decrypting" });
      const { decryptSolution } = await import("@/lib/ecies");

      const decrypted: DecryptedSolution[] = [];
      for (const sol of encryptedSolutions) {
        try {
          const plaintext = await decryptSolution(sol.encrypted_solution, walletClient, address);
          decrypted.push({ agent_address: sol.agent_address, agent_id: sol.agent_id, score: sol.score, solution: plaintext });
        } catch {
          decrypted.push({ agent_address: sol.agent_address, agent_id: sol.agent_id, score: sol.score, solution: "[Decryption failed]" });
        }
      }

      setState({ kind: "success", solutions: decrypted });
    } catch (err: unknown) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Failed to access solutions" });
    }
  }, [address, walletClient, roundAddress]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-6"><span className="text-3xl">🔐</span></div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">{t("connectTitle")}</h3>
          <p className="text-slate-500 mb-6">{t("connectDesc")}</p>
          <ConnectKitButton />
        </div>
      </div>
    );
  }

  if (state.kind === "success") {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <Link href="/dashboard/sponsor" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">← {t("backToDashboard")}</Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-4">{t("title")}</h1>
          <p className="text-sm text-slate-500 mt-1 font-mono">{roundAddress.slice(0, 10)}...{roundAddress.slice(-8)}</p>
        </div>
        <div className="space-y-6">
          {state.solutions.map((sol, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-sm font-bold text-amber-700">#{i + 1}</div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{t("agentLabel")} {sol.agent_id}</p>
                    <p className="text-xs text-slate-400 font-mono">{sol.agent_address.slice(0, 8)}...{sol.agent_address.slice(-6)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-lg">{t("scoreLabel")}: {sol.score} BPS</span>
                  <button onClick={() => copyToClipboard(sol.solution)} className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all">
                    {copied ? "✓ Copied" : t("copyButton")}
                  </button>
                </div>
              </div>
              <div className="p-6">
                <pre className="text-sm text-slate-700 whitespace-pre-wrap break-words font-mono bg-slate-50 rounded-xl p-4 max-h-[600px] overflow-y-auto">{sol.solution}</pre>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-8 text-center">{t("privacyNote")}</p>
      </div>
    );
  }

  const isLoading = state.kind === "signing" || state.kind === "fetching" || state.kind === "decrypting";

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-20">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-8 text-center">
          <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-6"><span className="text-4xl">🔐</span></div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{t("title")}</h1>
          <p className="text-slate-500 text-sm mb-2">{t("desc")}</p>
          <p className="text-xs text-slate-400 font-mono mb-8">{roundAddress}</p>
          <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left">
            <h3 className="text-xs font-bold text-slate-900 mb-2">{t("securityTitle")}</h3>
            <div className="space-y-2">
              {[t("security1"), t("security2"), t("security3")].map((text, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5">✓</span>
                  <p className="text-xs text-slate-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
          {state.kind === "error" && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-6">
              <p className="text-xs text-red-700">{state.message}</p>
            </div>
          )}
          <button onClick={handleDecrypt} disabled={isLoading} className="w-full py-3.5 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-all">
            {state.kind === "signing" ? t("stateSigning") : state.kind === "fetching" ? t("stateFetching") : state.kind === "decrypting" ? t("stateDecrypting") : t("decryptButton")}
          </button>
          <p className="text-xs text-slate-400 mt-4">{t("walletNote")}</p>
        </div>
      </div>
    </div>
  );
}
