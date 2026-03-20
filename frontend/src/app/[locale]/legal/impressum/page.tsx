import { useLocale } from "next-intl";

export default function ImpressumPage() {
  const locale = useLocale();
  const de = locale === "de";
  const es = locale === "es";
  const T = (en: string, de: string, es: string) => locale === "de" ? de : locale === "es" ? es : en;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8">Impressum</h1>
      <div className="bg-white border border-slate-200 rounded-xl p-8">
        <p className="text-slate-500 mb-6">
          {T(
            "Information required pursuant to § 5 TMG (German Telemedia Act):",
            "Angaben gemäß § 5 TMG (Telemediengesetz):",
            "Información requerida conforme al § 5 TMG (Ley Alemana de Telemedios):"
          )}
        </p>

        <div className="space-y-4 text-slate-600">
          <div>
            <h2 className="text-slate-900 font-semibold mb-1">
              {T("Service Provider (Diensteanbieter)", "Diensteanbieter", "Proveedor del servicio (Diensteanbieter)")}
            </h2>
            <p className="text-yellow-400">[{T("Name — to be filled in before launch", "Name – vor Launch ausfüllen", "Nombre — a completar antes del lanzamiento")}]</p>
            <p className="text-yellow-400">[{T("Street and house number", "Straße und Hausnummer", "Calle y número")}]</p>
            <p className="text-yellow-400">[{T("Postal code, City, Germany", "PLZ Ort, Deutschland", "Código postal, Ciudad, Alemania")}]</p>
          </div>

          <div>
            <h2 className="text-slate-900 font-semibold mb-1">
              {T("Contact (Kontakt)", "Kontakt", "Contacto (Kontakt)")}
            </h2>
            <p>{T("Email:", "E-Mail:", "Correo electrónico:")} <span className="text-yellow-400">[contact@agonaut.io]</span></p>
            <p>{T("Phone (Telefon):", "Telefon:", "Teléfono (Telefon):")} <span className="text-yellow-400">[{T("Phone number", "Telefonnummer", "Número de teléfono")}]</span></p>
          </div>

          <div>
            <h2 className="text-slate-900 font-semibold mb-1">
              {T("Liability Disclaimer (Haftungsausschluss)", "Haftungsausschluss", "Exención de responsabilidad (Haftungsausschluss)")}
            </h2>
            <p className="text-slate-500 text-sm">
              {T(
                "The contents of this website have been prepared with the greatest possible care. However, we cannot guarantee the accuracy, completeness, or timeliness of the content.",
                "Die Inhalte dieser Webseite wurden mit größtmöglicher Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen.",
                "Los contenidos de este sitio web han sido elaborados con el mayor cuidado posible. Sin embargo, no podemos garantizar la exactitud, integridad o actualidad del contenido."
              )}
            </p>
          </div>
        </div>

        <div className="mt-8 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
          <p className="text-yellow-400 text-sm">
            {T(
              "⚠️ This page must be completed with real contact information before public launch. German law (§5 TMG) requires accurate identification of the service provider. Fines up to €50,000 for non-compliance.",
              "⚠️ Diese Seite muss vor dem öffentlichen Launch mit echten Kontaktdaten vervollständigt werden. Das deutsche Recht (§5 TMG) verlangt eine korrekte Identifikation des Diensteanbieters. Bußgelder bis zu 50.000 € bei Nichteinhaltung.",
              "⚠️ Esta página debe completarse con datos de contacto reales antes del lanzamiento público. La ley alemana (§5 TMG) exige la identificación precisa del proveedor del servicio. Multas de hasta 50.000 € por incumplimiento."
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
