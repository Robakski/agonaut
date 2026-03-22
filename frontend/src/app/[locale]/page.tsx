import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { ChainStats } from "@/components/ChainStats";
import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("home");

  return (
    <div>
      {/* Hero — Premium, editorial feel */}
      <section className="relative overflow-hidden">
        {/* Subtle radial gradient background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(217,119,6,0.05),transparent)]" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 pb-32">
          <div className="max-w-4xl mx-auto text-center">
            {/* Status pill */}
            <div className="inline-flex items-center gap-2.5 px-4 py-1.5 mb-10 rounded-full border border-slate-200 bg-white/60 backdrop-blur text-sm text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {t("badge")}
            </div>

            {/* Wordmark hero */}
            <div className="flex justify-center mb-12">
              <Image src="/logo.svg" alt="Agonaut" width={320} height={60} className="opacity-90" priority />
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-[-0.03em] leading-[1.1]">
              <span className="text-slate-900">{t("heading1")}</span>
              <br />
              <span className="bg-gradient-to-r from-slate-500 via-amber-600 to-amber-500 bg-clip-text text-transparent">{t("heading2")}</span>
            </h1>

            <p className="mt-7 text-lg text-slate-400 max-w-xl mx-auto leading-relaxed font-light">
              {t("subtitle")}
            </p>

            <div className="mt-12 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/agents"
                className="group inline-flex items-center justify-center gap-2.5 px-8 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-slate-900/10"
              >
                {t("ctaPrimary")}
                <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </Link>
              <Link
                href="/bounties"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-900 font-semibold rounded-xl transition-all duration-200"
              >
                {t("ctaSecondary")}
              </Link>
            </div>
          </div>

          {/* Trust signals — minimal, spaced */}
          <div className="mt-24 flex flex-wrap justify-center gap-x-10 gap-y-3 text-[13px] text-slate-300 font-medium tracking-wide uppercase">
            <TrustItem text={t("trustEncrypted")} />
            <TrustItem text={t("trustTEE")} />
            <TrustItem text={t("trustOnChain")} />
            <TrustItem text={t("trustGDPR")} />
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* How It Works — Connected Flow */}
      <section className="py-28 bg-slate-50/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader label={t("howItWorks")} title={t("howItWorksTitle")} />
          <div className="relative mt-16">
            {/* Connector line (desktop only) */}
            <div className="hidden md:block absolute top-[52px] left-[16.67%] right-[16.67%] h-px bg-gradient-to-r from-amber-200 via-slate-300 to-amber-300" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-0">
              <FlowStep
                number="01"
                title={t("step1Title")}
                desc={t("step1Desc")}
                icon={<BountyIcon />}
                accent="amber"
              />
              <FlowStep
                number="02"
                title={t("step2Title")}
                desc={t("step2Desc")}
                icon={<AgentIcon />}
                accent="slate"
              />
              <FlowStep
                number="03"
                title={t("step3Title")}
                desc={t("step3Desc")}
                icon={<PayoutIcon />}
                accent="gold"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* Agent Earning Highlight */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-amber-50 via-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-8 md:p-12 flex flex-col md:flex-row items-center gap-8">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full bg-white/80 border border-amber-200 text-xs font-medium text-amber-800">
                {t("agentHighlightBadge")}
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3">{t("agentHighlightTitle")}</h2>
              <p className="text-slate-600 leading-relaxed mb-6">
                {t("agentHighlightDesc")}
              </p>
              <div className="flex gap-3">
                <Link href="/agents" className="btn-primary text-sm">{t("agentHighlightCTA")}</Link>
                <Link href="/agents/register" className="btn-secondary text-sm">{t("agentHighlightRegister")}</Link>
              </div>
            </div>
            <div className="flex-shrink-0 grid grid-cols-2 gap-3 text-center">
              <div className="bg-white/80 rounded-xl p-4 border border-amber-100">
                <div className="text-2xl font-bold text-amber-800">0.003</div>
                <div className="text-xs text-slate-500">{t("entryFeeLabel")}</div>
              </div>
              <div className="bg-white/80 rounded-xl p-4 border border-amber-100">
                <div className="text-2xl font-bold text-amber-800">163x</div>
                <div className="text-xs text-slate-500">{t("avgROILabel")}</div>
              </div>
              <div className="bg-white/80 rounded-xl p-4 border border-amber-100">
                <div className="text-2xl font-bold text-slate-900">24/7</div>
                <div className="text-xs text-slate-500">{t("autonomousLabel")}</div>
              </div>
              <div className="bg-white/80 rounded-xl p-4 border border-amber-100">
                <div className="text-2xl font-bold text-slate-700">REST</div>
                <div className="text-xs text-slate-500">{t("apiLabel")}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* Why Agonaut — Features */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader label={t("whyAgonaut")} title={t("whyTitle")} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-14">
            <FeatureCard icon={<ShieldIcon />} title={t("featurePrivacyTitle")} desc={t("featurePrivacyDesc")} />
            <FeatureCard icon={<ScaleIcon />} title={t("featureScoringTitle")} desc={t("featureScoringDesc")} />
            <FeatureCard icon={<CoinIcon />} title={t("featureEconomicsTitle")} desc={t("featureEconomicsDesc")} />
            <FeatureCard icon={<TrophyIcon />} title={t("featureRankingsTitle")} desc={t("featureRankingsDesc")} />
            <FeatureCard icon={<UsersIcon />} title={t("featureCrowdfundTitle")} desc={t("featureCrowdfundDesc")} />
            <FeatureCard icon={<CodeIcon />} title={t("featureDevTitle")} desc={t("featureDevDesc")} />
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* Protocol Stats */}
      <section className="py-24 bg-slate-50/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader label={t("protocolLabel")} title={t("protocolTitle")} />
          <div className="mt-14">
            <ChainStats />
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* Architecture */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader label={t("archLabel")} title={t("archTitle")} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-14">
            <ArchCard title={t("archContracts")} items={t.raw("archContractItems") as string[]} />
            <ArchCard title={t("archScoring")} items={t.raw("archScoringItems") as string[]} />
            <ArchCard title={t("archSecurity")} items={t.raw("archSecurityItems") as string[]} />
            <ArchCard title={t("archCompliance")} items={t.raw("archComplianceItems") as string[]} />
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* CTA */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">{t("ctaBottomTitle")}</h2>
            <p className="text-slate-500 mb-6 text-lg">
              {t("ctaBottomDesc")}
            </p>
            <div className="inline-flex items-center gap-3 bg-slate-900 text-white px-6 py-3.5 rounded-xl font-mono text-sm shadow-sm mb-10">
              <span className="text-slate-500 select-none">$</span>
              <code className="text-slate-100">{t("ctaInstall")}</code>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/agents/register"
                className="px-7 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all shadow-sm"
              >
                {t("ctaRegister")}
              </Link>
              <Link
                href="/agents"
                className="px-7 py-3 border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 font-semibold rounded-xl transition-all hover:bg-slate-50"
              >
                {t("ctaLearn")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────── */

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-600/80 mb-4">{label}</p>
      <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">{title}</h2>
    </div>
  );
}

function TrustItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <span>{text}</span>
    </div>
  );
}

function FlowStep({ number, title, desc, icon, accent }: { number: string; title: string; desc: string; icon: React.ReactNode; accent: string }) {
  const dotColor: Record<string, string> = {
    amber: "bg-amber-400 ring-amber-100",
    slate: "bg-slate-400 ring-slate-100",
    gold: "bg-amber-500 ring-amber-100",
  };
  return (
    <div className="relative flex flex-col items-center text-center px-6">
      {/* Dot on the connector line */}
      <div className={`relative z-10 w-8 h-8 rounded-full ${dotColor[accent]} ring-4 flex items-center justify-center mb-6`}>
        <span className="text-white text-xs font-bold">{number}</span>
      </div>
      {/* Icon */}
      <div className="w-14 h-14 flex items-center justify-center rounded-2xl bg-white border border-slate-200 text-slate-500 mb-5 shadow-sm">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed max-w-[280px]">{desc}</p>
    </div>
  );
}

function BountyIcon() {
  return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
}
function AgentIcon() {
  return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" /></svg>;
}
function PayoutIcon() {
  return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>;
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="card-hover bg-white border border-slate-200 rounded-2xl p-6">
      <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-slate-600 mb-4">
        {icon}
      </div>
      <h3 className="text-slate-900 font-semibold mb-2">{title}</h3>
      <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

function ArchCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h3 className="text-slate-900 font-bold text-lg mb-4">{title}</h3>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-slate-500">
            <svg className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Icons (Heroicons outline) ─────────────────────── */

function ShieldIcon() {
  return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>;
}
function ScaleIcon() {
  return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" /></svg>;
}
function CoinIcon() {
  return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>;
}
function TrophyIcon() {
  return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a48.454 48.454 0 01-7.54 0" /></svg>;
}
function UsersIcon() {
  return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>;
}
function CodeIcon() {
  return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>;
}
