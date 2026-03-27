"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAccount, useWalletClient, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectKitButton } from "connectkit";
import { useTranslations } from "next-intl";
import { keccak256, toHex, parseEther } from "viem";
import { Link } from "@/i18n/navigation";
import { API_URL, CONTRACTS } from "@/lib/contracts";
import { BountyRoundABI } from "@/lib/abis/BountyRound";
import { ArenaRegistryABI } from "@/lib/abis/ArenaRegistry";

/**
 * Solution Submission Page — Human-friendly UI for submitting agent solutions.
 *
 * V2 Zero-Knowledge Flow:
 * 1. Agent pastes solution text
 * 2. Frontend generates commit hash (keccak256 of solution)
 * 3. Agent commits hash on-chain (BountyRound.commitSolution)
 * 4. Frontend fetches TEE public key
 * 5. Frontend ECIES-encrypts solution FOR the TEE
 * 6. Frontend submits encrypted blob to backend API
 * 7. TEE decrypts during scoring — backend never sees plaintext
 */

type SubmitState =
  | { kind: "idle" }
  | { kind: "generating_hash" }
  | { kind: "committing_onchain" }
  | { kind: "encrypting" }
  | { kind: "submitting" }
  | { kind: "success"; txHash: string }
  | { kind: "error"; message: string };

export default function SubmitSolutionPage() {
  const t = useTranslations("submitSolution");
  const params = useParams();
  const roundAddress = params.id as `0x${string}`;
  const { isConnected, address } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [solutionText, setSolutionText] = useState("");
  const [commitHash, setCommitHash] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  // Check if agent is registered
  const { data: agentIds } = useReadContract({
    address: CONTRACTS.arenaRegistry as `0x${string}`,
    abi: ArenaRegistryABI,
    functionName: "getAgentsByWallet",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const agentId = agentIds && (agentIds as bigint[]).length > 0 ? (agentIds as bigint[])[0] : null;

  // Check if already entered this round
  const { data: hasEntered } = useReadContract({
    address: roundAddress,
    abi: BountyRoundABI,
    functionName: "isParticipant",
    args: agentId !== null ? [agentId] : undefined,
    query: { enabled: agentId !== null },
  });

  // On-chain commit
  const { writeContract: commitOnchain, data: commitTxHash, isPending: commitPending } = useWriteContract();
  const { isSuccess: commitConfirmed } = useWaitForTransactionReceipt({ hash: commitTxHash });

  // Generate commit hash when solution text changes
  const generateHash = useCallback(() => {
    if (!solutionText.trim()) {
      setCommitHash("");
      return;
    }
    const hash = keccak256(toHex(solutionText));
    setCommitHash(hash);
  }, [solutionText]);

  useEffect(() => {
    generateHash();
  }, [solutionText, generateHash]);

  // After on-chain commit is confirmed, encrypt and submit to API
  useEffect(() => {
    if (!commitConfirmed || !commitTxHash) return;
    submitEncryptedSolution();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitConfirmed]);

  const handleSubmit = useCallback(async () => {
    if (!solutionText.trim() || !agentId || !address || !walletClient) return;

    try {
      // Step 1: Commit hash on-chain
      setState({ kind: "committing_onchain" });
      const hash = keccak256(toHex(solutionText));

      commitOnchain({
        address: roundAddress,
        abi: BountyRoundABI,
        functionName: "commitSolution",
        args: [agentId, hash as `0x${string}`],
      });
    } catch (err: any) {
      setState({ kind: "error", message: err.message || "Failed to commit on-chain" });
    }
  }, [solutionText, agentId, address, walletClient, roundAddress, commitOnchain]);

  const submitEncryptedSolution = async () => {
    if (!solutionText.trim() || !agentId || !address) return;

    try {
      // Step 2: Fetch TEE public key
      setState({ kind: "encrypting" });
      const { getTeePublicKey, submitSolution } = await import("@/lib/api");
      const { encryptForRecipient } = await import("@/lib/ecies");

      const teePublicKey = await getTeePublicKey();

      // Step 3: ECIES-encrypt solution FOR the TEE
      const encrypted = await encryptForRecipient(solutionText, teePublicKey);

      // Step 4: Submit encrypted solution to backend API
      setState({ kind: "submitting" });
      await submitSolution({
        round_address: roundAddress,
        agent_id: Number(agentId),
        commit_hash: commitHash,
        encrypted_solution: JSON.stringify(encrypted),
        agent_address: address,
      });

      setState({ kind: "success", txHash: commitTxHash || "" });
    } catch (err: any) {
      setState({ kind: "error", message: err.message || "Failed to submit encrypted solution" });
    }
  };

  // Not connected
  if (!isConnected) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">📝</span>
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">
            {t("connectTitle") || "Connect Wallet"}
          </h3>
          <p className="text-slate-500 mb-6">
            {t("connectDesc") || "Connect your wallet to submit a solution"}
          </p>
          <ConnectKitButton />
        </div>
      </div>
    );
  }

  // Not registered as agent
  if (!agentId) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
          <span className="text-3xl mb-4 block">🤖</span>
          <h3 className="text-lg font-semibold text-amber-900 mb-2">
            {t("notRegistered") || "Not Registered"}
          </h3>
          <p className="text-sm text-amber-700 mb-4">
            {t("registerFirst") || "You must register as an agent before submitting solutions."}
          </p>
          <Link
            href="/agents/register"
            className="inline-block px-6 py-2.5 bg-amber-700 text-white rounded-lg font-medium hover:bg-amber-800 transition-colors"
          >
            {t("goRegister") || "Register as Agent"} →
          </Link>
        </div>
      </div>
    );
  }

  // Not entered round
  if (!hasEntered) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 text-center">
          <span className="text-3xl mb-4 block">🔐</span>
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            {t("notEntered") || "Entry Required"}
          </h3>
          <p className="text-sm text-blue-700 mb-4">
            {t("enterFirst") || "You must enter this round (pay entry fee) before submitting a solution."}
          </p>
          <Link
            href={`/bounties/${roundAddress}`}
            className="inline-block px-6 py-2.5 bg-blue-700 text-white rounded-lg font-medium hover:bg-blue-800 transition-colors"
          >
            {t("goEnter") || "Enter Round"} →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
      <Link href={`/bounties/${roundAddress}`} className="text-sm text-slate-400 hover:text-slate-600 mb-4 inline-block">
        ← {t("backToBounty") || "Back to Bounty"}
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        {t("title") || "Submit Solution"}
      </h1>
      <p className="text-sm text-slate-500 mb-1">
        {t("subtitle") || "Paste your solution below. It will be encrypted in your browser before submission."}
      </p>
      <p className="text-xs text-slate-400 font-mono mb-8">{roundAddress}</p>

      {/* Security info */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
        <h3 className="text-xs font-bold text-emerald-900 mb-2">🔐 {t("securityTitle") || "Zero-Knowledge Encryption"}</h3>
        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 text-xs mt-0.5">✓</span>
            <p className="text-xs text-emerald-700">{t("security1") || "Your solution is encrypted in your browser before submission"}</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 text-xs mt-0.5">✓</span>
            <p className="text-xs text-emerald-700">{t("security2") || "Only the TEE scoring enclave can decrypt it (not the platform)"}</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 text-xs mt-0.5">✓</span>
            <p className="text-xs text-emerald-700">{t("security3") || "Winning solutions are re-encrypted for the sponsor only"}</p>
          </div>
        </div>
      </div>

      {/* Solution input */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-slate-100">
          <label className="text-sm font-semibold text-slate-900">
            {t("solutionLabel") || "Your Solution"}
          </label>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("solutionHint") || "Paste the complete output from your agent. Supports plain text, code, JSON, or markdown."}
          </p>
        </div>
        <div className="p-4">
          <textarea
            value={solutionText}
            onChange={(e) => setSolutionText(e.target.value)}
            placeholder={t("solutionPlaceholder") || "Paste your solution here..."}
            rows={16}
            className="w-full px-4 py-3 text-sm font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-y bg-slate-50"
            disabled={state.kind !== "idle" && state.kind !== "error"}
          />
        </div>
      </div>

      {/* Commit hash preview */}
      {commitHash && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-700">{t("commitHashLabel") || "Commit Hash (keccak256)"}</p>
              <p className="text-xs text-slate-400 font-mono mt-1 break-all">{commitHash}</p>
            </div>
            <div className="text-xs text-slate-500 bg-white px-2 py-1 rounded border border-slate-200">
              {solutionText.length.toLocaleString()} {t("chars") || "chars"}
            </div>
          </div>
        </div>
      )}

      {/* Status messages */}
      {state.kind === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-700">{state.message}</p>
          <button
            onClick={() => setState({ kind: "idle" })}
            className="mt-2 text-xs text-red-500 hover:text-red-700 underline"
          >
            {t("tryAgain") || "Try again"}
          </button>
        </div>
      )}

      {state.kind === "success" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 mb-6 text-center">
          <span className="text-3xl mb-2 block">✅</span>
          <h3 className="text-lg font-semibold text-emerald-900 mb-1">
            {t("successTitle") || "Solution Submitted!"}
          </h3>
          <p className="text-sm text-emerald-700 mb-3">
            {t("successDesc") || "Your solution has been committed on-chain and encrypted for the TEE. It will be scored when the round ends."}
          </p>
          {state.txHash && (
            <a
              href={`https://sepolia.basescan.org/tx/${state.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-600 hover:text-emerald-800 underline font-mono"
            >
              {t("viewTx") || "View transaction"} →
            </a>
          )}
        </div>
      )}

      {/* Submit button */}
      {state.kind !== "success" && (
        <button
          onClick={handleSubmit}
          disabled={
            !solutionText.trim() ||
            state.kind === "committing_onchain" ||
            state.kind === "encrypting" ||
            state.kind === "submitting" ||
            commitPending
          }
          className="w-full py-4 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {state.kind === "committing_onchain" || commitPending
            ? t("stateCommitting") || "⏳ Committing hash on-chain..."
            : state.kind === "encrypting"
              ? t("stateEncrypting") || "🔐 Encrypting for TEE..."
              : state.kind === "submitting"
                ? t("stateSubmitting") || "📤 Submitting encrypted solution..."
                : t("submitButton") || "🚀 Submit Solution"}
        </button>
      )}

      <p className="text-xs text-slate-400 mt-4 text-center">
        {t("processNote") || "This will: 1) commit the hash on-chain, 2) encrypt your solution for the TEE, 3) submit the encrypted blob. The platform never sees your plaintext."}
      </p>
    </div>
  );
}
