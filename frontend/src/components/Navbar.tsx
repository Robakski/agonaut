"use client";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { ConnectKitButton } from "connectkit";
import { useState, useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const LOCALES = [
    { code: "en", label: "EN", flag: "🇬🇧" },
    { code: "de", label: "DE", flag: "🇩🇪" },
    { code: "es", label: "ES", flag: "🇪🇸" },
    { code: "zh", label: "中文", flag: "🇨🇳" },
  ] as const;
  const switchLocale = (next: string) => {
    setLangOpen(false);
    router.replace(pathname, { locale: next });
  };

  // Close lang dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    }
    if (langOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [langOpen]);

  // Scroll detection for subtle shadow
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`sticky top-0 z-50 bg-white/90 backdrop-blur-xl transition-all duration-300 ${scrolled ? "shadow-sm border-b border-slate-100" : "border-b border-transparent"}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-[72px] items-center justify-between">

          {/* Left nav links */}
          <div className="hidden lg:flex items-center gap-1 flex-1">
            <NavLink href="/bounties" pathname={pathname}>{t("bounties")}</NavLink>
            <NavLink href="/agents" pathname={pathname}>{t("earnWithAI")}</NavLink>
          </div>

          {/* Center logo */}
          <div className="flex items-center justify-center lg:flex-none">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <span
                  className="text-xl font-black tracking-[-0.04em] text-slate-900 group-hover:text-slate-700 transition-colors duration-200"
                  style={{ fontFeatureSettings: "'ss01'" }}
                >
                  AGONAUT
                </span>
                <span
                  className="absolute -bottom-0.5 left-0 right-0 h-[2px] rounded-full opacity-80 group-hover:opacity-100 transition-opacity"
                  style={{ background: "linear-gradient(90deg, #c0c0c0, #a8a29e, #d97706, #fbbf24)" }}
                />
              </div>
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] bg-slate-50 text-slate-400 border border-slate-200 rounded">
                {t("testnet")}
              </span>
            </Link>
          </div>

          {/* Right nav links + actions */}
          <div className="hidden lg:flex items-center gap-1 flex-1 justify-end">
            <NavLink href="/leaderboard" pathname={pathname}>{t("leaderboard")}</NavLink>
            <NavLink href="/docs" pathname={pathname}>{t("docs")}</NavLink>

            <div className="w-px h-5 bg-slate-200 mx-2" />

            {/* Language */}
            <div className="relative" ref={langRef}>
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-1.5 px-2.5 py-2 text-sm text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-all"
                aria-label="Language"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a15.3 15.3 0 014 9 15.3 15.3 0 01-4 9 15.3 15.3 0 01-4-9 15.3 15.3 0 014-9z" /></svg>
                <span className="text-xs font-medium">{locale.toUpperCase()}</span>
              </button>
              {langOpen && (
                <div className="absolute right-0 mt-2 z-50 bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/50 py-1.5 min-w-[140px] animate-in fade-in slide-in-from-top-1 duration-150">
                  {LOCALES.map(l => (
                    <button key={l.code} onClick={() => switchLocale(l.code)}
                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 hover:bg-slate-50 transition-colors ${locale === l.code ? "font-semibold text-slate-900" : "text-slate-500"}`}>
                      <span className="text-base">{l.flag}</span>
                      <span>{l.label}</span>
                      {locale === l.code && <span className="ml-auto text-amber-600 text-xs">●</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* GitHub */}
            <a
              href="https://github.com/Robakski/agonaut"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-50 transition-all"
            >
              <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            </a>

            <ConnectKitButton />
          </div>

          {/* Mobile: logo is already centered via flex, just need burger */}
          <div className="lg:hidden flex items-center gap-2">
            <ConnectKitButton />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="flex items-center justify-center w-10 h-10 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="lg:hidden pb-4 space-y-0.5 border-t border-slate-100 pt-3">
            <MobileNavLink href="/bounties" onClick={() => setMobileOpen(false)}>{t("bounties")}</MobileNavLink>
            <MobileNavLink href="/agents" onClick={() => setMobileOpen(false)}>{t("earnWithAI")}</MobileNavLink>
            <MobileNavLink href="/leaderboard" onClick={() => setMobileOpen(false)}>{t("leaderboard")}</MobileNavLink>
            <MobileNavLink href="/docs" onClick={() => setMobileOpen(false)}>{t("docs")}</MobileNavLink>
            <div className="pt-2 mt-2 border-t border-slate-100">
              <div className="flex flex-wrap gap-2 px-3 py-2">
                {LOCALES.map(l => (
                  <button key={l.code}
                    onClick={() => { switchLocale(l.code); setMobileOpen(false); }}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-all ${locale === l.code ? "font-semibold text-slate-900 bg-slate-100" : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"}`}
                  >
                    {l.flag} {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

function NavLink({ href, children, pathname }: { href: string; children: React.ReactNode; pathname: string }) {
  const isActive = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`px-3.5 py-2 text-[13px] font-medium rounded-lg transition-all duration-200 ${
        isActive
          ? "text-slate-900 bg-slate-50"
          : "text-slate-400 hover:text-slate-700 hover:bg-slate-50/50"
      }`}
    >
      {children}
    </Link>
  );
}

function MobileNavLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-50 transition-all"
    >
      {children}
    </Link>
  );
}
