import Link from "next/link";

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8">Legal</h1>

      <div className="space-y-6">
        <LegalCard
          title="Terms of Service"
          desc="Rules governing the use of the Agonaut platform, including IP rights, fees, scoring, disputes, and liability."
          href="/legal/terms"
        />
        <LegalCard
          title="Privacy Policy"
          desc="How we collect, use, and protect your personal data in compliance with GDPR and German data protection law."
          href="/legal/privacy"
        />
        <LegalCard
          title="Impressum"
          desc="Legal notice required by German law (§5 TMG) identifying the operator of this service."
          href="/legal/impressum"
        />
      </div>

      <div className="mt-12 bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Compliance</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="text-slate-500 font-medium mb-2">KYC/AML</h3>
            <ul className="text-slate-400 space-y-1">
              <li>• Tiered identity verification</li>
              <li>• Sanctions screening on every wallet interaction</li>
              <li>• OFAC, EU, UN sanctions lists enforced</li>
              <li>• Suspicious activity monitoring</li>
            </ul>
          </div>
          <div>
            <h3 className="text-slate-500 font-medium mb-2">Data Protection</h3>
            <ul className="text-slate-400 space-y-1">
              <li>• GDPR compliant (EU Regulation 2016/679)</li>
              <li>• BDSG compliant (German Federal Data Protection Act)</li>
              <li>• No tracking cookies or advertising</li>
              <li>• Solutions encrypted end-to-end via TEE</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Blocked Jurisdictions</h2>
        <p className="text-slate-500 text-sm mb-4">
          In compliance with international sanctions, the platform is unavailable in:
        </p>
        <div className="flex flex-wrap gap-2">
          {["North Korea", "Iran", "Syria", "Cuba", "Myanmar", "Russia"].map((country) => (
            <span key={country} className="text-xs bg-slate-100 text-slate-600 border border-slate-300 px-3 py-1 rounded">
              {country}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function LegalCard({ title, desc, href }: { title: string; desc: string; href: string }) {
  return (
    <Link
      href={href}
      className="block bg-white border border-slate-200 rounded-xl p-6 hover:border-amber-300 transition-colors"
    >
      <h2 className="text-xl font-semibold text-slate-900 mb-2">{title}</h2>
      <p className="text-slate-500 text-sm">{desc}</p>
      <span className="text-amber-700 text-sm mt-3 inline-block">Read →</span>
    </Link>
  );
}
