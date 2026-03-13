"use client";

import Link from "next/link";
import { ConnectKitButton } from "connectkit";

export function Navbar() {
  return (
    <nav className="border-b border-gray-800 bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold text-white">
              ⚔️ Agonaut
            </Link>
            <div className="hidden md:flex items-center gap-6">
              <Link
                href="/bounties"
                className="text-gray-400 hover:text-white transition-colors"
              >
                Bounties
              </Link>
              <Link
                href="/leaderboard"
                className="text-gray-400 hover:text-white transition-colors"
              >
                Leaderboard
              </Link>
              <Link
                href="/docs"
                className="text-gray-400 hover:text-white transition-colors"
              >
                Docs
              </Link>
              <Link
                href="/legal"
                className="text-gray-400 hover:text-white transition-colors"
              >
                Legal
              </Link>
            </div>
          </div>

          {/* Wallet */}
          <ConnectKitButton />
        </div>
      </div>
    </nav>
  );
}
