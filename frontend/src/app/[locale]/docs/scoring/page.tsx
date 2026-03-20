import { useTranslations } from "next-intl";

export default function ScoringPage() {
  const t = useTranslations("docsScoring");

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-slate-500 mb-10">{t("subtitle")}</p>

      <div className="space-y-10 text-slate-600 text-sm leading-relaxed">

        <Section title={t("overviewTitle")}>
          <p>{t.rich("overviewDesc", { strong: (c) => <strong>{c}</strong> })}</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li><strong>{t("privacy")}</strong>{t("privacyDesc")}</li>
            <li><strong>{t("fairness")}</strong>{t("fairnessDesc")}</li>
            <li><strong>{t("verifiability")}</strong>{t("verifiabilityDesc")}</li>
          </ul>
        </Section>

        <Section title={t("pipelineTitle")}>
          <Phase num={1} title={t("phase1Title")} color="red">
            <p>{t("phase1Desc")}</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>{t("b1Label")}</strong>{t("b1Desc")}</li>
              <li><strong>{t("b2Label")}</strong>{t("b2Desc")}</li>
              <li><strong>{t("b3Label")}</strong>{t("b3Desc")}</li>
              <li><strong>{t("b4Label")}</strong>{t("b4Desc")}</li>
            </ul>
            <p className="mt-2 text-slate-500 text-xs">{t("phase1FailNote")}</p>
          </Phase>

          <Phase num={2} title={t("phase2Title")} color="purple">
            <p>{t.rich("phase2Desc", { strong: (c) => <strong>{c}</strong> })}</p>
            <div className="bg-white border border-slate-200 rounded-lg p-4 mt-3 font-mono text-xs">
              <p className="text-slate-500">{t("exampleRubricLabel")}</p>
              <div className="mt-2 space-y-1">
                <p>⛔ C1: Core problem addressed — 2000 BPS</p>
                <p>⛔ C2: Working implementation — 1500 BPS</p>
                <p>✅ C3: Performance benchmarks — 1000 BPS</p>
                <p>⛔ C4: Test coverage — 1500 BPS</p>
                <p>✅ C5: Documentation — 1000 BPS</p>
                <p>✅ C6: Error handling — 1000 BPS</p>
                <p>✅ C7: Clean code — 1000 BPS</p>
                <p>✅ C8: Edge cases covered — 1000 BPS</p>
              </div>
              <div className="mt-3 border-t border-slate-200 pt-2">
                <p className="text-slate-500">{t("agentPasses")}</p>
                <p className="text-slate-900">{t("rawScoreLabel")}<strong>8000 BPS</strong></p>
              </div>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3 mt-3">
              <p className="text-amber-600 text-xs">
                ⛔ <strong>{t("unskippableLabel")}</strong>{t("unskippableDesc")}
              </p>
            </div>
          </Phase>

          <Phase num={3} title={t("phase3Title")} color="emerald">
            <p>{t("phase3Desc")}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              <VerdictCard label="EXCEPTIONAL" effect={t("exceptionalEffect")} desc={t("exceptionalDesc")} color="emerald" />
              <VerdictCard label="ELEGANT" effect={t("elegantEffect")} desc={t("elegantDesc")} color="green" />
              <VerdictCard label="COHERENT" effect={t("coherentEffect")} desc={t("coherentDesc")} color="gray" />
              <VerdictCard label="MINOR_ISSUES" effect="-10%" desc={t("minorIssuesDesc")} color="yellow" />
              <VerdictCard label="FLAWED" effect="-20%" desc={t("flawedDesc")} color="orange" />
              <VerdictCard label="FUNDAMENTALLY_BROKEN" effect={t("brokenEffect")} desc={t("brokenDesc")} color="red" />
            </div>
            <p className="mt-3 text-slate-500 text-xs">{t("recoveryNote")}</p>
          </Phase>
        </Section>

        <Section title={t("determinismTitle")}>
          <p>{t("determinismDesc")}</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li><strong>{t("tempLabel")}</strong>{t("tempDesc")}</li>
            <li><strong>{t("seedLabel")}</strong>{t("seedDesc")}</li>
            <li><strong>{t("modelLabel")}</strong>{t("modelDesc")}</li>
            <li><strong>{t("binaryLabel")}</strong>{t("binaryDesc")}</li>
          </ul>
        </Section>

        <Section title={t("onChainTitle")}>
          <p>{t.rich("onChainDesc", { code: (c) => <code className="text-amber-700">{c}</code> })}</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>{t("onChainItem1")}</li>
            <li>{t("onChainItem2")}</li>
            <li>{t("onChainItem3")}</li>
          </ul>
        </Section>

        <Section title={t("payoutTitle")}>
          <div className="bg-white border border-slate-200 rounded-xl p-4 mt-3">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-4 text-slate-500 font-medium">{t("scoreVsThreshold")}</th>
                  <th className="py-2 text-slate-500 font-medium">{t("payoutPercent")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="py-2 pr-4">{t("tier100")}</td>
                  <td className="py-2 text-emerald-600 font-bold">100%</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-2 pr-4">{t("tier80")}</td>
                  <td className="py-2 text-amber-600 font-bold">50%</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-2 pr-4">{t("tier50")}</td>
                  <td className="py-2 text-orange-400 font-bold">25%</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">{t("tierBelow50")}</td>
                  <td className="py-2 text-slate-500 font-bold">{t("tierBelow50Payout")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900 mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Phase({ num, title, color, children }: { num: number; title: string; color: string; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    red: "border-slate-300 bg-slate-50",
    purple: "border-slate-300 bg-slate-50",
    emerald: "border-amber-200 bg-amber-50/50",
  };
  return (
    <div className={`border rounded-xl p-6 mt-4 ${colors[color]}`}>
      <h3 className="text-slate-900 font-semibold mb-3">Phase {num}: {title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function VerdictCard({ label, effect, desc, color }: { label: string; effect: string; desc: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: "border-amber-200 bg-amber-50 text-amber-700",
    green: "border-slate-200 bg-green-900/20 text-slate-700",
    gray: "border-slate-200 bg-slate-50/30 text-slate-500",
    yellow: "border-yellow-800 bg-yellow-900/20 text-amber-600",
    orange: "border-orange-800 bg-orange-900/20 text-orange-400",
    red: "border-slate-300 bg-slate-100 text-slate-500",
  };
  return (
    <div className={`border rounded-lg p-3 ${colors[color]}`}>
      <div className="font-mono text-xs font-bold">{label}</div>
      <div className="text-[10px] font-semibold mt-1">{effect}</div>
      <div className="text-[10px] opacity-60 mt-1">{desc}</div>
    </div>
  );
}
