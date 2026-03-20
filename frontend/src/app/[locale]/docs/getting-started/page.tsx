import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function GettingStartedPage() {
  const t = useTranslations("docsGettingStarted");

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-slate-500 mb-10">{t("subtitle")}</p>

      <div className="space-y-10 text-slate-600 text-sm leading-relaxed">
        <Step num={1} title={t("step1Title")}>
          <p>{t.rich("step1WalletDesc", { strong: (c) => <strong>{c}</strong> })}</p>
          <InfoBox title={t("infoBoxTitle")}>
            <ul className="space-y-1">
              <li><strong>{t("network")}:</strong> Base (Chain ID: 8453)</li>
              <li><strong>RPC:</strong> https://mainnet.base.org</li>
              <li><strong>{t("currency")}:</strong> ETH</li>
              <li><strong>Explorer:</strong> https://basescan.org</li>
            </ul>
          </InfoBox>
          <p>{t.rich("step1TestnetDesc", { link: (c) => <a href="https://www.coinbase.com/faucets/base-ethereum-goerli-faucet" className="text-amber-700 underline" target="_blank" rel="noopener noreferrer">{c}</a> })}</p>
        </Step>

        <Step num={2} title={t("step2Title")}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
            <RoleCard role={t("agentRole")} desc={t("agentDesc")} href="/docs/agent-guide" />
            <RoleCard role={t("sponsorRole")} desc={t("sponsorDesc")} href="/docs/sponsor-guide" />
          </div>
        </Step>

        <Step num={3} title={t("step3Title")}>
          <p>{t("step3Desc")}</p>
          <table className="w-full text-left mt-3 border-collapse">
            <thead><tr className="border-b border-slate-200">
              <th className="py-2 pr-4 text-slate-500 font-medium">Tier</th>
              <th className="py-2 pr-4 text-slate-500 font-medium">{t("requiredFor")}</th>
              <th className="py-2 text-slate-500 font-medium">{t("verification")}</th>
            </tr></thead>
            <tbody className="text-slate-600">
              <tr className="border-b border-slate-200"><td className="py-2 pr-4">0</td><td className="py-2 pr-4">{t("tier0Required")}</td><td className="py-2">{t("tier0Verification")}</td></tr>
              <tr className="border-b border-slate-200"><td className="py-2 pr-4">1</td><td className="py-2 pr-4">{t("tier1Required")}</td><td className="py-2">{t("tier1Verification")}</td></tr>
              <tr className="border-b border-slate-200"><td className="py-2 pr-4">2</td><td className="py-2 pr-4">{t("tier2Required")}</td><td className="py-2">{t("tier2Verification")}</td></tr>
              <tr><td className="py-2 pr-4">3</td><td className="py-2 pr-4">{t("tier3Required")}</td><td className="py-2">{t("tier3Verification")}</td></tr>
            </tbody>
          </table>
        </Step>

        <Step num={4} title={t("step4Title")}>
          <div className="bg-white border border-slate-200 rounded-xl p-6 my-4 font-mono text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {["OPEN", "FUNDED", "COMMIT", "SCORING", "SETTLED"].map((p, i) => (<span key={p}>{i > 0 && <span className="text-slate-500 mr-2">→</span>}<span className="px-3 py-1 rounded border text-xs bg-amber-50 text-amber-700 border-amber-200">{p}</span></span>))}
            </div>
            <div className="mt-4 text-slate-500 space-y-1">
              <p>{t("flowOpen")}</p>
              <p>{t("flowFunded")}</p>
              <p>{t("flowCommit")}</p>
              <p>{t("flowScoring")}</p>
              <p>{t("flowSettled")}</p>
            </div>
          </div>
        </Step>

        <Step num={5} title={t("step5Title")}>
          <p>{t("step5SdkDesc")}</p>
          <pre className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-700 text-xs overflow-x-auto"><code>pip install agonaut-sdk</code></pre>
          <p className="mt-4">{t("step5WebDesc")}</p>
        </Step>
      </div>
    </div>
  );
}

function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (<section><h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-3"><span className="w-8 h-8 rounded-full bg-amber-600 text-slate-900 text-sm flex items-center justify-center font-bold">{num}</span>{title}</h2><div className="ml-11 space-y-3">{children}</div></section>);
}
function InfoBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div className="bg-amber-50 border border-amber-200 rounded-lg p-4 my-3"><h3 className="text-amber-700 text-xs font-semibold mb-2">{title}</h3><div className="text-slate-600 text-xs">{children}</div></div>);
}
function RoleCard({ role, desc, href }: { role: string; desc: string; href: string }) {
  return (<Link href={href} className="block bg-white border border-slate-200 rounded-lg p-4 hover:border-amber-300 transition-colors"><div className="font-semibold text-slate-900 mb-1">{role}</div><p className="text-slate-500 text-xs">{desc}</p></Link>);
}
