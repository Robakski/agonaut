"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { API_URL } from "@/lib/contracts";

/**
 * Private Bounty Problem Viewer — Agent-side decryption flow.
 *
 * Flow:
 * 1. Agent navigates to /bounties/{roundAddress}/problem
 * 2. Page checks if bounty is private via metadata endpoint
 * 3. If private: agent requests decryption key (backend verifies entry fee paid on-chain)
 * 4. Client-side decryption of problem + rubric
 * 5. Display decrypted content (never sent back to server)
 */

type ViewState =
  | { kind: "loading" }
  | { kind: "public"; data: any }
  | { kind: "private_locked" }
  | { kind: "requesting_key" }
  | { kind: "decrypting" }
  | { kind: "decrypted"; problem: string; rubric: any }
  | { kind: "error"; message: string };

export default function ProblemViewerPage() {
  const params = useParams();
  const roundAddress = params.id as string;
  const { address } = useAccount();
  const t = useTranslations("problemViewer");
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  // Load metadata on mount
  useEffect(() => {
    if (!roundAddress) return;
    fetch(`${API_URL}/private-bounties/metadata/${roundAddress}`)
      .then((r) => {
        if (r.status === 404) {
          // Not a private bounty — load from regular bounty API
          return fetch(`${API_URL}/bounties/?limit=1`).then((r2) => r2.json()).then(() => {
            setState({ kind: "public", data: null });
          });
        }
        return r.json().then((meta) => {
          if (meta.visibility === "PUBLIC") {
            setState({ kind: "public", data: meta });
          } else {
            setState({ kind: "private_locked" });
          }
        });
      })
      .catch(() => setState({ kind: "error", message: "Failed to load bounty metadata" }));
  }, [roundAddress]);

  const requestDecryption = async () => {
    if (!address) {
      setState({ kind: "error", message: t("connectWallet") || "Please connect your wallet first" });
      return;
    }

    setState({ kind: "requesting_key" });

    try {
      // Request decryption key — backend verifies entry fee paid on-chain
      const resp = await fetch(`${API_URL}/private-bounties/request-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          round_address: roundAddress,
          agent_address: address,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: "Request failed" }));
        setState({ kind: "error", message: err.detail || "Access denied" });
        return;
      }

      const { encrypted_problem, problem_key } = await resp.json();

      if (!encrypted_problem || !problem_key) {
        setState({ kind: "error", message: "Invalid response from server" });
        return;
      }

      // Client-side decryption — key never leaves the browser after this
      setState({ kind: "decrypting" });
      const { decryptProblem } = await import("@/lib/problem-encrypt");
      const plaintext = await decryptProblem(encrypted_problem, problem_key);

      // Parse the decrypted content (JSON with description + rubric)
      let parsed: any;
      try {
        parsed = JSON.parse(plaintext);
      } catch {
        // If not JSON, treat as plain description
        parsed = { description: plaintext };
      }

      setState({
        kind: "decrypted",
        problem: parsed.description || plaintext,
        rubric: parsed.rubric || null,
      });
    } catch (err: any) {
      setState({ kind: "error", message: err.message || "Decryption failed" });
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <Link href="/bounties" className="text-sm text-slate-500 hover:text-amber-700 mb-4 inline-block">
        ← {t("backToBounties") || "Back to Bounties"}
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        {t("title") || "Bounty Problem"}
      </h1>
      <p className="text-sm text-slate-500 mb-8 font-mono">{roundAddress}</p>

      {state.kind === "loading" && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <div className="animate-pulse text-slate-400">{t("loading") || "Loading..."}</div>
        </div>
      )}

      {state.kind === "public" && (
        <div className="bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🌐</span>
            <span className="text-sm font-medium text-slate-600">{t("publicBounty") || "Public Bounty"}</span>
          </div>
          <p className="text-slate-600">{t("publicDesc") || "This bounty's problem description is publicly available. Check the bounty detail page."}</p>
        </div>
      )}

      {state.kind === "private_locked" && (
        <div className="bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🔐</span>
            <span className="text-sm font-semibold text-blue-700">{t("privateBounty") || "Private Bounty — Encrypted"}</span>
          </div>
          <p className="text-slate-600 mb-6">
            {t("privateDesc") || "This bounty's problem description is encrypted. To view it, you must have paid the entry fee on-chain. Click below to request the decryption key — the backend will verify your on-chain payment."}
          </p>
          {!address ? (
            <p className="text-sm text-amber-700 font-medium">{t("connectFirst") || "Connect your wallet to request access."}</p>
          ) : (
            <button
              onClick={requestDecryption}
              className="px-6 py-3 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
            >
              🔓 {t("requestKey") || "Request Decryption Key"}
            </button>
          )}
        </div>
      )}

      {state.kind === "requesting_key" && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <div className="animate-pulse text-slate-500">{t("verifying") || "Verifying on-chain payment..."}</div>
        </div>
      )}

      {state.kind === "decrypting" && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <div className="animate-pulse text-slate-500">{t("decrypting") || "Decrypting in your browser..."}</div>
        </div>
      )}

      {state.kind === "decrypted" && (
        <div className="space-y-6">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-2">
            <span>✅</span>
            <span className="text-sm font-medium text-emerald-700">{t("decryptedSuccess") || "Problem decrypted successfully. This content is confidential."}</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">{t("problemDescription") || "Problem Description"}</h2>
            <div className="prose prose-slate max-w-none text-sm whitespace-pre-wrap">{state.problem}</div>
          </div>

          {state.rubric && (
            <div className="bg-white border border-slate-200 rounded-xl p-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">{t("scoringCriteria") || "Scoring Criteria"}</h2>
              {state.rubric.criteria?.map((criterion: any, i: number) => (
                <div key={i} className="mb-4">
                  <h3 className="font-medium text-slate-800 mb-2">{criterion.name}</h3>
                  <ul className="space-y-2">
                    {criterion.checks?.map((check: any, j: number) => (
                      <li key={j} className="flex items-start gap-3 text-sm">
                        <span className={`px-2 py-0.5 rounded text-xs font-mono ${check.required ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                          {check.weight / 100}%{check.required ? " ⛔" : ""}
                        </span>
                        <span className="text-slate-600">{check.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">
            ⚠️ {t("confidentialWarning") || "This problem content is confidential. Unauthorized sharing violates the Terms of Service."}
          </div>
        </div>
      )}

      {state.kind === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-8">
          <p className="text-red-700 font-medium mb-2">{t("error") || "Error"}</p>
          <p className="text-red-600 text-sm">{state.message}</p>
          <button
            onClick={() => setState({ kind: "private_locked" })}
            className="mt-4 text-sm text-slate-500 hover:text-slate-700 underline"
          >
            {t("tryAgain") || "Try again"}
          </button>
        </div>
      )}
    </div>
  );
}
