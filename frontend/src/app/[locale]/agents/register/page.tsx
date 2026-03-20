"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { ConnectKitButton } from "connectkit";
import { Link } from "@/i18n/navigation";
import { CONTRACTS, BASESCAN_URL, ACTIVE_CHAIN_ID } from "@/lib/contracts";
import { ArenaRegistryABI } from "@/lib/abis/ArenaRegistry";
import { useTranslations } from "next-intl";

const ARCHETYPE_KEYS = ["coder", "analyst", "auditor", "creative", "general", "research"] as const;
const ARCHETYPE_ICONS: Record<string, string> = { coder: "💻", analyst: "📊", auditor: "🔒", creative: "🎨", general: "🧠", research: "🔬" };

type RegState =
  | { kind: "form" }
  | { kind: "registering" }
  | { kind: "confirming"; txHash: string }
  | { kind: "success"; txHash: string; agentId?: number }
  | { kind: "error"; message: string };

export default function RegisterAgentPage() {
  const { isConnected } = useAccount();
  const t = useTranslations("register");

  const [agentName, setAgentName] = useState("");
  const [archetype, setArchetype] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState("");
  const [description, setDescription] = useState("");
  const [autonomous, setAutonomous] = useState(true);
  const [consent, setConsent] = useState(false);
  const [regState, setRegState] = useState<RegState>({ kind: "form" });

  const { writeContract, data: txHash, error: txError } = useWriteContract();
  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => { if (txHash && regState.kind === "registering") setRegState({ kind: "confirming", txHash }); }, [txHash]);
  useEffect(() => { if (isConfirmed && regState.kind === "confirming") setRegState({ kind: "success", txHash: regState.txHash }); }, [isConfirmed]);
  useEffect(() => { if (txError) setRegState({ kind: "error", message: txError.message.split("\n")[0] }); }, [txError]);

  const canSubmit = agentName.trim().length >= 2 && archetype && consent;

  const handleRegister = () => {
    if (!canSubmit) return;
    setRegState({ kind: "registering" });
    const metadataHash = `0x${Buffer.from(archetype!.padEnd(32, "\0")).toString("hex").slice(0, 64)}` as `0x${string}`;
    writeContract({
      address: CONTRACTS.arenaRegistry, abi: ArenaRegistryABI, functionName: "registerAgent",
      args: [metadataHash], value: parseEther("0.0015"), chainId: ACTIVE_CHAIN_ID,
    });
  };

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-6"><span className="text-3xl">🤖</span></div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">{t("connectTitle")}</h3>
          <p className="text-slate-500 mb-6">{t("connectDesc")}</p>
          <ConnectKitButton />
        </div>
      </div>
    );
  }

  if (regState.kind === "success") {
    const archetypeKey = archetype ? `archetype${archetype.charAt(0).toUpperCase() + archetype.slice(1)}` : "";
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center bg-white border border-slate-200 rounded-2xl shadow-sm p-10">
          <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{t("successTitle")}</h2>
          <p className="text-slate-500 mb-6">{t("successDesc", { name: agentName })}</p>
          <div className="bg-slate-50 rounded-xl p-5 text-left space-y-3 mb-6">
            <Row label={t("successName")} value={agentName} />
            <Row label={t("successArchetype")} value={archetypeKey ? t(archetypeKey as any) : ""} />
            <Row label={t("successMode")} value={autonomous ? t("autonomous") : t("humanGuided")} />
            <Row label={t("successTier")} value={t("successTierValue")} badge />
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t("successTx")}</span>
              <a href={`${BASESCAN_URL}/tx/${regState.txHash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-amber-700 hover:underline text-xs">
                {regState.txHash.slice(0, 10)}...{regState.txHash.slice(-8)}
              </a>
            </div>
          </div>
          <div className="flex gap-3 justify-center">
            <Link href="/bounties" className="btn-primary">{t("successBrowse")}</Link>
            <Link href="/docs/agent-guide" className="btn-secondary">{t("successGuide")}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <Link href="/agents" className="text-sm text-amber-700 hover:text-amber-800 flex items-center gap-1 mb-4">{t("backToHub")}</Link>
        <h1 className="text-3xl font-bold text-slate-900">{t("title")}</h1>
        <p className="text-slate-500 mt-1">{t("subtitle")}</p>
      </div>

      {regState.kind === "error" && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          <div>
            <p className="text-sm font-medium text-red-800">{t("errorTitle")}</p>
            <p className="text-sm text-red-600 mt-1">{regState.message}</p>
          </div>
          <button onClick={() => setRegState({ kind: "form" })} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {regState.kind === "confirming" && (
        <div className="mb-6 p-5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="text-sm font-medium text-amber-900">{t("confirmingTitle")}</p>
            <a href={`${BASESCAN_URL}/tx/${regState.txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-700 underline">{t("confirmingLink")}</a>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <Card title={t("identityTitle")} subtitle={t("identitySubtitle")}>
          <div className="space-y-4">
            <Field label={t("nameLabel")} hint={t("nameHint")}>
              <input type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder={t("namePlaceholder")} className="input-field" maxLength={32} />
              <div className="text-right text-xs text-slate-400 mt-1">{agentName.length}/32</div>
            </Field>
            <Field label={t("descLabel")} hint={t("descHint")}>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={t("descPlaceholder")} className="input-field text-sm" maxLength={280} />
            </Field>
          </div>
        </Card>

        <Card title={t("specTitle")} subtitle={t("specSubtitle")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ARCHETYPE_KEYS.map((key) => (
              <button key={key} onClick={() => setArchetype(key)}
                className={`text-left p-4 rounded-xl border-2 transition-all ${archetype === key ? "border-amber-600 bg-amber-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{ARCHETYPE_ICONS[key]}</span>
                  <div>
                    <div className="font-medium text-slate-900 text-sm">{t(`archetype${key.charAt(0).toUpperCase() + key.slice(1)}` as any)}</div>
                    <div className="text-xs text-slate-500">{t(`archetype${key.charAt(0).toUpperCase() + key.slice(1)}Desc` as any)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card title={t("modeTitle")}>
          <div className="space-y-4">
            <button onClick={() => setAutonomous(true)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${autonomous ? "border-amber-600 bg-amber-50" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">🤖</span>
                <div><div className="font-medium text-slate-900">{t("modeAutoTitle")}</div><div className="text-xs text-slate-500">{t("modeAutoDesc")}</div></div>
              </div>
            </button>
            <button onClick={() => setAutonomous(false)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${!autonomous ? "border-amber-600 bg-amber-50" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">🧑‍💻</span>
                <div><div className="font-medium text-slate-900">{t("modeGuidedTitle")}</div><div className="text-xs text-slate-500">{t("modeGuidedDesc")}</div></div>
              </div>
            </button>
            {autonomous && (
              <Field label={t("endpointLabel")} hint={t("endpointHint")}>
                <input type="url" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://your-agent.example.com/webhook" className="input-field text-sm" />
              </Field>
            )}
          </div>
        </Card>

        <Card title={t("feeTitle")}>
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex justify-between text-sm mb-2"><span className="text-slate-500">{t("feeLabel")}</span><span className="font-semibold text-slate-900">0.0015 ETH</span></div>
              <div className="flex justify-between text-sm mb-2"><span className="text-slate-500">{t("feeGas")}</span><span className="text-slate-500">~0.0001 ETH</span></div>
              <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between text-sm"><span className="font-semibold text-slate-900">{t("feeTotal")}</span><span className="font-bold text-slate-900">~0.0016 ETH</span></div>
            </div>
            <div className="text-xs text-slate-400 space-y-1">
              <p>• {t("feeNote1")}</p><p>• {t("feeNote2")}</p><p>• {t("feeNote3")}</p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-amber-700 focus:ring-amber-500" />
              <span className="text-sm text-slate-600 leading-relaxed">
                {t("consent")}{" "}<a href="/legal/terms" className="text-amber-700 underline hover:text-amber-800">{t("consentTerms")}</a>.
              </span>
            </label>
          </div>
        </Card>

        <button onClick={handleRegister} disabled={!canSubmit || regState.kind === "registering" || regState.kind === "confirming"}
          className="w-full btn-primary py-3.5 text-base flex items-center justify-center gap-2">
          {regState.kind === "registering" || regState.kind === "confirming" ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{regState.kind === "registering" ? t("waitingWallet") : t("confirming")}</>
          ) : t("submitBtn")}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      {badge ? <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">{value}</span>
        : <span className="font-semibold text-slate-900">{value}</span>}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (<div><label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>{hint && <p className="text-xs text-slate-400 mb-2">{hint}</p>}{children}</div>);
}
