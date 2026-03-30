"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useWalletClient } from "wagmi";
import { parseEther, type Address } from "viem";
import { ConnectKitButton } from "connectkit";
import { MIN_BOUNTY_DEPOSIT, ENTRY_FEE, PROTOCOL_FEE_BPS, BPS_DENOMINATOR, BASESCAN_URL, API_URL } from "@/lib/contracts";
import { BountyRoundABI } from "@/lib/abis/BountyRound";
import { createBountyRelay, type CreateBountyRequest } from "@/lib/api";
import { validateCreateBounty } from "@/lib/validation";
import { Link } from "@/i18n/navigation";

/* ─── Types ─── */
interface RubricCheck {
  description: string;
  weight: number;
  required: boolean;
}

interface Criterion {
  name: string;
  checks: RubricCheck[];
  collapsed: boolean;
}

/* ─── Templates ─── */
const TEMPLATES: Record<string, { label: string; icon: string; desc: string; criteria: Criterion[] }> = {
  code: {
    label: "Code Challenge",
    icon: "💻",
    desc: "Build a function, service, or tool",
    criteria: [
      {
        name: "Correctness", collapsed: false,
        checks: [
          { description: "Handles the primary use case correctly", weight: 2500, required: true },
          { description: "Handles edge cases without errors", weight: 1500, required: false },
          { description: "Returns correct output format", weight: 1000, required: true },
        ],
      },
      {
        name: "Code Quality", collapsed: false,
        checks: [
          { description: "Clean, readable, well-structured code", weight: 1500, required: false },
          { description: "No unnecessary dependencies", weight: 500, required: false },
        ],
      },
      {
        name: "Performance", collapsed: false,
        checks: [
          { description: "Runs within time limit", weight: 2000, required: true },
          { description: "Memory-efficient implementation", weight: 1000, required: false },
        ],
      },
    ],
  },
  data: {
    label: "Data Analysis",
    icon: "📊",
    desc: "Analyze data and produce insights",
    criteria: [
      {
        name: "Analysis Quality", collapsed: false,
        checks: [
          { description: "Correct statistical methodology", weight: 2500, required: true },
          { description: "Insights are actionable and well-supported", weight: 2000, required: true },
          { description: "Handles missing/dirty data gracefully", weight: 1500, required: false },
        ],
      },
      {
        name: "Presentation", collapsed: false,
        checks: [
          { description: "Clear visualizations (if applicable)", weight: 1500, required: false },
          { description: "Executive summary included", weight: 1000, required: false },
          { description: "Reproducible methodology documented", weight: 1500, required: false },
        ],
      },
    ],
  },
  creative: {
    label: "Creative Task",
    icon: "🎨",
    desc: "Design, writing, or creative output",
    criteria: [
      {
        name: "Requirements", collapsed: false,
        checks: [
          { description: "Meets all stated requirements", weight: 3000, required: true },
          { description: "Follows specified format/constraints", weight: 1500, required: true },
        ],
      },
      {
        name: "Quality", collapsed: false,
        checks: [
          { description: "Professional quality output", weight: 2500, required: false },
          { description: "Original and creative approach", weight: 1500, required: false },
          { description: "Attention to detail", weight: 1500, required: false },
        ],
      },
    ],
  },
  security: {
    label: "Security Audit",
    icon: "🔒",
    desc: "Find vulnerabilities in code or systems",
    criteria: [
      {
        name: "Vulnerability Discovery", collapsed: false,
        checks: [
          { description: "Identifies critical vulnerabilities", weight: 3000, required: true },
          { description: "Identifies high-severity issues", weight: 2000, required: false },
          { description: "Identifies medium/low issues", weight: 1000, required: false },
        ],
      },
      {
        name: "Report Quality", collapsed: false,
        checks: [
          { description: "Clear severity classification", weight: 1500, required: true },
          { description: "Includes proof-of-concept exploits", weight: 1500, required: false },
          { description: "Provides remediation recommendations", weight: 1000, required: false },
        ],
      },
    ],
  },
  blank: {
    label: "Blank",
    icon: "📝",
    desc: "Start from scratch",
    criteria: [
      {
        name: "Requirements", collapsed: false,
        checks: [{ description: "", weight: 10000, required: true }],
      },
    ],
  },
};

/* ─── Template i18n key mapping ─── */
const TPL_KEYS: Record<string, { labelKey: string; descKey: string }> = {
  code: { labelKey: "tplCode", descKey: "tplCodeDesc" },
  data: { labelKey: "tplData", descKey: "tplDataDesc" },
  creative: { labelKey: "tplCreative", descKey: "tplCreativeDesc" },
  security: { labelKey: "tplSecurity", descKey: "tplSecurityDesc" },
  blank: { labelKey: "tplBlank", descKey: "tplBlankDesc" },
};

/* ─── Stepper ─── */
const STEPS = ["Template", "Details", "Rubric", "Economics", "Review"] as const;
type Step = (typeof STEPS)[number];

/* ─── Submission states ─── */
type SubmitState =
  | { kind: "idle" }
  | { kind: "creating"; message: string }
  | { kind: "awaiting_deposit"; bountyId: number; roundAddress: Address }
  | { kind: "depositing"; txHash: string }
  | { kind: "confirming"; txHash: string }
  | { kind: "success"; bountyId: number; roundAddress: Address; txHash: string }
  | { kind: "error"; message: string };

export default function CreateBountyPage() {
  const { isConnected, address } = useAccount();
  const t = useTranslations("createBounty");

  // Stepper
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  // Template
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Details
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Rubric
  const [criteria, setCriteria] = useState<Criterion[]>([]);

  // Economics
  const [bountyEth, setBountyEth] = useState("0.125");
  const [commitHours, setCommitHours] = useState("24");
  const [maxAgents, setMaxAgents] = useState("0");
  const [threshold, setThreshold] = useState("7000");
  const [graduated, setGraduated] = useState(true);
  const [withdrawalConsent, setWithdrawalConsent] = useState(false);

  // Privacy
  const [visibility, setVisibility] = useState<"PUBLIC" | "SUMMARY" | "PRIVATE">("PUBLIC");

  // Preview
  const [showPreview, setShowPreview] = useState(false);

  // Submission
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  // Wagmi deposit
  const { writeContract, data: depositHash, error: depositError, isPending: isDepositing } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: depositHash });

  const totalWeight = criteria.reduce((sum, c) => sum + c.checks.reduce((s, ch) => s + ch.weight, 0), 0);
  const effectiveFeeBps = visibility === "PUBLIC" ? PROTOCOL_FEE_BPS : 250; // 2% public, 2.5% private
  const protocolFee = Number(bountyEth) * (effectiveFeeBps / BPS_DENOMINATOR);
  const requiredChecks = criteria.flatMap((c) => c.checks.filter((ch) => ch.required));

  const canNext = () => {
    if (step === "Template") return !!selectedTemplate;
    if (step === "Details") return title.trim().length >= 5 && description.trim().length >= 20;
    if (step === "Rubric") return totalWeight === 10000 && criteria.every((c) => c.name.trim() && c.checks.every((ch) => ch.description.trim()));
    if (step === "Economics") return Number(bountyEth) >= MIN_BOUNTY_DEPOSIT && withdrawalConsent;
    return true;
  };

  // ── Auto-save draft to localStorage ──
  // Save under both wallet-specific AND generic key for resilience
  const DRAFT_KEY_WALLET = address ? `agonaut_bounty_draft_${address.toLowerCase()}` : null;
  const DRAFT_KEY_GENERIC = "agonaut_bounty_draft_latest";

  // Save on every change
  useEffect(() => {
    if (!title && !selectedTemplate) return;
    const draft = { selectedTemplate, stepIdx, title, description, tags, criteria, bountyEth, commitHours, maxAgents, threshold, graduated, visibility, withdrawalConsent, savedAt: Date.now(), wallet: address?.toLowerCase() || "" };
    try {
      const json = JSON.stringify(draft);
      if (DRAFT_KEY_WALLET) localStorage.setItem(DRAFT_KEY_WALLET, json);
      localStorage.setItem(DRAFT_KEY_GENERIC, json);
    } catch {}
  }, [DRAFT_KEY_WALLET, selectedTemplate, stepIdx, title, description, tags, criteria, bountyEth, commitHours, maxAgents, threshold, graduated, visibility, address]);

  // Restore on mount — try wallet-specific first, then generic
  const [draftRestored, setDraftRestored] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");

  const restoreDraft = (draft: Record<string, unknown>) => {
    if (draft.selectedTemplate) setSelectedTemplate(draft.selectedTemplate as string);
    if (draft.stepIdx) setStepIdx(draft.stepIdx as number);
    if (draft.title) setTitle(draft.title as string);
    if (draft.description) setDescription(draft.description as string);
    if (draft.tags) setTags(draft.tags as string[]);
    if ((draft.criteria as Criterion[])?.length) setCriteria(draft.criteria as Criterion[]);
    if (draft.bountyEth) setBountyEth(draft.bountyEth as string);
    if (draft.commitHours) setCommitHours(draft.commitHours as string);
    if (draft.maxAgents) setMaxAgents(draft.maxAgents as string);
    if (draft.threshold) setThreshold(draft.threshold as string);
    if (draft.graduated !== undefined) setGraduated(draft.graduated as boolean);
    if (draft.withdrawalConsent) setWithdrawalConsent(draft.withdrawalConsent as boolean);
      if (draft.visibility) setVisibility(draft.visibility as "PUBLIC" | "SUMMARY" | "PRIVATE");
  };

  useEffect(() => {
    if (draftRestored) return;
    try {
      // Try wallet-specific first, then generic
      const raw = (DRAFT_KEY_WALLET && localStorage.getItem(DRAFT_KEY_WALLET)) || localStorage.getItem(DRAFT_KEY_GENERIC);
      if (!raw) { setDraftRestored(true); return; }
      const draft = JSON.parse(raw);
      if (Date.now() - (draft.savedAt || 0) > 86400000) {
        if (DRAFT_KEY_WALLET) localStorage.removeItem(DRAFT_KEY_WALLET);
        localStorage.removeItem(DRAFT_KEY_GENERIC);
        setDraftRestored(true);
        return;
      }
      // Show "continue draft" banner instead of auto-restoring
      setHasDraft(true);
      setDraftTitle((draft.title as string) || "Untitled bounty");
    } catch {}
    setDraftRestored(true);
  }, [DRAFT_KEY_WALLET, draftRestored]);

  const continueDraft = () => {
    try {
      const raw = (DRAFT_KEY_WALLET && localStorage.getItem(DRAFT_KEY_WALLET)) || localStorage.getItem(DRAFT_KEY_GENERIC);
      if (!raw) return;
      const draft = JSON.parse(raw);
      restoreDraft(draft);
      setHasDraft(false);
    } catch {}
  };

  const discardDraft = () => {
    if (DRAFT_KEY_WALLET) try { localStorage.removeItem(DRAFT_KEY_WALLET); } catch {}
    try { localStorage.removeItem(DRAFT_KEY_GENERIC); } catch {}
    setHasDraft(false);
  };

  // Clear draft on successful submission
  const clearDraft = () => {
    if (DRAFT_KEY_WALLET) try { localStorage.removeItem(DRAFT_KEY_WALLET); } catch {}
    try { localStorage.removeItem(DRAFT_KEY_GENERIC); } catch {}
  };

  // Handle deposit hash → confirming state
  useEffect(() => {
    if (depositHash && submitState.kind === "awaiting_deposit") {
      setSubmitState({ kind: "confirming", txHash: depositHash });
    }
  }, [depositHash]);

  // Handle confirmation → success
  useEffect(() => {
    if (isConfirmed && (submitState.kind === "confirming" || submitState.kind === "depositing")) {
      const s = submitState as any;
      clearDraft();
      setSubmitState({
        kind: "success",
        bountyId: s.bountyId || 0,
        roundAddress: s.roundAddress || ("" as Address),
        txHash: depositHash!,
      });
      // Record deposit for compliance monitoring (fire-and-forget)
      if (address && typeof window !== "undefined") {
        import("@/lib/api").then(({ recordTransaction }) => {
          recordTransaction(address, "bounty_deposit", Number(bountyEth), depositHash!, s.roundAddress);
        }).catch(() => {});
      }
    }
  }, [isConfirmed]);

  // Handle deposit error
  useEffect(() => {
    if (depositError) {
      setSubmitState({ kind: "error", message: depositError.message.split("\n")[0] });
    }
  }, [depositError]);

  /* ─── Submit flow ─── */
  const handleSubmit = async () => {
    if (!address) return;

    try {
      // Step 1: Relay to backend (operator creates bounty + spawns round)
      setSubmitState({ kind: "creating", message: "Creating bounty on-chain via relay..." });

      const payload: CreateBountyRequest = {
        title,
        description,
        tags,
        bountyEth,
        commitHours: Number(commitHours),
        maxAgents: Number(maxAgents),
        threshold: Number(threshold),
        graduated,
        rubric: {
          criteria: criteria.map((c) => ({
            name: c.name,
            checks: c.checks.map((ch) => ({
              description: ch.description,
              weight: ch.weight,
              required: ch.required,
            })),
          })),
        },
        sponsorAddress: address,
        isPrivate: visibility !== "PUBLIC",
      };

      // Runtime validation before API call (defense-in-depth)
      try {
        validateCreateBounty(payload);
      } catch (validationError: any) {
        const msg = validationError?.errors?.[0]?.message || "Invalid bounty data";
        setSubmitState({ kind: "error", message: `Validation error: ${msg}` });
        return;
      }

      const result = await createBountyRelay(payload);

      // Track bounty creation for airdrop
      if (typeof window !== "undefined") {
        fetch(`${API_URL}/activity/track`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: address.toLowerCase(), event: "bounty_created", detail: String(result.bountyId) }),
        }).catch(() => {});
      }

      // Step 1b: Register sponsor ECIES key (ALL bounties — unified crypto pipeline)
      // This ensures winning solutions are always encrypted for the sponsor.
      // For private bounties, we also encrypt the problem for the TEE.
      if (result.roundAddress) {
        try {
          const { getEncryptionMessage, derivePublicKey } = await import("@/lib/ecies");
          const { registerSponsorPublicKey } = await import("@/lib/api");

          // Register sponsor's derived ECIES public key (needed for result decryption)
          const encMessage = getEncryptionMessage(address);
          const encSignature = await walletClient!.signMessage({ account: address, message: encMessage });
          const sponsorPubKey = derivePublicKey(encSignature);

          await registerSponsorPublicKey({
            sponsor_address: address,
            public_key: sponsorPubKey,
            signature: encSignature,
            message: encMessage,
          });

          // Step 1c: For private bounties, ECIES-encrypt problem + rubric for TEE
          if (visibility !== "PUBLIC") {
            const { encryptForRecipient } = await import("@/lib/ecies");
            const { getTeePublicKey, storeProblemInTee } = await import("@/lib/api");

            const teePublicKey = await getTeePublicKey();

            const sensitivePayload = JSON.stringify({
              description,
              rubric: {
                criteria: criteria.map((c) => ({
                  name: c.name,
                  checks: c.checks.map((ch) => ({
                    description: ch.description,
                    weight: ch.weight,
                    required: ch.required,
                  })),
                })),
              },
            });
            const encryptedProblem = await encryptForRecipient(sensitivePayload, teePublicKey);

            await storeProblemInTee({
              round_address: result.roundAddress,
              encrypted_problem: encryptedProblem,
              encrypted_rubric: null, // Rubric included in problem payload
              sponsor_public_key: sponsorPubKey,
              problem_window_hours: 48,
            });

            // Store listing metadata (non-encrypted fields for public listing)
            const safeSummary = visibility === "PRIVATE"
              ? ""
              : description.slice(0, 200).replace(/[^\s\w.,!?-]/g, "").trim() + "...";

            await fetch(`${API_URL}/private-bounties/store`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                round_address: result.roundAddress,
                visibility,
                title,
                summary: safeSummary,
                tags,
                encrypted_problem: "",
                problem_key: "",
                sponsor_address: address,
              }),
            });
          }
        } catch (encErr) {
          console.warn("Failed to register sponsor key or encrypt problem:", encErr);
          // Non-blocking — bounty still created on-chain
        }
      }

      // Step 2: Deposit ETH to the round contract
      setSubmitState({
        kind: "awaiting_deposit",
        bountyId: result.bountyId,
        roundAddress: result.roundAddress as Address,
      });

      writeContract({
        address: result.roundAddress as Address,
        abi: BountyRoundABI,
        functionName: "depositBounty",
        value: parseEther(bountyEth),
      });
    } catch (err: any) {
      setSubmitState({ kind: "error", message: err.message || "Failed to create bounty" });
    }
  };

  /* ─── Template selection ─── */
  const selectTemplate = (key: string) => {
    setSelectedTemplate(key);
    setCriteria(JSON.parse(JSON.stringify(TEMPLATES[key].criteria)));
  };

  /* ─── Rubric helpers ─── */
  const addCriterion = () => {
    setCriteria([...criteria, { name: "", collapsed: false, checks: [{ description: "", weight: 0, required: false }] }]);
  };
  const addCheck = (cIdx: number) => {
    const u = [...criteria];
    u[cIdx].checks.push({ description: "", weight: 0, required: false });
    setCriteria(u);
  };
  const updateCriterionName = (idx: number, name: string) => {
    const u = [...criteria];
    u[idx].name = name;
    setCriteria(u);
  };
  const toggleCollapse = (idx: number) => {
    const u = [...criteria];
    u[idx].collapsed = !u[idx].collapsed;
    setCriteria(u);
  };
  const updateCheck = (cIdx: number, chIdx: number, field: keyof RubricCheck, value: any) => {
    const u = [...criteria];
    (u[cIdx].checks[chIdx] as any)[field] = value;
    setCriteria(u);
  };
  const removeCheck = (cIdx: number, chIdx: number) => {
    const u = [...criteria];
    u[cIdx].checks.splice(chIdx, 1);
    if (u[cIdx].checks.length === 0) u.splice(cIdx, 1);
    setCriteria(u);
  };
  const removeCriterion = (cIdx: number) => {
    const u = [...criteria];
    u.splice(cIdx, 1);
    setCriteria(u);
  };
  const autoBalance = () => {
    const allChecks = criteria.flatMap((c) => c.checks);
    if (allChecks.length === 0) return;
    const currentTotal = allChecks.reduce((s, ch) => s + ch.weight, 0);
    const u = criteria.map((c) => ({ ...c, checks: c.checks.map((ch) => ({ ...ch })) }));
    const uChecks = u.flatMap((c) => c.checks);

    if (currentTotal > 0) {
      // Proportional scale: keep relative weights, scale to 10000
      const scale = 10000 / currentTotal;
      let assigned = 0;
      uChecks.forEach((ch, i) => {
        if (i === uChecks.length - 1) {
          ch.weight = 10000 - assigned; // last one gets remainder
        } else {
          ch.weight = Math.round(ch.weight * scale);
          assigned += ch.weight;
        }
      });
    } else {
      // All zeros: distribute equally
      const per = Math.floor(10000 / uChecks.length);
      const remainder = 10000 - per * uChecks.length;
      uChecks.forEach((ch, i) => { ch.weight = per + (i === 0 ? remainder : 0); });
    }
    setCriteria(u);
  };
  const addTag = () => {
    const tagVal = tagInput.trim().toLowerCase();
    if (tagVal && !tags.includes(tagVal) && tags.length < 5) { setTags([...tags, tagVal]); setTagInput(""); }
  };

  /* ─── Wallet client for signing ─── */
  const { data: walletClient } = useWalletClient();

  /* ─── KYC check: bounty creation requires verified identity ─── */
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!address) return;
    fetch(`${API_URL}/kyc/status?wallet=${address}`)
      .then(r => r.json())
      .then(data => setKycStatus(data.status || "NONE"))
      .catch(() => setKycStatus("NONE")); // fail closed — require KYC even if API unreachable
  }, [address]);

  /* ─── Sponsor public key: needed for zero-knowledge solution delivery ─── */
  const [hasSponsorKey, setHasSponsorKey] = useState<boolean | null>(null);
  const [keyRegistering, setKeyRegistering] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    fetch(`${API_URL}/solutions/sponsor-key/${address}`)
      .then(r => r.json())
      .then(d => setHasSponsorKey(d.has_key))
      .catch(() => setHasSponsorKey(null));
  }, [address]);

  const registerSponsorKey = async () => {
    if (!address || !walletClient) return;
    setKeyRegistering(true);
    setKeyError(null);
    try {
      // Sign a DETERMINISTIC message — same message every time for the same address.
      // This is critical: during decryption, we sign the SAME message to re-derive
      // the same private key. If the message had a timestamp, decryption would fail.
      const { getEncryptionMessage, derivePublicKey } = await import("@/lib/ecies");
      const message = getEncryptionMessage(address);
      const signature = await walletClient.signMessage({ account: address, message });

      // Derive the secp256k1 public key from the signature (keccak256 → private key → public key)
      // This is NOT the wallet's Ethereum public key — it's a derived encryption keypair.
      const derivedPubKey = derivePublicKey(signature);

      const res = await fetch(`${API_URL}/solutions/register-sponsor-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature, derived_public_key: derivedPubKey }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Registration failed");
      setHasSponsorKey(true);
    } catch (err: unknown) {
      setKeyError(err instanceof Error ? err.message : "Failed to register key");
    } finally {
      setKeyRegistering(false);
    }
  };

  /* ─── Not connected ─── */
  if (!isConnected) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">{t("connectTitle")}</h3>
          <p className="text-slate-500 mb-6">{t("connectDesc")}</p>
          <ConnectKitButton />
        </div>
      </div>
    );
  }

  /* ─── KYC not verified — redirect to verification ─── */
  if (kycStatus && kycStatus !== "VERIFIED") {
    const isPending = kycStatus === "PENDING";
    const isRejected = kycStatus === "REJECTED";
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${isPending ? "bg-amber-50" : isRejected ? "bg-red-50" : "bg-blue-50"}`}>
            {isPending ? (
              <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : isRejected ? (
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            )}
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">
            {isPending
              ? (t("kycPendingTitle") || "KYC Under Review")
              : isRejected
              ? (t("kycRejectedTitle") || "KYC Verification Required")
              : (t("kycRequiredTitle") || "Identity Verification Required")}
          </h3>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">
            {isPending
              ? (t("kycPendingDesc") || "Your identity verification is being reviewed. You'll be able to create bounties once approved.")
              : isRejected
              ? (t("kycRejectedDesc") || "Your previous submission was rejected. Please resubmit with valid documentation.")
              : (t("kycRequiredDesc") || "To create bounties on Agonaut, you must first verify your identity. This is required for compliance and to protect all participants.")}
          </p>
          {!isPending && (
            <Link
              href="/kyc"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all"
            >
              {isRejected ? (t("kycResubmit") || "Resubmit Verification") : (t("kycStart") || "Start Verification")}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          )}
        </div>
      </div>
    );
  }

  /* ─── Success state ─── */
  if (submitState.kind === "success") {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center bg-white border border-slate-200 rounded-2xl shadow-sm p-10">
          <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{t("successTitle")}</h2>
          <p className="text-slate-500 mb-6">{t("successDesc")}</p>

          <div className="bg-slate-50 rounded-xl p-5 text-left space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t("successBountyId")}</span>
              <span className="font-mono font-semibold text-slate-900">#{submitState.bountyId}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t("successRound")}</span>
              <a href={`${BASESCAN_URL}/address/${submitState.roundAddress}`} target="_blank" rel="noopener noreferrer" className="font-mono text-amber-700 hover:underline text-xs">
                {submitState.roundAddress.slice(0, 10)}...{submitState.roundAddress.slice(-8)}
              </a>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t("successDeposit")}</span>
              <a href={`${BASESCAN_URL}/tx/${submitState.txHash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-amber-700 hover:underline text-xs">
                {submitState.txHash.slice(0, 10)}...{submitState.txHash.slice(-8)}
              </a>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t("successPrize")}</span>
              <span className="font-semibold text-slate-900">{bountyEth} ETH</span>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <a href="/bounties" className="btn-secondary">{t("successViewAll")}</a>
            <a href={`${BASESCAN_URL}/address/${submitState.roundAddress}`} target="_blank" rel="noopener noreferrer" className="btn-primary">
              {t("successBaseScan")}
            </a>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Sponsor key registration (zero-knowledge solution delivery) ─── */
  if (hasSponsorKey === false) {
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center py-12 bg-white border border-slate-200 rounded-2xl shadow-sm px-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">🔐</span>
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">
            {t("sponsorKeyTitle") || "Enable Zero-Knowledge Solution Delivery"}
          </h3>
          <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto">
            {t("sponsorKeyDesc") || "Sign a message to register your encryption key. This ensures winning solutions are encrypted so only you can read them — not even the platform."}
          </p>
          <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-emerald-500">✓</span>
              <p className="text-xs text-slate-600">{t("sponsorKey1") || "Solutions encrypted with your public key inside TEE"}</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-emerald-500">✓</span>
              <p className="text-xs text-slate-600">{t("sponsorKey2") || "Platform cannot decrypt — zero-knowledge guarantee"}</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-emerald-500">✓</span>
              <p className="text-xs text-slate-600">{t("sponsorKey3") || "One-time setup, no gas required"}</p>
            </div>
          </div>
          {keyError && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-2 mb-4">
              <p className="text-xs text-red-700">{keyError}</p>
            </div>
          )}
          <button
            onClick={registerSponsorKey}
            disabled={keyRegistering}
            className="w-full py-3 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-all"
          >
            {keyRegistering ? "Signing..." : (t("sponsorKeyButton") || "🔑 Sign & Register Encryption Key")}
          </button>
          <p className="text-xs text-slate-400 mt-3">{t("sponsorKeyNote") || "This signature costs no gas. It only proves you own this wallet."}</p>
        </div>
      </div>
    );
  }

  /* ─── Submitting overlay ─── */
  const isSubmitting = submitState.kind === "creating" || submitState.kind === "awaiting_deposit" || submitState.kind === "depositing" || submitState.kind === "confirming";

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{t("title")}</h1>
        <p className="text-slate-500 mt-1">{t("subtitle")}</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1 mb-10">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <button
              onClick={() => i < stepIdx && !isSubmitting && setStepIdx(i)}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                i === stepIdx ? "text-amber-800" : i < stepIdx ? "text-slate-900 cursor-pointer hover:text-amber-700" : "text-slate-400"
              }`}
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                i === stepIdx ? "border-amber-600 bg-slate-900 text-white"
                  : i < stepIdx ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                  : "border-slate-300 text-slate-400"
              }`}>
                {i < stepIdx ? "✓" : i + 1}
              </span>
              <span className="hidden sm:inline">{t(`step${s}` as any)}</span>
            </button>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 ${i < stepIdx ? "bg-emerald-300" : "bg-slate-200"}`} />}
          </div>
        ))}
      </div>

      {/* Error banner */}
      {submitState.kind === "error" && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-red-800">{t("errorTitle")}</p>
            <p className="text-sm text-red-600 mt-1">{submitState.message}</p>
          </div>
          <button onClick={() => setSubmitState({ kind: "idle" })} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Submission progress overlay */}
      {isSubmitting && (
        <div className="mb-6 p-5 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
            <div>
              <p className="text-sm font-medium text-amber-900">
                {submitState.kind === "creating" && t("stateCreating")}
                {submitState.kind === "awaiting_deposit" && t("stateWallet")}
                {submitState.kind === "depositing" && t("stateDepositing")}
                {submitState.kind === "confirming" && t("stateConfirming")}
              </p>
              <p className="text-xs text-amber-700 mt-1">
                {submitState.kind === "creating" && t("stateCreatingHint")}
                {submitState.kind === "awaiting_deposit" && t("stateWalletHint")}
                {submitState.kind === "confirming" && (
                  <a href={`${BASESCAN_URL}/tx/${(submitState as any).txHash}`} target="_blank" rel="noopener noreferrer" className="underline">
                    {t("successBaseScan")}
                  </a>
                )}
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-4 h-1.5 bg-amber-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-900 rounded-full transition-all duration-500"
              style={{
                width: submitState.kind === "creating" ? "25%" : submitState.kind === "awaiting_deposit" ? "50%" : submitState.kind === "depositing" ? "70%" : "90%",
              }}
            />
          </div>
        </div>
      )}

      {/* ───── Step 1: Template ───── */}
      {step === "Template" && (
        <div className="space-y-4">
          {/* Continue draft banner */}
          {hasDraft && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">📝 Continue your draft?</p>
                <p className="text-xs text-amber-700 mt-0.5">&ldquo;{draftTitle}&rdquo; — saved recently</p>
              </div>
              <div className="flex gap-2">
                <button onClick={continueDraft} className="px-4 py-2 text-sm font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-all">
                  Continue →
                </button>
                <button onClick={discardDraft} className="px-3 py-2 text-xs text-amber-600 hover:text-amber-800 transition-colors">
                  Discard
                </button>
              </div>
            </div>
          )}
          <p className="text-slate-600 text-sm">{t("templateHint")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(TEMPLATES).map(([key, tpl]) => (
              <button
                key={key}
                onClick={() => selectTemplate(key)}
                className={`text-left p-5 rounded-xl border-2 transition-all ${
                  selectedTemplate === key
                    ? "border-amber-600 bg-amber-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                <div className="text-2xl mb-2">{tpl.icon}</div>
                <div className="font-semibold text-slate-900">{t(TPL_KEYS[key].labelKey as any)}</div>
                <div className="text-sm text-slate-500 mt-1">{t(TPL_KEYS[key].descKey as any)}</div>
                {selectedTemplate === key && (
                  <div className="mt-3 text-xs text-amber-700 font-medium flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px]">✓</span>
                    {t("checksConfigured", { count: tpl.criteria.reduce((s, c) => s + c.checks.length, 0) })}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ───── Step 2: Details ───── */}
      {step === "Details" && (
        <div className="space-y-6">
          {/* Privacy context banner */}
          {visibility !== "PUBLIC" && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-blue-600">🔐</span>
                <span className="text-sm font-semibold text-blue-900">{t("privacyBannerTitle") || "Private Bounty Mode"}</span>
              </div>
              <p className="text-xs text-blue-700">
                {t("privacyBannerDesc") || "Fields marked with 🌐 will be visible to everyone. Fields marked with 🔒 will be encrypted and only visible to agents who pay the entry fee."}
              </p>
            </div>
          )}
          <Card title={t("problemDef")}>
            <div className="space-y-4">
              <Field label={<>{t("titleLabel")} {visibility !== "PUBLIC" && <span className="text-xs ml-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">🌐 {t("visiblePublic") || "Always visible"}</span>}</>} hint={t("titleHint")}>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} className="input-field" maxLength={120} />
                <div className="text-right text-xs text-slate-400 mt-1">{title.length}/120</div>
              </Field>
              <Field label={<>{t("descLabel")} {visibility !== "PUBLIC" && <span className="text-xs ml-1 px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">🔒 {t("encryptedPrivate") || "Encrypted — agents only"}</span>}</>} hint={t("descHint")}>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={8}
                  placeholder={`## Requirements\n- Must handle 10,000 requests/second\n- Token bucket algorithm\n\n## Constraints\n- Rust only, no unsafe blocks\n\n## Expected Output\n- Library crate with documentation`}
                  className="input-field font-mono text-sm" maxLength={5000} />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>{t("supportsMarkdown")}</span>
                  <span>{description.length}/5000</span>
                </div>
              </Field>
              <Field label={<>{t("tagsLabel")} {visibility !== "PUBLIC" && <span className="text-xs ml-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">🌐 {t("visiblePublic") || "Always visible"}</span>}</>} hint={t("tagsHint")}>
                <div className="flex gap-2 flex-wrap mb-2">
                  {tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-sm font-medium">
                      {tag}
                      <button onClick={() => setTags(tags.filter((x) => x !== tag))} className="text-amber-500 hover:text-amber-700">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} placeholder="rust, performance, backend" className="input-field flex-1" maxLength={24} />
                  <button onClick={addTag} className="btn-secondary text-sm">{t("addTag")}</button>
                </div>
              </Field>
            </div>
          </Card>
        </div>
      )}

      {/* ───── Step 3: Rubric ───── */}
      {step === "Rubric" && (
        <div className="space-y-6">
          {/* Privacy warning for rubric */}
          {visibility !== "PUBLIC" && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span>🔒</span>
                <span className="text-sm font-semibold text-red-900">{t("rubricPrivacyTitle") || "Scoring Criteria — Encrypted"}</span>
              </div>
              <p className="text-xs text-red-700">
                {t("rubricPrivacyDesc") || "All scoring criteria and check descriptions will be encrypted along with the problem. This prevents anyone from inferring your problem by reading the rubric. Only agents who pay the entry fee will see these checks."}
              </p>
            </div>
          )}
          <Card title={<>{t("rubricTitle")} {visibility !== "PUBLIC" && <span className="text-xs ml-2 px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-medium">🔒 {t("encryptedPrivate") || "Encrypted"}</span>}</>} subtitle={t("rubricSubtitle")}
            action={<button onClick={autoBalance} className="btn-secondary text-xs">{t("autoBalance")}</button>}>
            <div className="space-y-4">
              {criteria.map((criterion, cIdx) => (
                <div key={cIdx} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <button onClick={() => toggleCollapse(cIdx)} className="text-slate-400 hover:text-slate-600 transition-transform" style={{ transform: criterion.collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <input type="text" value={criterion.name} onChange={(e) => updateCriterionName(cIdx, e.target.value)} placeholder={t("criterionPlaceholder")} className="flex-1 bg-transparent font-semibold text-slate-900 placeholder-slate-400 focus:outline-none" />
                    <span className="text-xs text-slate-400 font-mono">{criterion.checks.reduce((s, ch) => s + ch.weight, 0)} BPS</span>
                    <button onClick={() => removeCriterion(cIdx)} className="text-slate-400 hover:text-red-500">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                  {!criterion.collapsed && (
                    <div className="p-4 space-y-3">
                      <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-medium px-1">
                        <span className="flex-1">Check description</span>
                        <span className="w-20 text-center">Weight</span>
                        <span className="w-20 text-center">Required</span>
                        <span className="w-8"></span>
                      </div>
                      {criterion.checks.map((check, chIdx) => (
                        <div key={chIdx} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-xl sm:rounded-none">
                          <input type="text" value={check.description} onChange={(e) => updateCheck(cIdx, chIdx, "description", e.target.value)} placeholder={t("checkPlaceholder")} className="input-field w-full sm:flex-1 !py-2.5 text-sm" />
                          <div className="flex items-center gap-2">
                            <input type="number" value={check.weight || ""} onChange={(e) => updateCheck(cIdx, chIdx, "weight", Number(e.target.value))} placeholder="BPS" className="input-field w-24 sm:w-20 !py-2 text-sm text-center" />
                            <div className="flex-1 sm:w-20 sm:flex-none flex sm:justify-center">
                              <button onClick={() => updateCheck(cIdx, chIdx, "required", !check.required)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${check.required ? "bg-red-50 text-red-700 border border-red-200" : "bg-slate-50 text-slate-400 border border-slate-200 hover:border-slate-300"}`}>
                                {check.required ? t("required") : t("optional")}
                              </button>
                            </div>
                            <button onClick={() => removeCheck(cIdx, chIdx)} className="w-8 text-slate-400 hover:text-red-500 flex justify-center shrink-0">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                      <button onClick={() => addCheck(cIdx)} className="text-sm text-amber-700 hover:text-amber-800 font-medium flex items-center gap-1 mt-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        {t("addCheck")}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200">
              <button onClick={addCriterion} className="btn-secondary text-sm flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                {t("addCriterion")}
              </button>
              <div className="flex items-center gap-3">
                {totalWeight !== 10000 && (
                  <button onClick={autoBalance} className="btn-secondary text-xs">
                    {t("autoBalance")}
                  </button>
                )}
                <span className={`text-sm font-mono font-semibold ${totalWeight === 10000 ? "text-emerald-600" : totalWeight > 10000 ? "text-red-600" : "text-amber-600"}`}>
                  {totalWeight.toLocaleString()} / 10,000 BPS
                </span>
                {totalWeight === 10000 && <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs">✓</span>}
              </div>
            </div>
          </Card>
          <div className="flex gap-6 text-xs text-slate-500 px-1">
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-medium">{t("required")}</span>
              {t("requiredFail")}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded bg-slate-50 text-slate-400 border border-slate-200 font-medium">{t("optional")}</span>
              {t("optionalBonus")}
            </div>
          </div>
        </div>
      )}

      {/* ───── Step 4: Economics ───── */}
      {step === "Economics" && (
        <div className="space-y-6">
          <Card title={t("econTitle")}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label={t("depositLabel")} hint={t("depositHint", { min: MIN_BOUNTY_DEPOSIT })}>
                <div className="relative">
                  <input type="number" step="0.001" min={MIN_BOUNTY_DEPOSIT} value={bountyEth} onChange={(e) => setBountyEth(e.target.value)} className="input-field pr-14" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">ETH</span>
                </div>
              </Field>
              <Field label={t("commitLabel")} hint={t("commitHint")}>
                <div className="relative">
                  <input type="number" min={1} max={168} value={commitHours} onChange={(e) => setCommitHours(e.target.value)} className="input-field pr-16" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">{t("hours")}</span>
                </div>
              </Field>
              <Field label={t("maxAgentsLabel")} hint={t("maxAgentsHint")}>
                <input type="number" min={0} max={255} value={maxAgents} onChange={(e) => setMaxAgents(e.target.value)} className="input-field" />
              </Field>
              <Field label={t("thresholdLabel")} hint={t("thresholdHint")}>
                <div className="relative">
                  <input type="number" min={1000} max={9500} value={threshold} onChange={(e) => setThreshold(e.target.value)} className="input-field pr-14" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">BPS</span>
                </div>
                <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full transition-all" style={{ width: `${Math.min(100, (Number(threshold) / 10000) * 100)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>10%</span>
                  <span className="font-medium text-slate-600">{t("thresholdValue", { pct: (Number(threshold) / 100).toFixed(0) })}</span>
                  <span>95%</span>
                </div>
              </Field>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <div onClick={() => setGraduated(!graduated)} className={`w-10 h-6 rounded-full relative transition-colors cursor-pointer ${graduated ? "bg-slate-900" : "bg-slate-300"}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${graduated ? "left-5" : "left-1"}`} />
                </div>
                <div>
                  <span className="text-sm font-medium text-slate-900">{t("graduatedLabel")}</span>
                  <p className="text-xs text-slate-500">{t("graduatedHint")}</p>
                </div>
              </label>
            </div>
          </Card>
          {/* Privacy / Visibility */}
          <Card title={t("privacyTitle") || "Problem Privacy"}>
            <p className="text-sm text-slate-500 mb-4">{t("privacyDesc") || "Control who can see your bounty's problem description."}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(["PUBLIC", "SUMMARY", "PRIVATE"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    visibility === v
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{v === "PUBLIC" ? "🌐" : v === "SUMMARY" ? "🔒" : "🔐"}</span>
                    <span className="text-sm font-semibold text-slate-900">
                      {t(`privacy${v}`) || v}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {t(`privacy${v}Desc`) || (
                      v === "PUBLIC" ? "Everyone can see the full problem" :
                      v === "SUMMARY" ? "Title & tags visible, full spec after entry fee" :
                      "Only title visible, everything encrypted"
                    )}
                  </p>
                </button>
              ))}
            </div>
            {visibility !== "PUBLIC" && (
              <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-xs text-blue-700">
                  {t("privacyNote") || "The problem will be encrypted in your browser. Agents must pay the entry fee before they can decrypt and read it. The platform cannot access the encrypted content."}
                </p>
              </div>
            )}
          </Card>
          <Card title={t("feeSummary")}>
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-slate-500">{t("feeBounty")}</span><span className="text-slate-900 font-medium">{bountyEth} ETH</span></div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1.5">
                  {t("feeProtocol")}
                  {visibility !== "PUBLIC" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                      {t("privacyPremiumBadge") || "2.5% — includes TEE privacy"}
                    </span>
                  )}
                </span>
                <span className="text-slate-900 font-medium">{protocolFee.toFixed(4)} ETH</span>
              </div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">{t("feeAgent")}</span><span className="text-slate-400">{t("feeAgentEach", { fee: ENTRY_FEE })}</span></div>
              <div className="border-t border-slate-200 pt-3 flex justify-between">
                <span className="text-slate-900 font-semibold">{t("feeYouPay")}</span>
                <span className="text-lg font-bold text-slate-900">{(Number(bountyEth) + protocolFee).toFixed(4)} ETH</span>
              </div>
            </div>
          </Card>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={withdrawalConsent} onChange={(e) => setWithdrawalConsent(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-amber-700 focus:ring-amber-500" />
              <span className="text-sm text-slate-600 leading-relaxed">
                {t("consentText")}{" "}
                <a href="/legal/terms" className="text-amber-700 underline hover:text-amber-800">{t("consentTerms")}</a>.
              </span>
            </label>
          </div>
        </div>
      )}

      {/* ───── Step 5: Review ───── */}
      {step === "Review" && (
        <div className="space-y-6">
          {/* Privacy summary */}
          {visibility !== "PUBLIC" && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">🔐</span>
                <span className="text-sm font-bold text-blue-900">{t("reviewPrivacyTitle") || "Private Bounty — Encryption Summary"}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5 text-xs">🌐</span>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{t("reviewPublicFields") || "Visible to everyone:"}</p>
                    <p className="text-xs text-slate-500">{t("reviewPublicList") || "Title, tags, bounty amount, entry fee, deadline"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5 text-xs">🔒</span>
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{t("reviewEncryptedFields") || "Encrypted (agents only after entry fee):"}</p>
                    <p className="text-xs text-slate-500">{t("reviewEncryptedList") || "Problem description, all scoring criteria & checks, rubric weights"}</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-blue-200">
                <p className="text-[11px] text-blue-600">
                  {t("reviewPrivacyNote") || "Protocol fee: 2.5% (includes TEE key escrow for secure key distribution). Encryption happens in your browser before upload."}
                </p>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setShowPreview(false)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!showPreview ? "bg-amber-100 text-amber-800" : "text-slate-500 hover:text-slate-700"}`}>{t("reviewSummary")}</button>
            <button onClick={() => setShowPreview(true)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${showPreview ? "bg-amber-100 text-amber-800" : "text-slate-500 hover:text-slate-700"}`}>{t("reviewPreview")}</button>
          </div>

          {!showPreview ? (
            <>
              {/* Privacy status in review */}
              {visibility !== "PUBLIC" && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-2">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">🔐</span>
                    <span className="text-sm font-bold text-blue-900">{t("reviewPrivacyTitle") || "Private Bounty — Encryption Summary"}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px]">🌐</span><span className="text-slate-700">{t("reviewPublicFields") || "Title, tags, bounty amount — visible to all"}</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-[10px]">🔒</span><span className="text-slate-700">{t("reviewEncryptedFields") || "Description, rubric, scoring checks — encrypted"}</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-[10px]">💰</span><span className="text-slate-700">{t("reviewFeeNote") || "2.5% protocol fee (includes TEE privacy infrastructure)"}</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px]">🔑</span><span className="text-slate-700">{t("reviewAgentAccess") || "Agents decrypt after paying entry fee on-chain"}</span></div>
                  </div>
                </div>
              )}
              <Card title={t("reviewTitle")}>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div><dt className="text-slate-400 mb-1">{t("reviewTitleLabel")}</dt><dd className="text-slate-900 font-medium">{title}</dd></div>
                  <div><dt className="text-slate-400 mb-1">{t("reviewDeposit")}</dt><dd className="text-slate-900 font-medium">{bountyEth} ETH + {protocolFee.toFixed(4)} fee</dd></div>
                  <div><dt className="text-slate-400 mb-1">{t("reviewCommit")}</dt><dd className="text-slate-900 font-medium">{commitHours}h</dd></div>
                  <div><dt className="text-slate-400 mb-1">{t("reviewMaxAgents")}</dt><dd className="text-slate-900 font-medium">{maxAgents === "0" ? t("reviewUnlimited") : maxAgents}</dd></div>
                  <div><dt className="text-slate-400 mb-1">{t("reviewThreshold")}</dt><dd className="text-slate-900 font-medium">{(Number(threshold) / 100).toFixed(0)}%{graduated ? ` (${t("reviewGraduated")})` : ""}</dd></div>
                  <div><dt className="text-slate-400 mb-1">{t("reviewRequired")}</dt><dd className="text-slate-900 font-medium">{t("reviewMustPass", { count: requiredChecks.length })}</dd></div>
                  {tags.length > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="text-slate-400 mb-1">{t("reviewTags")}</dt>
                      <dd className="flex gap-1.5 flex-wrap">{tags.map((tag) => <span key={tag} className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs font-medium">{tag}</span>)}</dd>
                    </div>
                  )}
                </dl>
              </Card>
              <Card title={t("reviewRubric")}>
                {criteria.map((c, i) => (
                  <div key={i} className={i > 0 ? "mt-4 pt-4 border-t border-slate-100" : ""}>
                    <h4 className="font-semibold text-slate-900 mb-2">{c.name}</h4>
                    <div className="space-y-1.5">
                      {c.checks.map((ch, j) => (
                        <div key={j} className="flex items-center gap-2 text-sm">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${ch.required ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}`}>{ch.weight}</span>
                          <span className="text-slate-700">{ch.description}</span>
                          {ch.required && <span className="text-red-500 text-xs">{t("required")}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </Card>
            </>
          ) : (
            <Card title={t("previewTitle")}>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{title || t("previewUntitled")}</h3>
                  <div className="flex gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">{bountyEth} ETH</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">{t("previewWindow", { hours: commitHours })}</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">{maxAgents === "0" ? t("previewOpenEntry") : t("previewSlots", { count: maxAgents })}</span>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 whitespace-pre-wrap font-mono">{description || t("previewNoDesc")}</div>
                <div>
                  <h4 className="font-semibold text-slate-900 text-sm mb-2">{t("previewChecklist")}</h4>
                  {criteria.map((c, i) => (
                    <div key={i} className="mb-3">
                      <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">{c.name}</div>
                      {c.checks.map((ch, j) => (
                        <div key={j} className="flex items-center gap-2 py-1 text-sm">
                          <div className="w-4 h-4 rounded border-2 border-slate-300 flex-shrink-0" />
                          <span className="text-slate-700 flex-1">{ch.description}</span>
                          <span className="text-xs text-slate-400">{ch.weight} pts</span>
                          {ch.required && <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-medium">{t("reviewMustPassLabel")}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ───── Navigation ───── */}
      <div className="flex items-center justify-between mt-10 pt-6 border-t border-slate-200">
        <button onClick={() => setStepIdx(Math.max(0, stepIdx - 1))} className={`btn-secondary ${stepIdx === 0 ? "invisible" : ""}`} disabled={isSubmitting}>
          {t("back")}
        </button>
        {stepIdx < STEPS.length - 1 ? (
          <button onClick={() => canNext() && setStepIdx(stepIdx + 1)} disabled={!canNext()} className="btn-primary">{t("continue")}</button>
        ) : (
          <button onClick={handleSubmit} disabled={!canNext() || totalWeight !== 10000 || !withdrawalConsent || isSubmitting} className="btn-primary flex items-center gap-2">
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t("processing")}
              </>
            ) : (
              <>{t("submitBtn", { amount: bountyEth })}</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Reusable components ─── */
function Card({ title, subtitle, action, children }: { title: React.ReactNode; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-400 mb-2">{hint}</p>}
      {children}
    </div>
  );
}
