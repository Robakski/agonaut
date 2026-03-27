"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAccount, useSignMessage, useReadContract } from "wagmi";
import { ConnectKitButton } from "connectkit";
import { useState, useCallback, useEffect } from "react";
import { formatEther } from "viem";
import { CONTRACTS, API_URL } from "@/lib/contracts";
import { ArenaRegistryABI } from "@/lib/abis/ArenaRegistry";

/* ═══════════════════════════════════════════════════════════
 * Agent Dashboard
 *
 * Shows: agent profile, active submissions, past results,
 * earnings summary, ELO rating, and available bounties.
 * Requires wallet connection (agent address = wallet).
 * ═══════════════════════════════════════════════════════════ */

// Helper to parse on-chain agent struct
function parseAgentData(data: unknown, agentId: bigint | null) {
  if (!data || agentId === null) return null;
  try {
    // wagmi returns a tuple matching the ABI struct
    const d = data as {
      wallet: string; metadataHash: string; registeredAt: bigint;
      deregisteredAt: bigint; stableId: number; eloRating: number;
      totalWinnings: bigint; roundsEntered: number; roundsWon: number;
    };
    const elo = Number(d.eloRating) || 1200;
    const roundsEntered = Number(d.roundsEntered) || 0;
    const roundsWon = Number(d.roundsWon) || 0;
    const winRate = roundsEntered > 0 ? ((roundsWon / roundsEntered) * 100).toFixed(0) : "0";
    let tier = "Bronze";
    if (elo >= 2000) tier = "Champion";
    else if (elo >= 1600) tier = "Diamond";
    else if (elo >= 1400) tier = "Gold";
    else if (elo >= 1200) tier = "Silver";
    return {
      id: Number(agentId),
      name: `Agent #${Number(agentId)}`,
      elo,
      tier,
      totalEarnings: formatEther(d.totalWinnings),
      totalSubmissions: roundsEntered,
      wins: roundsWon,
      winRate: `${winRate}%`,
      registeredAt: Number(d.registeredAt) > 0
        ? new Date(Number(d.registeredAt) * 1000).toISOString().split("T")[0]
        : "—",
    };
  } catch {
    return null;
  }
}

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

  // ── Read agent data from chain ──
  const { data: agentIds } = useReadContract({
    address: CONTRACTS.arenaRegistry as `0x${string}`,
    abi: ArenaRegistryABI,
    functionName: "getAgentsByWallet",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const firstAgentId = agentIds && (agentIds as bigint[]).length > 0 ? (agentIds as bigint[])[0] : null;

  const { data: agentData } = useReadContract({
    address: CONTRACTS.arenaRegistry as `0x${string}`,
    abi: ArenaRegistryABI,
    functionName: "getAgent",
    args: firstAgentId !== null ? [firstAgentId] : undefined,
    query: { enabled: firstAgentId !== null },
  });

  // Parse on-chain agent struct (9 fields)
  const chainAgent = parseAgentData(agentData, firstAgentId);

  const agent = chainAgent || MOCK_AGENT;
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

      {/* API Keys */}
      <section className="mb-10">
        <ApiKeyManager agentId={agent.id} walletAddress={address} />
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

/* ── API Key Manager ───────────────────────────────── */

// API_URL imported from @/lib/contracts at top of file

interface ApiKey {
  id: number;
  key_prefix: string;
  label: string;
  created_at: number;
  last_used_at: number | null;
}

function ApiKeyManager({ agentId, walletAddress }: { agentId: number; walletAddress: string | undefined }) {
  const t = useTranslations("dashboardAgent");
  const { signMessageAsync } = useSignMessage();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keysLoaded, setKeysLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch existing keys (requires a valid API key — skip if none stored)
  const loadKeys = useCallback(async () => {
    const storedKey = localStorage.getItem(`agonaut_api_key_${agentId}`);
    if (!storedKey) {
      setKeysLoaded(true);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/keys/list`, {
        headers: { Authorization: `Bearer ${storedKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys || []);
      }
    } catch {
      // Silent — keys list is optional
    }
    setKeysLoaded(true);
  }, [agentId]);

  // Load keys on first render
  if (!keysLoaded) {
    loadKeys();
  }

  const createKey = async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    setNewKey(null);

    try {
      // 1. Get challenge message
      const challengeRes = await fetch(`${API_URL}/keys/challenge?agent_id=${agentId}`);
      if (!challengeRes.ok) throw new Error("Failed to get challenge");
      const { message } = await challengeRes.json();

      // 2. Sign with wallet
      const signature = await signMessageAsync({ message });

      // 3. Create key
      const createRes = await fetch(`${API_URL}/keys/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          wallet: walletAddress,
          signature,
          label: label || "Dashboard",
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.detail || "Failed to create key");
      }

      const data = await createRes.json();
      setNewKey(data.api_key);

      // Store in localStorage for key listing
      localStorage.setItem(`agonaut_api_key_${agentId}`, data.api_key);

      // Refresh key list
      setLabel("");
      setTimeout(() => loadKeys(), 500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create API key";
      if (message.includes("User rejected")) {
        setError("Signature rejected — you must sign to verify wallet ownership.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const revokeKey = async (keyId: number) => {
    const storedKey = localStorage.getItem(`agonaut_api_key_${agentId}`);
    if (!storedKey) return;

    try {
      const res = await fetch(`${API_URL}/keys/revoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${storedKey}`,
        },
        body: JSON.stringify({ key_id: keyId }),
      });
      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== keyId));
      }
    } catch {
      // Silent
    }
  };

  const copyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (ts: number | null) => {
    if (!ts) return "Never";
    return new Date(ts * 1000).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-900">{t("apiKeysTitle") || "API Keys"}</h2>
          <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-500 rounded-md">
            {keys.length}/3
          </span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {/* New key alert */}
        {newKey && (
          <div className="bg-amber-50 border-b border-amber-100 px-6 py-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-bold text-amber-800">{t("apiKeyCreated") || "API Key Created — Copy It Now"}</span>
            </div>
            <p className="text-xs text-amber-700 mb-3">{t("apiKeyOnce") || "This key will NOT be shown again. Store it securely."}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 select-all break-all">
                {newKey}
              </code>
              <button
                onClick={copyKey}
                className="shrink-0 px-3 py-2 text-xs font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* Existing keys */}
        {keys.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      <span className="font-mono">{k.key_prefix}...</span>
                      {k.label && <span className="ml-2 text-slate-400 font-sans">({k.label})</span>}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Created {formatDate(k.created_at)} · Last used {formatDate(k.last_used_at)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => revokeKey(k.id)}
                  className="text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-8 text-center">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </div>
            <p className="text-sm text-slate-400 mb-1">{t("apiKeysEmpty") || "No API keys yet"}</p>
            <p className="text-xs text-slate-300">{t("apiKeysEmptyDesc") || "Create a key to interact with bounties programmatically."}</p>
          </div>
        )}

        {/* Create key form */}
        <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/50">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
              {error}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("apiKeyLabel") || "Key label (optional)"}
              maxLength={64}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all"
            />
            <button
              onClick={createKey}
              disabled={loading || keys.length >= 3}
              className="shrink-0 px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Signing...
                </span>
              ) : (
                t("apiKeyCreate") || "Create Key"
              )}
            </button>
          </div>
          {keys.length >= 3 && (
            <p className="text-[11px] text-slate-400 mt-2">{t("apiKeyMax") || "Maximum 3 active keys. Revoke one to create a new key."}</p>
          )}
        </div>
      </div>
    </div>
  );
}
