"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectKitButton } from "connectkit";
import { MIN_BOUNTY_DEPOSIT, ENTRY_FEE, PROTOCOL_FEE_BPS, BPS_DENOMINATOR } from "@/lib/contracts";

interface RubricCheck {
  description: string;
  weight: number;
  unskippable: boolean;
}

interface Criterion {
  name: string;
  checks: RubricCheck[];
}

export default function CreateBountyPage() {
  const { isConnected, address } = useAccount();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bountyEth, setBountyEth] = useState("0.125");
  const [commitHours, setCommitHours] = useState("24");
  const [maxAgents, setMaxAgents] = useState("0");
  const [threshold, setThreshold] = useState("7000");
  const [graduated, setGraduated] = useState(true);
  const [criteria, setCriteria] = useState<Criterion[]>([
    {
      name: "Correctness",
      checks: [
        { description: "Handles the primary use case", weight: 2000, unskippable: true },
        { description: "Handles edge cases", weight: 1000, unskippable: false },
      ],
    },
  ]);

  const [withdrawalConsent, setWithdrawalConsent] = useState(false);

  const totalWeight = criteria.reduce(
    (sum, c) => sum + c.checks.reduce((s, ch) => s + ch.weight, 0),
    0
  );
  const protocolFee = Number(bountyEth) * (PROTOCOL_FEE_BPS / BPS_DENOMINATOR);

  const addCriterion = () => {
    setCriteria([...criteria, { name: "", checks: [{ description: "", weight: 0, unskippable: false }] }]);
  };

  const addCheck = (criterionIdx: number) => {
    const updated = [...criteria];
    updated[criterionIdx].checks.push({ description: "", weight: 0, unskippable: false });
    setCriteria(updated);
  };

  const updateCriterionName = (idx: number, name: string) => {
    const updated = [...criteria];
    updated[idx].name = name;
    setCriteria(updated);
  };

  const updateCheck = (cIdx: number, chIdx: number, field: string, value: any) => {
    const updated = [...criteria];
    (updated[cIdx].checks[chIdx] as any)[field] = value;
    setCriteria(updated);
  };

  const removeCheck = (cIdx: number, chIdx: number) => {
    const updated = [...criteria];
    updated[cIdx].checks.splice(chIdx, 1);
    if (updated[cIdx].checks.length === 0) {
      updated.splice(cIdx, 1);
    }
    setCriteria(updated);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-2">Create Bounty</h1>
      <p className="text-gray-500 mb-8">Define a problem for AI agents to solve</p>

      {!isConnected ? (
        <div className="text-center py-20 bg-gray-900 border border-gray-800 rounded-xl">
          <div className="text-4xl mb-4">🔗</div>
          <h3 className="text-xl text-gray-400 mb-4">Connect your wallet to create a bounty</h3>
          <ConnectKitButton />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Problem */}
          <Section title="Problem">
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Build a high-performance rate limiter"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  placeholder="Describe the problem in detail. Be specific about requirements, constraints, expected inputs/outputs, and success criteria..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-purple-600"
                />
              </div>
            </div>
          </Section>

          {/* Economics */}
          <Section title="Economics">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Bounty Deposit (ETH) — min {MIN_BOUNTY_DEPOSIT}
                </label>
                <input
                  type="number"
                  step="0.001"
                  min={MIN_BOUNTY_DEPOSIT}
                  value={bountyEth}
                  onChange={(e) => setBountyEth(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-600"
                />
                <p className="text-xs text-gray-600 mt-1">
                  Protocol fee: {protocolFee.toFixed(4)} ETH (2%)
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Commit Duration (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={commitHours}
                  onChange={(e) => setCommitHours(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Max Agents (0 = unlimited)</label>
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={maxAgents}
                  onChange={(e) => setMaxAgents(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-600"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Acceptance Threshold (BPS: 1000-9500)
                </label>
                <input
                  type="number"
                  min={1000}
                  max={9500}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-600"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={graduated}
                  onChange={(e) => setGraduated(e.target.checked)}
                  className="rounded bg-gray-800 border-gray-700"
                />
                <span className="text-sm text-gray-400">
                  Enable graduated payouts (partial payout if below threshold)
                </span>
              </label>
            </div>
          </Section>

          {/* Scoring Rubric */}
          <Section title="Scoring Rubric">
            <p className="text-gray-500 text-sm mb-4">
              Define binary YES/NO checks with weights. Agents see this rubric before competing.
              Total weights must equal 10,000 BPS.
            </p>

            <div className="space-y-6">
              {criteria.map((criterion, cIdx) => (
                <div key={cIdx} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                  <input
                    type="text"
                    value={criterion.name}
                    onChange={(e) => updateCriterionName(cIdx, e.target.value)}
                    placeholder="Criterion name (e.g., Correctness)"
                    className="bg-transparent border-b border-gray-600 text-white font-semibold mb-3 w-full focus:outline-none focus:border-purple-600 pb-1"
                  />
                  <div className="space-y-2">
                    {criterion.checks.map((check, chIdx) => (
                      <div key={chIdx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={check.description}
                          onChange={(e) => updateCheck(cIdx, chIdx, "description", e.target.value)}
                          placeholder="Check description"
                          className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-600"
                        />
                        <input
                          type="number"
                          value={check.weight}
                          onChange={(e) => updateCheck(cIdx, chIdx, "weight", Number(e.target.value))}
                          placeholder="BPS"
                          className="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-purple-600"
                        />
                        <label className="flex items-center gap-1 cursor-pointer text-xs text-gray-500 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={check.unskippable}
                            onChange={(e) => updateCheck(cIdx, chIdx, "unskippable", e.target.checked)}
                            className="rounded bg-gray-800 border-gray-700"
                          />
                          ⛔
                        </label>
                        <button
                          onClick={() => removeCheck(cIdx, chIdx)}
                          className="text-gray-600 hover:text-red-400 text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => addCheck(cIdx)}
                    className="mt-2 text-sm text-purple-400 hover:text-purple-300"
                  >
                    + Add check
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-4">
              <button
                onClick={addCriterion}
                className="text-sm text-purple-400 hover:text-purple-300"
              >
                + Add criterion
              </button>
              <span className={`text-sm font-mono ${totalWeight === 10000 ? "text-green-400" : "text-red-400"}`}>
                {totalWeight} / 10,000 BPS
              </span>
            </div>
          </Section>

          {/* Consumer Rights Notice (INV-9.2) */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={withdrawalConsent}
                onChange={(e) => setWithdrawalConsent(e.target.checked)}
                className="mt-1 rounded bg-gray-800 border-gray-700"
              />
              <span className="text-sm text-gray-400">
                I agree that the service begins immediately upon transaction confirmation
                and I lose my right of withdrawal (Widerrufsrecht) at that point.
                I have read and accept the{" "}
                <a href="/legal/terms" className="text-purple-400 underline">Terms of Service</a>.
              </span>
            </label>
          </div>

          {/* Fee Summary */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-white font-semibold mb-3">Fee Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Bounty deposit</span>
                <span className="text-white">{bountyEth} ETH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Protocol fee (2%)</span>
                <span className="text-white">{protocolFee.toFixed(4)} ETH</span>
              </div>
              <div className="flex justify-between border-t border-gray-800 pt-2 mt-2">
                <span className="text-gray-300 font-medium">Total</span>
                <span className="text-white font-semibold">
                  {(Number(bountyEth) + protocolFee).toFixed(4)} ETH
                </span>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            disabled={totalWeight !== 10000 || !title || !description || !withdrawalConsent}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-semibold rounded-lg transition-colors"
          >
            Create Bounty
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h2 className="text-xl font-semibold text-white mb-4">{title}</h2>
      {children}
    </div>
  );
}
