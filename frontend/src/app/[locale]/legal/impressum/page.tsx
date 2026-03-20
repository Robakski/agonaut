import { useLocale } from "next-intl";

export default function ImpressumPage() {
  const locale = useLocale();
  const de = locale === "de";

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8">Impressum</h1>
      <div className="bg-white border border-slate-200 rounded-xl p-8">
        <p className="text-slate-500 mb-6">
          {de
            ? "Angaben gemäß § 5 TMG (Telemediengesetz):"
            : "Information required pursuant to § 5 TMG (German Telemedia Act):"}
        </p>

        <div className="space-y-4 text-slate-600">
          <div>
            <h2 className="text-slate-900 font-semibold mb-1">
              {de ? "Diensteanbieter" : "Service Provider (Diensteanbieter)"}
            </h2>
            <p className="text-yellow-400">[{de ? "Name – vor Launch ausfüllen" : "Name — to be filled in before launch"}]</p>
            <p className="text-yellow-400">[{de ? "Straße und Hausnummer" : "Street and house number"}]</p>
            <p className="text-yellow-400">[{de ? "PLZ Ort, Deutschland" : "Postal code, City, Germany"}]</p>
          </div>

          <div>
            <h2 className="text-slate-900 font-semibold mb-1">
              {de ? "Kontakt" : "Contact (Kontakt)"}
            </h2>
            <p>{de ? "E-Mail:" : "Email:"} <span className="text-yellow-400">[contact@agonaut.io]</span></p>
            <p>{de ? "Telefon:" : "Phone (Telefon):"} <span className="text-yellow-400">[{de ? "Telefonnummer" : "Phone number"}]</span></p>
          </div>

          <div>
            <h2 className="text-slate-900 font-semibold mb-1">
              {de ? "Haftungsausschluss" : "Liability Disclaimer (Haftungsausschluss)"}
            </h2>
            <p className="text-slate-500 text-sm">
              {de
                ? "Die Inhalte dieser Webseite wurden mit größtmöglicher Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen."
                : "The contents of this website have been prepared with the greatest possible care. However, we cannot guarantee the accuracy, completeness, or timeliness of the content."}
            </p>
          </div>
        </div>

        <div className="mt-8 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
          <p className="text-yellow-400 text-sm">
            {de
              ? "⚠️ Diese Seite muss vor dem öffentlichen Launch mit echten Kontaktdaten vervollständigt werden. Das deutsche Recht (§5 TMG) verlangt eine korrekte Identifikation des Diensteanbieters. Bußgelder bis zu 50.000 € bei Nichteinhaltung."
              : "⚠️ This page must be completed with real contact information before public launch. German law (§5 TMG) requires accurate identification of the service provider. Fines up to €50,000 for non-compliance."}
          </p>
        </div>
      </div>
    </div>
  );
}
