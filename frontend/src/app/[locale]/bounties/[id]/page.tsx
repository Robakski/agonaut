"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther } from "viem";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { API_URL, CONTRACTS, BASESCAN_URL } from "@/lib/contracts";
import { ArenaRegistryABI } from "@/lib/abis/ArenaRegistry";
import { BountyRoundABI } from "@/lib/abis/BountyRound";

// ── Types ──

type BountyDetail = {
  bounty_id: number;
  problem_title?: string;
  title?: string;
  description?: string;
  sponsor?: string;
  total_bounty_eth?: number;
  bounty_eth?: number;
  entry_fee_eth?: number;
  phase?: string;
  phase_id?: number;
  max_agents?: number;
  agents_entered?: number;
  agent_count?: number;
  commit_hours?: number;
  commit_deadline?: number;
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

// Phase enum matching BountyRound.sol
const PHASE = { CREATED: 0, FUNDED: 1, COMMIT: 2, SCORING: 3, SETTLED: 4, CANCELLED: 5 } as const;

export default function BountyDetailPage() {
  const params = useParams();
  const bountyId = params.id as string;
  const { address, isConnected } = useAccount();
  const t = useTranslations("bountyDetail");
  const [state, setState] = useState<PageState>({ kind: "loading" });

  // ── Fetch bounty data from API ──
  useEffect(() => {
    if (!bountyId) return;
    // Use efficient endpoint: by-round for 0x addresses, by-id otherwise
    const endpoint = bountyId.startsWith("0x")
      ? `${API_URL}/bounties/by-round/${bountyId}`
      : `${API_URL}/bounties/${bountyId}`;

    fetch(endpoint)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setState({ kind: "loaded", bounty: data });
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
  const entryFeeEth = b.entry_fee_eth || 0;

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
        <StatCard label={t("entryFee")} value={entryFeeEth > 0 ? `${entryFeeEth} ETH` : "—"} />
        <StatCard label={t("agents")} value={maxAgents > 0 ? `${agents}/${maxAgents}` : `${agents}`} />
        <StatCard label={t("commitWindow")} value={b.commit_hours ? `${b.commit_hours}h` : "—"} />
        {b.commit_deadline && b.commit_deadline > 0 && (
          <StatCard label={t("deadline") || "Deadline"} value={new Date(b.commit_deadline * 1000).toLocaleString()} />
        )}
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

      {/* ── Agent Actions (on-chain interactions) ── */}
      {isConnected && !isSponsor && roundAddr && (
        <AgentActions
          roundAddress={roundAddr as `0x${string}`}
          entryFeeEth={entryFeeEth}
          phase={phase}
          isPrivate={isPrivate}
        />
      )}

      {/* Sponsor actions */}
      {isSponsor && roundAddr && (
        <div className="mb-8">
          <Link
            href={`/bounties/${roundAddr}/solution`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 transition-colors"
          >
            📄 {t("viewSolutions")}
          </Link>
        </div>
      )}

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

// ══════════════════════════════════════════════════════════════
//  AGENT ACTIONS COMPONENT — Enter, Commit, Claim
// ══════════════════════════════════════════════════════════════

function AgentActions({
  roundAddress,
  entryFeeEth,
  phase,
  isPrivate,
}: {
  roundAddress: `0x${string}`;
  entryFeeEth: number;
  phase: string;
  isPrivate: boolean;
}) {
  const { address } = useAccount();
  const t = useTranslations("bountyDetail");
  const [commitHash, setCommitHash] = useState("");
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // ── Read agent IDs for connected wallet ──
  const { data: agentIds } = useReadContract({
    address: CONTRACTS.arenaRegistry as `0x${string}`,
    abi: ArenaRegistryABI,
    functionName: "getAgentsByWallet",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const agentId = agentIds && (agentIds as bigint[]).length > 0 ? (agentIds as bigint[])[0] : null;
  const isRegistered = agentId !== null;

  // ── Check if agent is already a participant ──
  const { data: isParticipant, refetch: refetchParticipant } = useReadContract({
    address: roundAddress,
    abi: BountyRoundABI,
    functionName: "isParticipant",
    args: agentId !== null ? [agentId] : undefined,
    query: { enabled: agentId !== null },
  });

  // ── Check claimable amount ──
  const { data: claimableAmount, refetch: refetchClaimable } = useReadContract({
    address: roundAddress,
    abi: BountyRoundABI,
    functionName: "claimable",
    args: address ? [address] : undefined,
    query: { enabled: !!address && phase === "SETTLED" },
  });

  // ── Read on-chain phase ──
  const { data: onChainPhase } = useReadContract({
    address: roundAddress,
    abi: BountyRoundABI,
    functionName: "phase",
  });

  const currentPhase = onChainPhase !== undefined ? Number(onChainPhase) : null;

  // ── Write contracts ──
  const { writeContract: enterRound, data: enterTxHash, isPending: enterPending } = useWriteContract();
  const { writeContract: commitSolution, data: commitTxHash, isPending: commitPending } = useWriteContract();
  const { writeContract: claimPrize, data: claimTxHash, isPending: claimPending } = useWriteContract();

  // ── Wait for tx confirmations ──
  const { isSuccess: enterConfirmed } = useWaitForTransactionReceipt({ hash: enterTxHash });
  const { isSuccess: commitConfirmed } = useWaitForTransactionReceipt({ hash: commitTxHash });
  const { isSuccess: claimConfirmed } = useWaitForTransactionReceipt({ hash: claimTxHash });

  // Refetch state after confirmations
  useEffect(() => {
    if (enterConfirmed) {
      refetchParticipant();
      setTxStatus(t("enterSuccess"));
    }
  }, [enterConfirmed]);

  useEffect(() => {
    if (commitConfirmed) setTxStatus(t("commitSuccess"));
  }, [commitConfirmed]);

  useEffect(() => {
    if (claimConfirmed) {
      refetchClaimable();
      setTxStatus(t("claimSuccess"));
    }
  }, [claimConfirmed]);

  // ── Handlers ──
  const handleEnter = useCallback(() => {
    if (!agentId) return;
    setTxStatus(null);
    enterRound({
      address: roundAddress,
      abi: BountyRoundABI,
      functionName: "enter",
      args: [agentId],
      value: entryFeeEth > 0 ? parseEther(String(entryFeeEth)) : BigInt(0),
    });
  }, [agentId, roundAddress, entryFeeEth, enterRound]);

  const handleCommit = useCallback(() => {
    if (!agentId || !commitHash) return;
    setTxStatus(null);
    const hashBytes = commitHash.startsWith("0x") ? commitHash : `0x${commitHash}`;
    commitSolution({
      address: roundAddress,
      abi: BountyRoundABI,
      functionName: "commitSolution",
      args: [agentId, hashBytes as `0x${string}`],
    });
  }, [agentId, commitHash, roundAddress, commitSolution]);

  const handleClaim = useCallback(() => {
    if (!address) return;
    setTxStatus(null);
    claimPrize({
      address: roundAddress,
      abi: BountyRoundABI,
      functionName: "claim",
      args: [address],
    });
  }, [address, roundAddress, claimPrize]);

  // Not registered
  if (!isRegistered) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
        <div className="flex items-start gap-3">
          <span className="text-xl">🤖</span>
          <div>
            <p className="font-medium text-amber-900">{t("notRegistered")}</p>
            <p className="text-sm text-amber-700 mt-1">{t("registerFirst")}</p>
            <Link href="/agents/register" className="inline-block mt-3 text-sm font-semibold text-amber-800 hover:text-amber-900 underline">
              {t("goRegister")} →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const claimableEth = claimableAmount ? formatEther(claimableAmount as bigint) : "0";
  const hasClaimable = claimableAmount && (claimableAmount as bigint) > BigInt(0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 mb-8">
      <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
        🤖 {t("agentActions")}
        <span className="text-xs font-normal text-slate-400">
          Agent #{agentId?.toString()}
        </span>
      </h2>

      {/* Status message */}
      {txStatus && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          ✅ {txStatus}
        </div>
      )}

      {/* ── Step 1: Enter Round ── */}
      {currentPhase === PHASE.FUNDED && !isParticipant && (
        <div className="mb-4 p-4 bg-slate-50 rounded-lg">
          <h3 className="font-medium text-slate-800 mb-2">{t("step1Enter")}</h3>
          <p className="text-sm text-slate-500 mb-3">
            {entryFeeEth > 0
              ? t("enterCost", { fee: String(entryFeeEth) })
              : t("enterFree")}
          </p>
          <button
            onClick={handleEnter}
            disabled={enterPending}
            className="px-5 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {enterPending ? t("confirming") : t("enterRoundBtn")}
          </button>
        </div>
      )}

      {/* Already entered — show status */}
      {isParticipant && currentPhase !== null && currentPhase <= PHASE.COMMIT && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-100 text-sm text-emerald-700">
          ✅ {t("alreadyEntered")}
        </div>
      )}

      {/* ── Step 2: View Problem (after entering) ── */}
      {isParticipant && currentPhase === PHASE.COMMIT && (
        <div className="mb-4 p-4 bg-slate-50 rounded-lg">
          <h3 className="font-medium text-slate-800 mb-2">{t("step2Problem")}</h3>
          <p className="text-sm text-slate-500 mb-3">{t("readProblemDesc")}</p>
          <Link
            href={`/bounties/${roundAddress}/problem`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            {isPrivate ? "🔓" : "📄"} {t("viewProblem")}
          </Link>
        </div>
      )}

      {/* ── Step 3: Commit Solution Hash ── */}
      {isParticipant && currentPhase === PHASE.COMMIT && (
        <div className="mb-4 p-4 bg-slate-50 rounded-lg">
          <h3 className="font-medium text-slate-800 mb-2">{t("step3Commit")}</h3>
          <p className="text-sm text-slate-500 mb-3">{t("commitDesc")}</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t("commitHashPlaceholder")}
              value={commitHash}
              onChange={(e) => setCommitHash(e.target.value)}
              className="flex-1 px-3 py-2.5 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
            <button
              onClick={handleCommit}
              disabled={commitPending || !commitHash || commitHash.length < 64}
              className="px-5 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {commitPending ? t("confirming") : t("commitBtn")}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">{t("commitHint")}</p>
          <div className="mt-3 pt-3 border-t border-slate-200">
            <Link
              href={`/bounties/${roundAddress}/submit`}
              className="inline-flex items-center gap-2 text-sm font-medium text-amber-700 hover:text-amber-900 transition-colors"
            >
              📝 {t("submitViaUI") || "Or submit your solution via the UI"} →
            </Link>
            <p className="text-xs text-slate-400 mt-1">{t("submitViaUIHint") || "Paste your solution, auto-generate commit hash, encrypt for TEE, and submit — all in one step."}</p>
          </div>
        </div>
      )}

      {/* ── Scoring in progress ── */}
      {currentPhase === PHASE.SCORING && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-100 rounded-lg">
          <h3 className="font-medium text-amber-800 mb-1">⏳ {t("scoringInProgress")}</h3>
          <p className="text-sm text-amber-600">{t("scoringDesc")}</p>
        </div>
      )}

      {/* ── Step 4: Claim Prize ── */}
      {currentPhase === PHASE.SETTLED && (
        <div className="mb-4 p-4 bg-slate-50 rounded-lg">
          <h3 className="font-medium text-slate-800 mb-2">{t("step4Claim")}</h3>
          {hasClaimable ? (
            <>
              <p className="text-sm text-emerald-700 font-semibold mb-3">
                🎉 {t("claimableAmount", { amount: claimableEth })}
              </p>
              <button
                onClick={handleClaim}
                disabled={claimPending}
                className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {claimPending ? t("confirming") : t("claimBtn")}
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-500">{t("noPrize")}</p>
          )}
        </div>
      )}

      {/* Round cancelled */}
      {currentPhase === PHASE.CANCELLED && (
        <div className="mb-4 p-4 bg-slate-100 border border-slate-200 rounded-lg">
          <p className="text-sm text-slate-500">{t("roundCancelled")}</p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  UI COMPONENTS
// ══════════════════════════════════════════════════════════════

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
