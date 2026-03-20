import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function LegalPage() {
  const locale = useLocale();
  const de = locale === "de";

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8">{de ? "Rechtliches" : "Legal"}</h1>

      <div className="space-y-6">
        <LegalCard
          title={de ? "Nutzungsbedingungen" : "Terms of Service"}
          desc={de
            ? "Regeln für die Nutzung der Agonaut-Plattform, einschließlich IP-Rechten, Gebühren, Bewertung, Streitigkeiten und Haftung."
            : "Rules governing the use of the Agonaut platform, including IP rights, fees, scoring, disputes, and liability."}
          href="/legal/terms"
          readLabel={de ? "Lesen →" : "Read →"}
        />
        <LegalCard
          title={de ? "Datenschutzerklärung" : "Privacy Policy"}
          desc={de
            ? "Wie wir deine personenbezogenen Daten gemäß DSGVO und deutschem Datenschutzrecht erheben, verwenden und schützen."
            : "How we collect, use, and protect your personal data in compliance with GDPR and German data protection law."}
          href="/legal/privacy"
          readLabel={de ? "Lesen →" : "Read →"}
        />
        <LegalCard
          title="Impressum"
          desc={de
            ? "Gesetzlich vorgeschriebenes Impressum gemäß § 5 TMG zur Identifikation des Betreibers dieses Dienstes."
            : "Legal notice required by German law (§5 TMG) identifying the operator of this service."}
          href="/legal/impressum"
          readLabel={de ? "Lesen →" : "Read →"}
        />
      </div>

      <div className="mt-12 bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">{de ? "Compliance" : "Compliance"}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="text-slate-500 font-medium mb-2">KYC/AML</h3>
            <ul className="text-slate-400 space-y-1">
              <li>{de ? "• Stufenweise Identitätsverifizierung" : "• Tiered identity verification"}</li>
              <li>{de ? "• Sanktionsprüfung bei jeder Wallet-Interaktion" : "• Sanctions screening on every wallet interaction"}</li>
              <li>{de ? "• OFAC-, EU-, UN-Sanktionslisten werden durchgesetzt" : "• OFAC, EU, UN sanctions lists enforced"}</li>
              <li>{de ? "• Überwachung verdächtiger Aktivitäten" : "• Suspicious activity monitoring"}</li>
            </ul>
          </div>
          <div>
            <h3 className="text-slate-500 font-medium mb-2">{de ? "Datenschutz" : "Data Protection"}</h3>
            <ul className="text-slate-400 space-y-1">
              <li>{de ? "• DSGVO-konform (EU-Verordnung 2016/679)" : "• GDPR compliant (EU Regulation 2016/679)"}</li>
              <li>{de ? "• BDSG-konform (Bundesdatenschutzgesetz)" : "• BDSG compliant (German Federal Data Protection Act)"}</li>
              <li>{de ? "• Keine Tracking-Cookies oder Werbung" : "• No tracking cookies or advertising"}</li>
              <li>{de ? "• Lösungen Ende-zu-Ende via TEE verschlüsselt" : "• Solutions encrypted end-to-end via TEE"}</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">{de ? "Gesperrte Jurisdiktionen" : "Blocked Jurisdictions"}</h2>
        <p className="text-slate-500 text-sm mb-4">
          {de
            ? "In Übereinstimmung mit internationalen Sanktionen ist die Plattform in folgenden Ländern nicht verfügbar:"
            : "In compliance with international sanctions, the platform is unavailable in:"}
        </p>
        <div className="flex flex-wrap gap-2">
          {(de
            ? ["Nordkorea", "Iran", "Syrien", "Kuba", "Myanmar", "Russland"]
            : ["North Korea", "Iran", "Syria", "Cuba", "Myanmar", "Russia"]
          ).map((country) => (
            <span key={country} className="text-xs bg-slate-100 text-slate-600 border border-slate-300 px-3 py-1 rounded">
              {country}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function LegalCard({ title, desc, href, readLabel }: { title: string; desc: string; href: string; readLabel: string }) {
  return (
    <Link
      href={href}
      className="block bg-white border border-slate-200 rounded-xl p-6 hover:border-amber-300 transition-colors"
    >
      <h2 className="text-xl font-semibold text-slate-900 mb-2">{title}</h2>
      <p className="text-slate-500 text-sm">{desc}</p>
      <span className="text-amber-700 text-sm mt-3 inline-block">{readLabel}</span>
    </Link>
  );
}
