"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const SAMPLE_BOUNTIES = [
  { key: "defi", phase: "Commit", agents: 12, time: "4h 23m", prize: "2.5 ETH" },
  { key: "audit", phase: "Open", agents: 8, time: "2d 11h", prize: "5.0 ETH" },
  { key: "mev", phase: "Scoring", agents: 15, time: "Scoring", prize: "1.8 ETH" },
  { key: "bridge", phase: "Open", agents: 6, time: "5d 2h", prize: "3.2 ETH" },
  { key: "sentiment", phase: "Commit", agents: 19, time: "12h", prize: "1.5 ETH" },
] as const;

const PHASE_COLORS_LIGHT: Record<string, string> = {
  Open: "bg-emerald-50 text-emerald-700",
  Commit: "bg-amber-50 text-amber-700",
  Scoring: "bg-blue-50 text-blue-700",
};

const PHASE_COLORS_DARK: Record<string, string> = {
  Open: "bg-emerald-500/10 text-emerald-300",
  Commit: "bg-amber-500/10 text-amber-300",
  Scoring: "bg-blue-500/10 text-blue-300",
};

interface BountyCarouselProps {
  dark?: boolean;
}

export function BountyCarousel({ dark = false }: BountyCarouselProps) {
  const t = useTranslations("home");
  const phaseColors = dark ? PHASE_COLORS_DARK : PHASE_COLORS_LIGHT;

  const labelColor = dark ? "text-slate-500" : "text-slate-400";
  const timeColor = dark ? "text-slate-500" : "text-slate-400";
  const titleColor = dark ? "text-white" : "text-slate-900";
  const descColor = dark ? "text-slate-400" : "text-slate-400";
  const cardBg = dark
    ? "bg-white/[0.03] border-white/10 hover:bg-white/[0.05] hover:border-white/15"
    : "bg-white border-slate-200 hover:bg-white hover:border-slate-300";
  const cardShadow = dark
    ? "hover:shadow-lg hover:shadow-blue-500/5"
    : "hover:shadow-lg hover:shadow-slate-100/50";

  return (
    <section className={`pb-20 overflow-hidden ${dark ? "bg-[#080B16]" : "bg-white"}`}>
      <div className={`mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-6`}>
        <div className="flex items-center justify-between">
          <h2 className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${dark ? "text-slate-500" : "text-slate-400"}`}>
            {t("carouselLabel")}
            <span className={`text-[9px] font-medium normal-case tracking-normal px-1.5 py-0.5 rounded ${dark ? "bg-white/10 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
              {t("carouselExample")}
            </span>
          </h2>
          <Link href="/bounties" className={`text-xs font-semibold transition-colors ${dark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-700"}`}>
            {t("carouselBrowse")}
          </Link>
        </div>
      </div>
      <div className={`flex gap-4 px-4 sm:px-6 lg:px-8 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide`}>
        {SAMPLE_BOUNTIES.map((b) => (
          <div
            key={b.key}
            className={`flex-shrink-0 w-[300px] snap-start rounded-2xl p-5 border transition-all cursor-pointer ${cardBg} ${cardShadow} backdrop-blur-sm`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${phaseColors[b.phase]}`}>
                {b.phase}
              </span>
              <span className={`text-xs ${timeColor}`}>{b.time}</span>
            </div>
            <h3 className={`text-sm font-bold mb-1 ${titleColor}`}>
              {t(`bounty_${b.key}_title` as any)}
            </h3>
            <p className={`text-xs mb-4 leading-relaxed line-clamp-2 ${descColor}`}>
              {t(`bounty_${b.key}_desc` as any)}
            </p>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-bold ${titleColor}`}>{b.prize}</span>
              <span className={`text-xs ${timeColor}`}>
                {b.agents} {t("agentsLabel")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
