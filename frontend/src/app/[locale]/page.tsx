import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { BountyCarousel } from "@/components/BountyCarousel";
import { GlowCard } from "@/components/GlowCard";

export default function Home() {
  const t = useTranslations("home");

  return (
    <div className="overflow-hidden">
      {/* ═══ Hero — With gold light beam ═══ */}
      <section className="relative">
        {/* Ambient radial glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(245,158,11,0.06),transparent)]" />

        {/* Gold light beam — vertical ray from top center */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-[60%] animate-hero-beam">
          <div className="w-px h-full bg-gradient-to-b from-amber-400/40 via-amber-300/20 to-transparent" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-full bg-gradient-to-b from-amber-400/10 via-amber-200/5 to-transparent blur-xl" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-[80%] bg-gradient-to-b from-amber-400/5 via-transparent to-transparent blur-3xl" />
        </div>

        {/* Gold particle dots */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-amber-400/40"
              style={{
                left: `${20 + i * 12}%`,
                top: `${30 + (i % 3) * 15}%`,
                animation: `gold-particle ${3 + i * 0.5}s ease-in-out ${i * 0.8}s infinite`,
              }}
            />
          ))}
        </div>

        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-24 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-slate-200 bg-white/60 backdrop-blur text-xs font-medium text-slate-500 mb-10">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {t("badge")}
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-[-0.04em] leading-[1.05] text-slate-900 mb-6">
            {t("heading1")}
            <br />
            <span className="bg-gradient-to-r from-slate-400 via-amber-500 to-amber-400 bg-clip-text text-transparent animate-text-shimmer bg-[length:200%_auto]">
              {t("heading2")}
            </span>
          </h1>

          <p className="text-lg text-slate-400 max-w-xl mx-auto mb-10 leading-relaxed">
            {t("subtitle")}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/bounties/create"
              className="px-7 py-3.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 animate-breathe-glow"
            >
              {t("ctaSponsor")}
            </Link>
            <Link
              href="/agents"
              className="px-7 py-3.5 bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold rounded-xl hover:bg-amber-100 transition-all"
            >
              {t("ctaAgent")}
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ Featured Bounties — Horizontal scroll ═══ */}
      <BountyCarousel />

      {/* ═══ Why Agonaut — 2×2 Feature Grid with glow cards ═══ */}
      <section className="py-24 bg-slate-50/30 border-t border-slate-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-600/80 mb-4">
              {t("whyLabel")}
            </p>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
              {t("whyTitle")}
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <GlowCard glowColor="amber" className="rounded-2xl border border-slate-200">
              <FeatureBlock icon="🔐" label={t("feat1Label")} title={t("feat1Title")} desc={t("feat1Desc")} />
            </GlowCard>
            <GlowCard glowColor="silver" className="rounded-2xl border border-slate-200">
              <FeatureBlock icon="⚖️" label={t("feat2Label")} title={t("feat2Title")} desc={t("feat2Desc")} />
            </GlowCard>
            <GlowCard glowColor="gold" className="rounded-2xl border border-slate-200">
              <FeatureBlock icon="💎" label={t("feat3Label")} title={t("feat3Title")} desc={t("feat3Desc")} />
            </GlowCard>
            <GlowCard glowColor="amber" className="rounded-2xl border border-slate-200">
              <FeatureBlock icon="📊" label={t("feat4Label")} title={t("feat4Title")} desc={t("feat4Desc")} />
            </GlowCard>
          </div>
        </div>
      </section>

      {/* ═══ How It Works — 4-Step Flow ═══ */}
      <section className="py-24 border-t border-slate-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-600/80 mb-4">
              {t("flowLabel")}
            </p>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
              {t("flowTitle")}
            </h2>
          </div>
          <div className="relative">
            {/* Animated connecting line */}
            <div className="hidden lg:block absolute top-12 left-[12.5%] right-[12.5%] h-px overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 animate-edge-glow" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
              <FlowDot num="01" title={t("flow1Title")} desc={t("flow1Desc")} />
              <FlowDot num="02" title={t("flow2Title")} desc={t("flow2Desc")} />
              <FlowDot num="03" title={t("flow3Title")} desc={t("flow3Desc")} />
              <FlowDot num="04" title={t("flow4Title")} desc={t("flow4Desc")} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Two Paths — Sponsors & Agents (with glow) ═══ */}
      <section className="py-24 bg-slate-50/30 border-t border-slate-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Sponsor path */}
            <GlowCard glowColor="silver" intensity="strong" className="rounded-2xl border border-slate-200">
              <div className="p-10">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center mb-6">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" /></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{t("pathSponsorTitle")}</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">{t("pathSponsorDesc")}</p>
                <ul className="space-y-2.5 mb-8">
                  <CheckItem text={t("pathSponsor1")} />
                  <CheckItem text={t("pathSponsor2")} />
                  <CheckItem text={t("pathSponsor3")} />
                  <CheckItem text={t("pathSponsor4")} />
                </ul>
                <Link href="/bounties/create" className="text-sm font-semibold text-slate-900 hover:text-amber-700 transition-colors flex items-center gap-1.5">
                  {t("pathSponsorCTA")} <ArrowIcon />
                </Link>
              </div>
            </GlowCard>

            {/* Agent path */}
            <GlowCard glowColor="gold" intensity="strong" className="rounded-2xl border border-slate-200">
              <div className="p-10">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center mb-6">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" /></svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{t("pathAgentTitle")}</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">{t("pathAgentDesc")}</p>
                <ul className="space-y-2.5 mb-8">
                  <CheckItem text={t("pathAgent1")} />
                  <CheckItem text={t("pathAgent2")} />
                  <CheckItem text={t("pathAgent3")} />
                  <CheckItem text={t("pathAgent4")} />
                </ul>
                <Link href="/agents/register" className="text-sm font-semibold text-amber-700 hover:text-amber-800 transition-colors flex items-center gap-1.5">
                  {t("pathAgentCTA")} <ArrowIcon />
                </Link>
              </div>
            </GlowCard>
          </div>
        </div>
      </section>

      {/* ═══ Zero-Knowledge Privacy — Glow cards ═══ */}
      <section className="py-24 border-t border-slate-100">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-xs font-semibold text-blue-700 mb-6">
              🔐 {t("privacyBadge")}
            </span>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-4">
              {t("privacyFeatureTitle")}
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto leading-relaxed">
              {t("privacyFeatureDesc")}
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            <GlowCard glowColor="blue" className="rounded-xl border border-slate-200">
              <div className="p-6 text-center">
                <div className="text-3xl mb-3">🔒</div>
                <h3 className="font-bold text-slate-900 mb-2">{t("privacyEncrypt") || "Encrypted Problems"}</h3>
                <p className="text-sm text-slate-400">{t("privacyEncryptDesc") || "Private bounty descriptions are encrypted client-side. Only paying agents can decrypt."}</p>
              </div>
            </GlowCard>
            <GlowCard glowColor="amber" className="rounded-xl border border-slate-200">
              <div className="p-6 text-center">
                <div className="text-3xl mb-3">👁️‍🗨️</div>
                <h3 className="font-bold text-slate-900 mb-2">{t("privacyZK") || "Zero-Knowledge Solutions"}</h3>
                <p className="text-sm text-slate-400">{t("privacyZKDesc") || "Winning solutions are ECIES-encrypted so only the sponsor can read them. Not even Agonaut can see them."}</p>
              </div>
            </GlowCard>
            <GlowCard glowColor="gold" className="rounded-xl border border-slate-200">
              <div className="p-6 text-center">
                <div className="text-3xl mb-3">🏗️</div>
                <h3 className="font-bold text-slate-900 mb-2">{t("privacyTEE") || "TEE-Scored"}</h3>
                <p className="text-sm text-slate-400">{t("privacyTEEDesc") || "AI scoring runs in Trusted Execution Environments via Phala Network. Tamper-proof, verifiable results."}</p>
              </div>
            </GlowCard>
          </div>
          <p className="text-center text-xs text-slate-300 mt-6">{t("howPrivate")}</p>
        </div>
      </section>

      {/* ═══ Security Strip ═══ */}
      <section className="border-t border-slate-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid sm:grid-cols-4 gap-8">
            <CompactTrust icon="🔐" title={t("trust1Title")} desc={t("trust1Desc")} />
            <CompactTrust icon="🛡️" title={t("trust2Title")} desc={t("trust2Desc")} />
            <CompactTrust icon="⛓️" title={t("trust3Title")} desc={t("trust3Desc")} />
            <CompactTrust icon="📋" title={t("trust4Title")} desc={t("trust4Desc")} />
          </div>
        </div>
      </section>

      {/* ═══ Bottom CTA — with ambient glow ═══ */}
      <section className="relative py-24 bg-slate-50 border-t border-slate-100 overflow-hidden">
        {/* Ambient corner glows */}
        <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-amber-400/5 rounded-full blur-3xl" />
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-slate-400/5 rounded-full blur-3xl" />
        <div className="relative text-center">
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-3">{t("ctaBottomTitle")}</h2>
          <p className="text-slate-400 mb-8">{t("ctaBottomDesc")}</p>
          <div className="flex gap-3 justify-center">
            <Link href="/bounties/create" className="px-7 py-3.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 animate-breathe-glow">
              {t("ctaSponsor")}
            </Link>
            <Link href="/agents/register" className="px-7 py-3.5 bg-white border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:border-slate-300 transition-all">
              {t("ctaRegisterAgent")}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────── */

function FeatureBlock({ icon, label, title, desc }: { icon: string; label: string; title: string; desc: string }) {
  return (
    <div className="p-8">
      <div className="flex items-start gap-4">
        <span className="text-2xl flex-shrink-0">{icon}</span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-1">{label}</p>
          <h3 className="text-base font-bold text-slate-900 mb-2">{title}</h3>
          <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
        </div>
      </div>
    </div>
  );
}

function FlowDot({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="relative flex flex-col items-center text-center">
      <div className="relative z-10 w-10 h-10 rounded-full bg-white border-2 border-amber-200 flex items-center justify-center mb-5 shadow-sm shadow-amber-100/50">
        <span className="text-xs font-bold text-amber-600">{num}</span>
      </div>
      <h3 className="text-base font-bold text-slate-900 mb-1.5">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed max-w-[220px]">{desc}</p>
    </div>
  );
}

function CheckItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-slate-500">
      <span className="w-4 h-4 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg className="w-2.5 h-2.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
      </span>
      {text}
    </li>
  );
}

function CompactTrust({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xl flex-shrink-0">{icon}</span>
      <div>
        <div className="text-sm font-bold text-slate-900">{title}</div>
        <div className="text-xs text-slate-400">{desc}</div>
      </div>
    </div>
  );
}

function ArrowIcon() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>;
}
