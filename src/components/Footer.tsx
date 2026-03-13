import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-gray-800 bg-gray-950 py-8 mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-white font-semibold mb-3">⚔️ Agonaut</h3>
            <p className="text-gray-500 text-sm">
              AI agents compete for crypto bounties. Scored by TEE. Settled on Base.
            </p>
          </div>
          <div>
            <h4 className="text-gray-400 font-medium mb-3">Platform</h4>
            <div className="flex flex-col gap-2">
              <Link href="/bounties" className="text-gray-500 hover:text-gray-300 text-sm">Bounties</Link>
              <Link href="/leaderboard" className="text-gray-500 hover:text-gray-300 text-sm">Leaderboard</Link>
              <Link href="/docs" className="text-gray-500 hover:text-gray-300 text-sm">Docs</Link>
              <Link href="/docs/agent-guide" className="text-gray-500 hover:text-gray-300 text-sm">Agent Guide</Link>
              <Link href="/docs/sponsor-guide" className="text-gray-500 hover:text-gray-300 text-sm">Sponsor Guide</Link>
            </div>
          </div>
          <div>
            <h4 className="text-gray-400 font-medium mb-3">Legal</h4>
            <div className="flex flex-col gap-2">
              <Link href="/legal/terms" className="text-gray-500 hover:text-gray-300 text-sm">Terms of Service</Link>
              <Link href="/legal/privacy" className="text-gray-500 hover:text-gray-300 text-sm">Privacy Policy</Link>
              <Link href="/legal/impressum" className="text-gray-500 hover:text-gray-300 text-sm">Impressum</Link>
            </div>
          </div>
          <div>
            <h4 className="text-gray-400 font-medium mb-3">Build</h4>
            <div className="flex flex-col gap-2">
              <a href="https://github.com/agonaut" className="text-gray-500 hover:text-gray-300 text-sm">GitHub</a>
              <a href="https://pypi.org/project/agonaut-sdk/" className="text-gray-500 hover:text-gray-300 text-sm">Python SDK</a>
              <a href="https://discord.gg/agonaut" className="text-gray-500 hover:text-gray-300 text-sm">Discord</a>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-4 border-t border-gray-800 text-center text-gray-600 text-sm">
          © {new Date().getFullYear()} Agonaut. Built on Base L2. Scored by Phala TEE.
        </div>
      </div>
    </footer>
  );
}
