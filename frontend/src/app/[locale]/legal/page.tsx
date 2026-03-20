import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function LegalPage() {
  const locale = useLocale();
  const de = locale === "de";
  const es = locale === "es";
  const T = (en: string, de: string, es: string) => locale === "de" ? de : locale === "es" ? es : en;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8">{T("Legal", "Rechtliches", "Legal")}</h1>

      <div className="space-y-6">
        <LegalCard
          title={T("Terms of Service", "Nutzungsbedingungen", "Términos de servicio")}
          desc={T(
            "Rules governing the use of the Agonaut platform, including IP rights, fees, scoring, disputes, and liability.",
            "Regeln für die Nutzung der Agonaut-Plattform, einschließlich IP-Rechten, Gebühren, Bewertung, Streitigkeiten und Haftung.",
            "Reglas que rigen el uso de la plataforma Agonaut, incluyendo derechos de PI, tarifas, puntuación, disputas y responsabilidad."
          )}
          href="/legal/terms"
          readLabel={T("Read →", "Lesen →", "Leer →")}
        />
        <LegalCard
          title={T("Privacy Policy", "Datenschutzerklärung", "Política de privacidad")}
          desc={T(
            "How we collect, use, and protect your personal data in compliance with GDPR and German data protection law.",
            "Wie wir deine personenbezogenen Daten gemäß DSGVO und deutschem Datenschutzrecht erheben, verwenden und schützen.",
            "Cómo recopilamos, usamos y protegemos tus datos personales de acuerdo con el RGPD y la legislación alemana de protección de datos."
          )}
          href="/legal/privacy"
          readLabel={T("Read →", "Lesen →", "Leer →")}
        />
        <LegalCard
          title="Impressum"
          desc={T(
            "Legal notice required by German law (§5 TMG) identifying the operator of this service.",
            "Gesetzlich vorgeschriebenes Impressum gemäß § 5 TMG zur Identifikation des Betreibers dieses Dienstes.",
            "Aviso legal exigido por la legislación alemana (§5 TMG) que identifica al operador de este servicio."
          )}
          href="/legal/impressum"
          readLabel={T("Read →", "Lesen →", "Leer →")}
        />
      </div>

      <div className="mt-12 bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">{T("Compliance", "Compliance", "Cumplimiento normativo")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="text-slate-500 font-medium mb-2">KYC/AML</h3>
            <ul className="text-slate-400 space-y-1">
              <li>{T("• Tiered identity verification", "• Stufenweise Identitätsverifizierung", "• Verificación de identidad por niveles")}</li>
              <li>{T("• Sanctions screening on every wallet interaction", "• Sanktionsprüfung bei jeder Wallet-Interaktion", "• Verificación de sanciones en cada interacción de wallet")}</li>
              <li>{T("• OFAC, EU, UN sanctions lists enforced", "• OFAC-, EU-, UN-Sanktionslisten werden durchgesetzt", "• Listas de sanciones OFAC, UE, ONU aplicadas")}</li>
              <li>{T("• Suspicious activity monitoring", "• Überwachung verdächtiger Aktivitäten", "• Monitoreo de actividad sospechosa")}</li>
            </ul>
          </div>
          <div>
            <h3 className="text-slate-500 font-medium mb-2">{T("Data Protection", "Datenschutz", "Protección de datos")}</h3>
            <ul className="text-slate-400 space-y-1">
              <li>{T("• GDPR compliant (EU Regulation 2016/679)", "• DSGVO-konform (EU-Verordnung 2016/679)", "• Cumple con el RGPD (Reglamento UE 2016/679)")}</li>
              <li>{T("• BDSG compliant (German Federal Data Protection Act)", "• BDSG-konform (Bundesdatenschutzgesetz)", "• Cumple con el BDSG (Ley Federal Alemana de Protección de Datos)")}</li>
              <li>{T("• No tracking cookies or advertising", "• Keine Tracking-Cookies oder Werbung", "• Sin cookies de rastreo ni publicidad")}</li>
              <li>{T("• Solutions encrypted end-to-end via TEE", "• Lösungen Ende-zu-Ende via TEE verschlüsselt", "• Soluciones cifradas de extremo a extremo mediante TEE")}</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">{T("Blocked Jurisdictions", "Gesperrte Jurisdiktionen", "Jurisdicciones bloqueadas")}</h2>
        <p className="text-slate-500 text-sm mb-4">
          {T(
            "In compliance with international sanctions, the platform is unavailable in:",
            "In Übereinstimmung mit internationalen Sanktionen ist die Plattform in folgenden Ländern nicht verfügbar:",
            "En cumplimiento de las sanciones internacionales, la plataforma no está disponible en:"
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {(de
            ? ["Nordkorea", "Iran", "Syrien", "Kuba", "Myanmar", "Russland"]
            : es
            ? ["Corea del Norte", "Irán", "Siria", "Cuba", "Myanmar", "Rusia"]
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
