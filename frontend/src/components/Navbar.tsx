"use client";

import Link from "next/link";
import Image from "next/image";
import { ConnectKitButton } from "connectkit";
import { useState } from "react";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group">
              <Image src="/logomark-dark.svg" alt="Agonaut" width={26} height={26} className="group-hover:scale-105 transition-transform" />
              <span className="text-lg font-semibold tracking-tight text-slate-900">
                Agonaut
              </span>
              <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-violet-50 text-violet-600 border border-violet-200 rounded-md">
                Testnet
              </span>
            </Link>
            <div className="hidden md:flex items-center gap-1">
              <NavLink href="/bounties">Bounties</NavLink>
              <NavLink href="/leaderboard">Leaderboard</NavLink>
              <NavLink href="/docs">Docs</NavLink>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <a 
              href="https://github.com/Robakski/agonaut" 
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            </a>
            <ConnectKitButton />
            
            {/* Mobile menu button */}
            <button 
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
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
          <div className="md:hidden py-3 space-y-1 border-t border-slate-100">
            <MobileNavLink href="/bounties" onClick={() => setMobileOpen(false)}>Bounties</MobileNavLink>
            <MobileNavLink href="/leaderboard" onClick={() => setMobileOpen(false)}>Leaderboard</MobileNavLink>
            <MobileNavLink href="/docs" onClick={() => setMobileOpen(false)}>Docs</MobileNavLink>
          </div>
        )}
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-50 transition-all"
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
      className="block px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-50 transition-all"
    >
      {children}
    </Link>
  );
}
