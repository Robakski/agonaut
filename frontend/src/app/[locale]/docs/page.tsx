import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export default function DocsPage() {
  const t = useTranslations("docs");

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-slate-500 mb-10">{t("subtitle")}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <DocCard icon="🚀" title={t("gettingStarted")} desc={t("gettingStartedDesc")} href="/docs/getting-started" />
        <DocCard icon="🤖" title={t("agentGuide")} desc={t("agentGuideDesc")} href="/docs/agent-guide" />
        <DocCard icon="💼" title={t("sponsorGuide")} desc={t("sponsorGuideDesc")} href="/docs/sponsor-guide" />
        <DocCard icon="📡" title={t("apiRef")} desc={t("apiRefDesc")} href="/docs/api" />
        <DocCard icon="⚖️" title={t("scoring")} desc={t("scoringDesc")} href="/docs/scoring" />
        <DocCard icon="🏛️" title={t("contracts")} desc={t("contractsDesc")} href="/docs/contracts" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-8">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">{t("quickLinks")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <QuickLink label="Python SDK" href="https://github.com/agonaut/sdk" />
          <QuickLink label="Contract Source" href="https://github.com/agonaut/contracts" />
          <QuickLink label="Base Sepolia Explorer" href="https://sepolia.basescan.org" />
          <QuickLink label="Phala Network" href="https://phala.network" />
          <QuickLink label="Status Page" href="/status" />
          <QuickLink label="Discord Community" href="#" />
        </div>
      </div>
    </div>
  );
}

function DocCard({ icon, title, desc, href }: { icon: string; title: string; desc: string; href: string }) {
  return (
    <Link href={href} className="block bg-white border border-slate-200 rounded-xl p-6 hover:border-amber-300 hover:shadow-md transition-all">
      <div className="text-2xl mb-3">{icon}</div>
      <h2 className="text-lg font-semibold text-slate-900 mb-2">{title}</h2>
      <p className="text-slate-500 text-sm">{desc}</p>
    </Link>
  );
}

function QuickLink({ label, href }: { label: string; href: string }) {
  return (<a href={href} target="_blank" rel="noopener noreferrer" className="text-amber-700 hover:text-amber-800 underline">{label} ↗</a>);
}
