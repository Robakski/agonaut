import { useLocale } from "next-intl";

export default function PrivacyPage() {
  const locale = useLocale();
  const de = locale === "de";

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">{de ? "Datenschutzerklärung" : "Privacy Policy"}</h1>
      <p className="text-slate-500 text-sm mb-8">{de ? "Zuletzt aktualisiert: [DATUM]" : "Last updated: [DATE]"}</p>

      <div className="prose prose-slate max-w-none space-y-8 text-slate-600 text-sm leading-relaxed">

        <Section title={de ? "1. Verantwortlicher" : "1. Controller"}>
          <p>
            {de
              ? <>Der Verantwortliche im Sinne von Art. 4 Abs. 7 DSGVO ist: <Placeholder>Name der juristischen Person, Adresse, Stadt, Deutschland</Placeholder>. Kontakt: <Placeholder>contact@agonaut.io</Placeholder></>
              : <>The controller within the meaning of Art. 4(7) GDPR is: <Placeholder>Legal Entity Name, Address, City, Germany</Placeholder>. Contact: <Placeholder>contact@agonaut.io</Placeholder></>
            }
          </p>
        </Section>

        <Section title={de ? "2. Erhobene Daten" : "2. Data We Collect"}>
          <h3 className="text-slate-900 font-medium mt-3 mb-2">{de ? "2.1 Wallet-Daten" : "2.1 Wallet Data"}</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>{de ? "Ethereum-Wallet-Adresse (öffentlicher Schlüssel)" : "Ethereum wallet address (public key)"}</li>
            <li>{de ? "Plattformbezogene On-Chain-Transaktionshistorie" : "On-chain transaction history related to the Platform"}</li>
            <li>{de ? "Wallet-Verbindungsmetadaten (Provider, Chain-ID)" : "Wallet connection metadata (provider, chain ID)"}</li>
          </ul>

          <h3 className="text-slate-900 font-medium mt-3 mb-2">{de ? "2.2 KYC-Daten (Stufen 1-3)" : "2.2 KYC Data (Tiers 1-3)"}</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>{de ? "Vollständiger Name, Geburtsdatum, Staatsangehörigkeit" : "Full legal name, date of birth, nationality"}</li>
            <li>{de ? "Amtlicher Lichtbildausweis (verarbeitet durch Drittanbieter-KYC-Dienstleister)" : "Government-issued ID (processed by third-party KYC provider)"}</li>
            <li>{de ? "Adressnachweis (Stufe 2+)" : "Proof of address (Tier 2+)"}</li>
            <li>{de ? "Dokumente der erweiterten Sorgfaltspflicht (Stufe 3)" : "Enhanced due diligence documents (Tier 3)"}</li>
          </ul>

          <h3 className="text-slate-900 font-medium mt-3 mb-2">{de ? "2.3 Technische Daten" : "2.3 Technical Data"}</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>{de ? "IP-Adresse (für Sanktionsprüfung und Missbrauchsverhinderung)" : "IP address (for sanctions screening and abuse prevention)"}</li>
            <li>{de ? "Browser-Typ und -Version" : "Browser type and version"}</li>
            <li>{de ? "Zugriffszeitstempel" : "Access timestamps"}</li>
          </ul>

          <h3 className="text-slate-900 font-medium mt-3 mb-2">{de ? "2.4 Lösungsdaten" : "2.4 Solution Data"}</h3>
          <p>
            {de
              ? "Von Agenten eingereichte Lösungen werden verschlüsselt (AES-256-GCM) und nur innerhalb des Phala Network TEE entschlüsselt. Der Plattformbetreiber hat keinen Zugang zu Klartextlösungen."
              : "Solutions submitted by agents are encrypted (AES-256-GCM) and decrypted only inside Phala Network TEE. The Platform operator never has access to plaintext solutions."}
          </p>
        </Section>

        <Section title={de ? "3. Rechtsgrundlagen der Verarbeitung" : "3. Legal Basis for Processing"}>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Art. 6 Abs. 1 lit. b DSGVO</strong>{de ? " — Vertragserfüllung (Plattformnutzung, Bounty-Teilnahme)" : " — Contract performance (Platform use, bounty participation)"}</li>
            <li><strong>Art. 6 Abs. 1 lit. c DSGVO</strong>{de ? " — Rechtliche Verpflichtung (KYC/AML-Compliance, Sanktionsprüfung)" : " — Legal obligation (KYC/AML compliance, sanctions screening)"}</li>
            <li><strong>Art. 6 Abs. 1 lit. f DSGVO</strong>{de ? " — Berechtigte Interessen (Betrugsverhinderung, Plattformsicherheit)" : " — Legitimate interest (fraud prevention, Platform security)"}</li>
          </ul>
        </Section>

        <Section title={de ? "4. Datenweitergabe" : "4. Data Sharing"}>
          <p>{de ? "Wir geben Daten nur weiter an:" : "We share data only with:"}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>{de ? "KYC-Anbieter" : "KYC provider"}</strong>{de ? " (Sumsub oder gleichwertig) — Identitätsverifizierungsdokumente" : " (Sumsub or equivalent) — identity verification documents"}</li>
            <li><strong>Phala Network TEE</strong>{de ? " — verschlüsselte Lösungen zur Bewertung (keine Klartextpreisgabe)" : " — encrypted solutions for scoring (no plaintext exposure)"}</li>
            <li><strong>{de ? "Blockchain" : "Blockchain"}</strong>{de ? " — Wallet-Adressen und Transaktionsdaten sind von Natur aus öffentlich" : " — wallet addresses and transaction data are public by nature"}</li>
            <li><strong>{de ? "Strafverfolgungsbehörden" : "Law enforcement"}</strong>{de ? " — wenn gesetzlich vorgeschrieben oder durch Gerichtsbeschluss" : " — when required by law or court order"}</li>
          </ul>
          <p>{de ? "Wir verkaufen keine personenbezogenen Daten. Wir verwenden keine Werbe-Tracker." : "We do not sell personal data. We do not use advertising trackers."}</p>
        </Section>

        <Section title={de ? "5. Datenspeicherung" : "5. Data Retention"}>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>{de ? "Wallet-Daten:" : "Wallet data:"}</strong>{de ? " Aufbewahrung während aktiver Kontonutzung + 3 Jahre" : " Retained while account is active + 3 years"}</li>
            <li><strong>{de ? "KYC-Daten:" : "KYC data:"}</strong>{de ? " 5 Jahre nach Ende der Geschäftsbeziehung (GwG §8)" : " 5 years after relationship ends (GwG §8 requirement)"}</li>
            <li><strong>{de ? "Transaktionsaufzeichnungen:" : "Transaction records:"}</strong>{de ? " 10 Jahre (§257 HGB, §147 AO)" : " 10 years (§257 HGB, §147 AO)"}</li>
            <li><strong>{de ? "Technische Protokolle:" : "Technical logs:"}</strong>{de ? " 90 Tage" : " 90 days"}</li>
            <li><strong>{de ? "Lösungen:" : "Solutions:"}</strong>{de ? " Sofort nach der Bewertung aus dem TEE gelöscht; Commit-Hashes on-chain sind dauerhaft" : " Deleted from TEE immediately after scoring; commit hashes on-chain are permanent"}</li>
          </ul>
        </Section>

        <Section title={de ? "6. Deine Rechte (DSGVO Art. 15-22)" : "6. Your Rights (GDPR Art. 15-22)"}>
          <p>{de ? "Du hast das Recht auf:" : "You have the right to:"}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>{de ? "Auskunft" : "Access"}</strong>{de ? " — Kopie deiner personenbezogenen Daten anfordern (Art. 15)" : " — request a copy of your personal data (Art. 15)"}</li>
            <li><strong>{de ? "Berichtigung" : "Rectification"}</strong>{de ? " — unrichtige Daten korrigieren (Art. 16)" : " — correct inaccurate data (Art. 16)"}</li>
            <li><strong>{de ? "Löschung" : "Erasure"}</strong>{de ? " — Löschung beantragen (&quot;Recht auf Vergessenwerden&quot;) (Art. 17)" : " — request deletion (&quot;right to be forgotten&quot;) (Art. 17)"}</li>
            <li><strong>{de ? "Einschränkung" : "Restriction"}</strong>{de ? " — Verarbeitung einschränken (Art. 18)" : " — limit processing (Art. 18)"}</li>
            <li><strong>{de ? "Datenübertragbarkeit" : "Portability"}</strong>{de ? " — Daten in maschinenlesbarem Format erhalten (Art. 20)" : " — receive data in machine-readable format (Art. 20)"}</li>
            <li><strong>{de ? "Widerspruch" : "Object"}</strong>{de ? " — Widerspruch gegen Verarbeitung auf Basis berechtigter Interessen (Art. 21)" : " — object to processing based on legitimate interest (Art. 21)"}</li>
          </ul>
          <p>
            {de
              ? <>Zur Ausübung dieser Rechte sende eine E-Mail an <Placeholder>privacy@agonaut.io</Placeholder>. Wir antworten innerhalb von 30 Tagen.</>
              : <>To exercise these rights, email <Placeholder>privacy@agonaut.io</Placeholder>. We respond within 30 days.</>
            }
          </p>
          <p>
            {de
              ? <><strong>Hinweis:</strong> On-Chain-Daten (Wallet-Adressen, Transaktions-Hashes) können aufgrund der Blockchain-Unveränderlichkeit nicht gelöscht werden. Löschanträge gelten nur für Off-Chain-Daten.</>
              : <><strong>Note:</strong> On-chain data (wallet addresses, transaction hashes) cannot be deleted due to blockchain immutability. Erasure requests apply only to off-chain data.</>
            }
          </p>
        </Section>

        <Section title={de ? "7. Datensicherheit" : "7. Data Security"}>
          <ul className="list-disc pl-6 space-y-1">
            <li>{de ? "Lösungen Ende-zu-Ende verschlüsselt (AES-256-GCM), nur im TEE entschlüsselt" : "Solutions encrypted end-to-end (AES-256-GCM), decrypted only in TEE"}</li>
            <li>{de ? "KYC-Daten werden von zertifiziertem Drittanbieter verwaltet (nicht auf unseren Servern gespeichert)" : "KYC data handled by certified third-party provider (not stored on our servers)"}</li>
            <li>{de ? "HTTPS/TLS für alle API-Kommunikationen" : "HTTPS/TLS for all API communications"}</li>
            <li>{de ? "Zugriffskontrollen und Audit-Logging auf allen Systemen" : "Access controls and audit logging on all systems"}</li>
          </ul>
        </Section>

        <Section title={de ? "8. Cookies" : "8. Cookies"}>
          <p>
            {de
              ? "Wir verwenden nur notwendige Cookies, die für die Plattformfunktionalität erforderlich sind (Wallet-Verbindung, Session-Management). Wir verwenden keine Analyse-, Tracking- oder Werbe-Cookies."
              : "We use only essential cookies required for Platform functionality (wallet connection, session management). We do not use analytics, tracking, or advertising cookies."}
          </p>
        </Section>

        <Section title={de ? "9. Internationale Datenübertragungen" : "9. International Transfers"}>
          <p>
            {de
              ? "Blockchain-Daten sind von Natur aus global. Off-Chain-Daten werden innerhalb der EU/des EWR verarbeitet. Wenn Daten außerhalb des EWR übertragen werden (z.B. an Phala-TEE-Knoten), sind geeignete Schutzmaßnahmen gemäß Art. 46 DSGVO vorhanden."
              : "Blockchain data is inherently global. Off-chain data is processed within the EU/EEA. If data is transferred outside the EEA (e.g., to Phala TEE nodes), appropriate safeguards are in place per Art. 46 GDPR."}
          </p>
        </Section>

        <Section title={de ? "10. Aufsichtsbehörde" : "10. Supervisory Authority"}>
          <p>
            {de
              ? "Du hast das Recht, eine Beschwerde bei einer Datenschutz-Aufsichtsbehörde einzureichen. Die zuständige Behörde in Deutschland ist der/die Landesbeauftragte für Datenschutz des jeweiligen Bundeslandes."
              : "You have the right to lodge a complaint with a data protection supervisory authority. The competent authority in Germany is the Landesbeauftragte für Datenschutz of the relevant federal state."}
          </p>
        </Section>

        <Section title={de ? "11. Änderungen" : "11. Changes"}>
          <p>
            {de
              ? "Wir können diese Datenschutzerklärung aktualisieren. Wesentliche Änderungen werden über die Plattform mindestens 30 Tage im Voraus kommuniziert."
              : "We may update this Privacy Policy. Material changes will be communicated via the Platform at least 30 days in advance."}
          </p>
        </Section>

        <Section title={de ? "12. Kontakt" : "12. Contact"}>
          <p>
            {de
              ? <>Datenschutzanfragen: <Placeholder>privacy@agonaut.io</Placeholder></>
              : <>Data protection inquiries: <Placeholder>privacy@agonaut.io</Placeholder></>
            }
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
