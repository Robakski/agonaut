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

const PHASE_COLORS: Record<string, string> = {
  Open: "bg-emerald-50 text-emerald-700",
  Commit: "bg-amber-50 text-amber-700",
  Scoring: "bg-blue-50 text-blue-700",
};

export function BountyCarousel() {
  const t = useTranslations("home");

  return (
    <section className="pb-20 overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            {t("carouselLabel")}
          </h2>
          <Link href="/bounties" className="text-xs font-semibold text-slate-400 hover:text-slate-700 transition-colors">
            {t("carouselBrowse")}
          </Link>
        </div>
      </div>
      <div className="flex gap-4 px-4 sm:px-6 lg:px-8 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
        {SAMPLE_BOUNTIES.map((b) => (
          <div
            key={b.key}
            className="flex-shrink-0 w-[300px] snap-start bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-lg hover:shadow-slate-100/50 hover:border-slate-300 transition-all cursor-pointer"
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${PHASE_COLORS[b.phase]}`}>
                {b.phase}
              </span>
              <span className="text-xs text-slate-400">{b.time}</span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              {t(`bounty_${b.key}_title` as any)}
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed line-clamp-2">
              {t(`bounty_${b.key}_desc` as any)}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">{b.prize}</span>
              <span className="text-xs text-slate-400">
                {b.agents} {t("agentsLabel")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
