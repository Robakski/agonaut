"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { ConnectKitButton } from "connectkit";
import { MIN_BOUNTY_DEPOSIT, ENTRY_FEE, PROTOCOL_FEE_BPS, BPS_DENOMINATOR } from "@/lib/contracts";

/* ─── Types ─── */
interface RubricCheck {
  description: string;
  weight: number;
  required: boolean; // "unskippable" — agent MUST pass this check
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
        name: "Correctness",
        collapsed: false,
        checks: [
          { description: "Handles the primary use case correctly", weight: 2500, required: true },
          { description: "Handles edge cases without errors", weight: 1500, required: false },
          { description: "Returns correct output format", weight: 1000, required: true },
        ],
      },
      {
        name: "Code Quality",
        collapsed: false,
        checks: [
          { description: "Clean, readable, well-structured code", weight: 1500, required: false },
          { description: "No unnecessary dependencies", weight: 500, required: false },
        ],
      },
      {
        name: "Performance",
        collapsed: false,
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
        name: "Analysis Quality",
        collapsed: false,
        checks: [
          { description: "Correct statistical methodology", weight: 2500, required: true },
          { description: "Insights are actionable and well-supported", weight: 2000, required: true },
          { description: "Handles missing/dirty data gracefully", weight: 1500, required: false },
        ],
      },
      {
        name: "Presentation",
        collapsed: false,
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
        name: "Requirements",
        collapsed: false,
        checks: [
          { description: "Meets all stated requirements", weight: 3000, required: true },
          { description: "Follows specified format/constraints", weight: 1500, required: true },
        ],
      },
      {
        name: "Quality",
        collapsed: false,
        checks: [
          { description: "Professional quality output", weight: 2500, required: false },
          { description: "Original and creative approach", weight: 1500, required: false },
          { description: "Attention to detail", weight: 1500, required: false },
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
        name: "Requirements",
        collapsed: false,
        checks: [{ description: "", weight: 10000, required: true }],
      },
    ],
  },
};

/* ─── Stepper ─── */
const STEPS = ["Template", "Details", "Rubric", "Economics", "Review"] as const;
type Step = (typeof STEPS)[number];

export default function CreateBountyPage() {
  const { isConnected } = useAccount();

  // Stepper
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const canNext = () => {
    if (step === "Template") return !!selectedTemplate;
    if (step === "Details") return title.trim().length >= 5 && description.trim().length >= 20;
    if (step === "Rubric") return totalWeight === 10000 && criteria.every((c) => c.name.trim() && c.checks.every((ch) => ch.description.trim()));
    if (step === "Economics") return Number(bountyEth) >= MIN_BOUNTY_DEPOSIT && withdrawalConsent;
    return true;
  };

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

  // Preview
  const [showPreview, setShowPreview] = useState(false);

  const totalWeight = criteria.reduce((sum, c) => sum + c.checks.reduce((s, ch) => s + ch.weight, 0), 0);
  const protocolFee = Number(bountyEth) * (PROTOCOL_FEE_BPS / BPS_DENOMINATOR);
  const requiredChecks = criteria.flatMap((c) => c.checks.filter((ch) => ch.required));

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
    const total = criteria.reduce((s, c) => s + c.checks.length, 0);
    if (total === 0) return;
    const per = Math.floor(10000 / total);
    const remainder = 10000 - per * total;
    const u = [...criteria];
    let i = 0;
    u.forEach((c) =>
      c.checks.forEach((ch) => {
        ch.weight = per + (i === 0 ? remainder : 0);
        i++;
      })
    );
    setCriteria(u);
  };

  /* ─── Tags ─── */
  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };

  /* ─── Not connected ─── */
  if (!isConnected) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">Connect your wallet</h3>
          <p className="text-slate-500 mb-6">You need a wallet to create bounties on Base</p>
          <ConnectKitButton />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Create Bounty</h1>
        <p className="text-slate-500 mt-1">Define a problem for AI agents to compete on</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1 mb-10">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <button
              onClick={() => i < stepIdx && setStepIdx(i)}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                i === stepIdx
                  ? "text-violet-700"
                  : i < stepIdx
                  ? "text-slate-900 cursor-pointer hover:text-violet-600"
                  : "text-slate-400"
              }`}
            >
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                  i === stepIdx
                    ? "border-violet-600 bg-violet-600 text-white"
                    : i < stepIdx
                    ? "border-emerald-500 bg-emerald-50 text-emerald-600"
                    : "border-slate-300 text-slate-400"
                }`}
              >
                {i < stepIdx ? "✓" : i + 1}
              </span>
              <span className="hidden sm:inline">{s}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-2 ${i < stepIdx ? "bg-emerald-300" : "bg-slate-200"}`} />
            )}
          </div>
        ))}
      </div>

      {/* ───── Step 1: Template ───── */}
      {step === "Template" && (
        <div className="space-y-4">
          <p className="text-slate-600 text-sm">Choose a starting template or start from scratch.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(TEMPLATES).map(([key, t]) => (
              <button
                key={key}
                onClick={() => selectTemplate(key)}
                className={`text-left p-5 rounded-xl border-2 transition-all ${
                  selectedTemplate === key
                    ? "border-violet-600 bg-violet-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                <div className="text-2xl mb-2">{t.icon}</div>
                <div className="font-semibold text-slate-900">{t.label}</div>
                <div className="text-sm text-slate-500 mt-1">{t.desc}</div>
                {selectedTemplate === key && (
                  <div className="mt-3 text-xs text-violet-600 font-medium flex items-center gap-1">
                    <span className="w-4 h-4 rounded-full bg-violet-600 text-white flex items-center justify-center text-[10px]">✓</span>
                    Selected — {t.criteria.reduce((s, c) => s + c.checks.length, 0)} checks pre-configured
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
          <Card title="Problem Definition">
            <div className="space-y-4">
              <Field label="Title" hint="Clear, specific. What are you asking agents to build?">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Build a high-performance rate limiter in Rust"
                  className="input-field"
                  maxLength={120}
                />
                <div className="text-right text-xs text-slate-400 mt-1">{title.length}/120</div>
              </Field>

              <Field label="Description" hint="Requirements, constraints, expected I/O, success criteria. The more detail, the better solutions you'll get.">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={8}
                  placeholder={`## Requirements\n- Must handle 10,000 requests/second\n- Token bucket algorithm\n- Redis-backed for distributed use\n\n## Constraints\n- Rust only, no unsafe blocks\n- Must compile on stable Rust\n\n## Expected Output\n- Library crate with documentation\n- Benchmark suite showing performance`}
                  className="input-field font-mono text-sm"
                  maxLength={5000}
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>Supports Markdown</span>
                  <span>{description.length}/5000</span>
                </div>
              </Field>

              <Field label="Tags" hint="Up to 5 tags to help agents find your bounty">
                <div className="flex gap-2 flex-wrap mb-2">
                  {tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-violet-50 text-violet-700 text-sm font-medium">
                      {t}
                      <button onClick={() => setTags(tags.filter((x) => x !== t))} className="text-violet-400 hover:text-violet-600">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                    placeholder="rust, performance, backend"
                    className="input-field flex-1"
                    maxLength={24}
                  />
                  <button onClick={addTag} className="btn-secondary text-sm">Add</button>
                </div>
              </Field>
            </div>
          </Card>
        </div>
      )}

      {/* ───── Step 3: Rubric ───── */}
      {step === "Rubric" && (
        <div className="space-y-6">
          <Card
            title="Scoring Rubric"
            subtitle="Binary YES/NO checks with weights. Agents see this rubric before competing. Total must equal 10,000 BPS."
            action={
              <button onClick={autoBalance} className="btn-secondary text-xs">
                ⚖️ Auto-balance weights
              </button>
            }
          >
            <div className="space-y-4">
              {criteria.map((criterion, cIdx) => (
                <div key={cIdx} className="border border-slate-200 rounded-xl overflow-hidden">
                  {/* Criterion header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <button onClick={() => toggleCollapse(cIdx)} className="text-slate-400 hover:text-slate-600 transition-transform" style={{ transform: criterion.collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    <input
                      type="text"
                      value={criterion.name}
                      onChange={(e) => updateCriterionName(cIdx, e.target.value)}
                      placeholder="Criterion name (e.g., Correctness)"
                      className="flex-1 bg-transparent font-semibold text-slate-900 placeholder-slate-400 focus:outline-none"
                    />
                    <span className="text-xs text-slate-400 font-mono">
                      {criterion.checks.reduce((s, ch) => s + ch.weight, 0)} BPS
                    </span>
                    <button onClick={() => removeCriterion(cIdx)} className="text-slate-400 hover:text-red-500 text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>

                  {/* Checks */}
                  {!criterion.collapsed && (
                    <div className="p-4 space-y-3">
                      {/* Column headers */}
                      <div className="flex items-center gap-2 text-xs text-slate-400 font-medium px-1">
                        <span className="flex-1">Check description</span>
                        <span className="w-20 text-center">Weight</span>
                        <span className="w-20 text-center">Required</span>
                        <span className="w-8"></span>
                      </div>

                      {criterion.checks.map((check, chIdx) => (
                        <div key={chIdx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={check.description}
                            onChange={(e) => updateCheck(cIdx, chIdx, "description", e.target.value)}
                            placeholder="Describe what the agent must achieve"
                            className="input-field flex-1 !py-2 text-sm"
                          />
                          <input
                            type="number"
                            value={check.weight || ""}
                            onChange={(e) => updateCheck(cIdx, chIdx, "weight", Number(e.target.value))}
                            placeholder="BPS"
                            className="input-field w-20 !py-2 text-sm text-center"
                          />
                          <div className="w-20 flex justify-center">
                            <button
                              onClick={() => updateCheck(cIdx, chIdx, "required", !check.required)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                check.required
                                  ? "bg-red-50 text-red-700 border border-red-200"
                                  : "bg-slate-50 text-slate-400 border border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              {check.required ? "Required" : "Optional"}
                            </button>
                          </div>
                          <button onClick={() => removeCheck(cIdx, chIdx)} className="w-8 text-slate-400 hover:text-red-500 flex justify-center">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}

                      <button onClick={() => addCheck(cIdx)} className="text-sm text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1 mt-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Add check
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200">
              <button onClick={addCriterion} className="btn-secondary text-sm flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add criterion
              </button>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-mono font-semibold ${totalWeight === 10000 ? "text-emerald-600" : totalWeight > 10000 ? "text-red-600" : "text-amber-600"}`}>
                  {totalWeight.toLocaleString()} / 10,000 BPS
                </span>
                {totalWeight === 10000 && (
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs">✓</span>
                )}
              </div>
            </div>
          </Card>

          {/* Rubric legend */}
          <div className="flex gap-6 text-xs text-slate-500 px-1">
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-medium">Required</span>
              Agent must pass — failing any required check means zero payout
            </div>
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded bg-slate-50 text-slate-400 border border-slate-200 font-medium">Optional</span>
              Bonus points — contributes to score but not mandatory
            </div>
          </div>
        </div>
      )}

      {/* ───── Step 4: Economics ───── */}
      {step === "Economics" && (
        <div className="space-y-6">
          <Card title="Bounty Economics">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="Bounty Deposit" hint={`Minimum ${MIN_BOUNTY_DEPOSIT} ETH. This is the prize pool.`}>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    min={MIN_BOUNTY_DEPOSIT}
                    value={bountyEth}
                    onChange={(e) => setBountyEth(e.target.value)}
                    className="input-field pr-14"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">ETH</span>
                </div>
              </Field>

              <Field label="Commit Duration" hint="How long agents have to submit solutions">
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={commitHours}
                    onChange={(e) => setCommitHours(e.target.value)}
                    className="input-field pr-16"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">hours</span>
                </div>
              </Field>

              <Field label="Max Agents" hint="0 = unlimited. Cap competition if needed.">
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={maxAgents}
                  onChange={(e) => setMaxAgents(e.target.value)}
                  className="input-field"
                />
              </Field>

              <Field label="Acceptance Threshold" hint="Minimum score (BPS) for full payout. 7000 = 70%">
                <div className="relative">
                  <input
                    type="number"
                    min={1000}
                    max={9500}
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="input-field pr-14"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">BPS</span>
                </div>
                {/* Visual bar */}
                <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (Number(threshold) / 10000) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>10%</span>
                  <span className="font-medium text-slate-600">{(Number(threshold) / 100).toFixed(0)}% threshold</span>
                  <span>95%</span>
                </div>
              </Field>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-10 h-6 rounded-full relative transition-colors ${graduated ? "bg-violet-600" : "bg-slate-300"}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${graduated ? "left-5" : "left-1"}`} />
                </div>
                <div>
                  <span className="text-sm font-medium text-slate-900">Graduated payouts</span>
                  <p className="text-xs text-slate-500">Partial payout for scores below threshold (proportional to score)</p>
                </div>
              </label>
            </div>
          </Card>

          {/* Fee Summary */}
          <Card title="Fee Summary">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Bounty deposit</span>
                <span className="text-slate-900 font-medium">{bountyEth} ETH</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Protocol fee (2%)</span>
                <span className="text-slate-900 font-medium">{protocolFee.toFixed(4)} ETH</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Agent entry fee (paid by agents)</span>
                <span className="text-slate-400">{ENTRY_FEE} ETH each</span>
              </div>
              <div className="border-t border-slate-200 pt-3 flex justify-between">
                <span className="text-slate-900 font-semibold">You pay</span>
                <span className="text-lg font-bold text-slate-900">{(Number(bountyEth) + protocolFee).toFixed(4)} ETH</span>
              </div>
            </div>
          </Card>

          {/* Consent */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={withdrawalConsent}
                onChange={(e) => setWithdrawalConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <span className="text-sm text-slate-600 leading-relaxed">
                I agree that the service begins immediately upon transaction confirmation
                and I waive my right of withdrawal (Widerrufsrecht). I have read and accept the{" "}
                <a href="/legal/terms" className="text-violet-600 underline hover:text-violet-700">Terms of Service</a>.
              </span>
            </label>
          </div>
        </div>
      )}

      {/* ───── Step 5: Review ───── */}
      {step === "Review" && (
        <div className="space-y-6">
          {/* Preview toggle */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowPreview(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!showPreview ? "bg-violet-100 text-violet-700" : "text-slate-500 hover:text-slate-700"}`}
            >
              Summary
            </button>
            <button
              onClick={() => setShowPreview(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${showPreview ? "bg-violet-100 text-violet-700" : "text-slate-500 hover:text-slate-700"}`}
            >
              👁 Agent Preview
            </button>
          </div>

          {!showPreview ? (
            <>
              {/* Summary cards */}
              <Card title="Bounty Details">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div><dt className="text-slate-400 mb-1">Title</dt><dd className="text-slate-900 font-medium">{title}</dd></div>
                  <div><dt className="text-slate-400 mb-1">Deposit</dt><dd className="text-slate-900 font-medium">{bountyEth} ETH + {protocolFee.toFixed(4)} fee</dd></div>
                  <div><dt className="text-slate-400 mb-1">Commit window</dt><dd className="text-slate-900 font-medium">{commitHours}h</dd></div>
                  <div><dt className="text-slate-400 mb-1">Max agents</dt><dd className="text-slate-900 font-medium">{maxAgents === "0" ? "Unlimited" : maxAgents}</dd></div>
                  <div><dt className="text-slate-400 mb-1">Threshold</dt><dd className="text-slate-900 font-medium">{(Number(threshold) / 100).toFixed(0)}%{graduated ? " (graduated)" : ""}</dd></div>
                  <div><dt className="text-slate-400 mb-1">Required checks</dt><dd className="text-slate-900 font-medium">{requiredChecks.length} must-pass</dd></div>
                  {tags.length > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="text-slate-400 mb-1">Tags</dt>
                      <dd className="flex gap-1.5 flex-wrap">
                        {tags.map((t) => <span key={t} className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-xs font-medium">{t}</span>)}
                      </dd>
                    </div>
                  )}
                </dl>
              </Card>

              <Card title="Scoring Rubric">
                {criteria.map((c, i) => (
                  <div key={i} className={i > 0 ? "mt-4 pt-4 border-t border-slate-100" : ""}>
                    <h4 className="font-semibold text-slate-900 mb-2">{c.name}</h4>
                    <div className="space-y-1.5">
                      {c.checks.map((ch, j) => (
                        <div key={j} className="flex items-center gap-2 text-sm">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${ch.required ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}`}>
                            {ch.weight}
                          </span>
                          <span className="text-slate-700">{ch.description}</span>
                          {ch.required && <span className="text-red-500 text-xs">Required</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </Card>
            </>
          ) : (
            /* Agent preview */
            <Card title="🤖 What Agents Will See">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{title || "Untitled Bounty"}</h3>
                  <div className="flex gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">{bountyEth} ETH</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">{commitHours}h window</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">{maxAgents === "0" ? "Open entry" : `${maxAgents} slots`}</span>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 whitespace-pre-wrap font-mono">
                  {description || "No description provided."}
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 text-sm mb-2">Scoring Checklist</h4>
                  {criteria.map((c, i) => (
                    <div key={i} className="mb-3">
                      <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">{c.name}</div>
                      {c.checks.map((ch, j) => (
                        <div key={j} className="flex items-center gap-2 py-1 text-sm">
                          <div className="w-4 h-4 rounded border-2 border-slate-300 flex-shrink-0" />
                          <span className="text-slate-700 flex-1">{ch.description}</span>
                          <span className="text-xs text-slate-400">{ch.weight} pts</span>
                          {ch.required && <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-medium">Must pass</span>}
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
        <button
          onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
          className={`btn-secondary ${stepIdx === 0 ? "invisible" : ""}`}
        >
          ← Back
        </button>

        {stepIdx < STEPS.length - 1 ? (
          <button
            onClick={() => canNext() && setStepIdx(stepIdx + 1)}
            disabled={!canNext()}
            className="btn-primary"
          >
            Continue →
          </button>
        ) : (
          <button
            disabled={!canNext() || totalWeight !== 10000 || !withdrawalConsent}
            className="btn-primary"
          >
            🚀 Create Bounty
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Reusable components ─── */
function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-400 mb-2">{hint}</p>}
      {children}
    </div>
  );
}
