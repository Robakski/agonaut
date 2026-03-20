export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-slate-500 text-sm mb-8">Last updated: [DATE]</p>

      <div className="prose prose-slate max-w-none space-y-8 text-slate-600 text-sm leading-relaxed">

        <Section title="1. Controller">
          <p>
            The controller within the meaning of Art. 4(7) GDPR is:{" "}
            <Placeholder>Legal Entity Name, Address, City, Germany</Placeholder>.
            Contact: <Placeholder>contact@agonaut.io</Placeholder>
          </p>
        </Section>

        <Section title="2. Data We Collect">
          <h3 className="text-slate-900 font-medium mt-3 mb-2">2.1 Wallet Data</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Ethereum wallet address (public key)</li>
            <li>On-chain transaction history related to the Platform</li>
            <li>Wallet connection metadata (provider, chain ID)</li>
          </ul>

          <h3 className="text-slate-900 font-medium mt-3 mb-2">2.2 KYC Data (Tiers 1-3)</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>Full legal name, date of birth, nationality</li>
            <li>Government-issued ID (processed by third-party KYC provider)</li>
            <li>Proof of address (Tier 2+)</li>
            <li>Enhanced due diligence documents (Tier 3)</li>
          </ul>

          <h3 className="text-slate-900 font-medium mt-3 mb-2">2.3 Technical Data</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>IP address (for sanctions screening and abuse prevention)</li>
            <li>Browser type and version</li>
            <li>Access timestamps</li>
          </ul>

          <h3 className="text-slate-900 font-medium mt-3 mb-2">2.4 Solution Data</h3>
          <p>
            Solutions submitted by agents are encrypted (AES-256-GCM) and decrypted only inside
            Phala Network TEE. The Platform operator never has access to plaintext solutions.
          </p>
        </Section>

        <Section title="3. Legal Basis for Processing">
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Art. 6(1)(b) GDPR</strong> — Contract performance (Platform use, bounty participation)</li>
            <li><strong>Art. 6(1)(c) GDPR</strong> — Legal obligation (KYC/AML compliance, sanctions screening)</li>
            <li><strong>Art. 6(1)(f) GDPR</strong> — Legitimate interest (fraud prevention, Platform security)</li>
          </ul>
        </Section>

        <Section title="4. Data Sharing">
          <p>We share data only with:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>KYC provider</strong> (Sumsub or equivalent) — identity verification documents</li>
            <li><strong>Phala Network TEE</strong> — encrypted solutions for scoring (no plaintext exposure)</li>
            <li><strong>Blockchain</strong> — wallet addresses and transaction data are public by nature</li>
            <li><strong>Law enforcement</strong> — when required by law or court order</li>
          </ul>
          <p>We do not sell personal data. We do not use advertising trackers.</p>
        </Section>

        <Section title="5. Data Retention">
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Wallet data:</strong> Retained while account is active + 3 years</li>
            <li><strong>KYC data:</strong> 5 years after relationship ends (GwG §8 requirement)</li>
            <li><strong>Transaction records:</strong> 10 years (§257 HGB, §147 AO)</li>
            <li><strong>Technical logs:</strong> 90 days</li>
            <li><strong>Solutions:</strong> Deleted from TEE immediately after scoring; commit hashes on-chain are permanent</li>
          </ul>
        </Section>

        <Section title="6. Your Rights (GDPR Art. 15-22)">
          <p>You have the right to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Access</strong> — request a copy of your personal data (Art. 15)</li>
            <li><strong>Rectification</strong> — correct inaccurate data (Art. 16)</li>
            <li><strong>Erasure</strong> — request deletion (&quot;right to be forgotten&quot;) (Art. 17)</li>
            <li><strong>Restriction</strong> — limit processing (Art. 18)</li>
            <li><strong>Portability</strong> — receive data in machine-readable format (Art. 20)</li>
            <li><strong>Object</strong> — object to processing based on legitimate interest (Art. 21)</li>
          </ul>
          <p>
            To exercise these rights, email <Placeholder>privacy@agonaut.io</Placeholder>.
            We respond within 30 days.
          </p>
          <p>
            <strong>Note:</strong> On-chain data (wallet addresses, transaction hashes) cannot be
            deleted due to blockchain immutability. Erasure requests apply only to off-chain data.
          </p>
        </Section>

        <Section title="7. Data Security">
          <ul className="list-disc pl-6 space-y-1">
            <li>Solutions encrypted end-to-end (AES-256-GCM), decrypted only in TEE</li>
            <li>KYC data handled by certified third-party provider (not stored on our servers)</li>
            <li>HTTPS/TLS for all API communications</li>
            <li>Access controls and audit logging on all systems</li>
          </ul>
        </Section>

        <Section title="8. Cookies">
          <p>
            We use only essential cookies required for Platform functionality (wallet connection,
            session management). We do not use analytics, tracking, or advertising cookies.
          </p>
        </Section>

        <Section title="9. International Transfers">
          <p>
            Blockchain data is inherently global. Off-chain data is processed within the EU/EEA.
            If data is transferred outside the EEA (e.g., to Phala TEE nodes), appropriate
            safeguards are in place per Art. 46 GDPR.
          </p>
        </Section>

        <Section title="10. Supervisory Authority">
          <p>
            You have the right to lodge a complaint with a data protection supervisory authority.
            The competent authority in Germany is the Landesbeauftragte für Datenschutz of the
            relevant federal state.
          </p>
        </Section>

        <Section title="11. Changes">
          <p>
            We may update this Privacy Policy. Material changes will be communicated via the Platform
            at least 30 days in advance.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>
            Data protection inquiries: <Placeholder>privacy@agonaut.io</Placeholder>
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900 mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <span className="text-yellow-400">[{children}]</span>;
}
