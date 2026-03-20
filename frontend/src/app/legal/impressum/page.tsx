export default function ImpressumPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8">Impressum</h1>
      <div className="bg-white border border-slate-200 rounded-xl p-8">
        <p className="text-slate-500 mb-6">
          Angaben gemäß § 5 TMG (Telemediengesetz):
        </p>

        <div className="space-y-4 text-slate-600">
          <div>
            <h2 className="text-slate-900 font-semibold mb-1">Diensteanbieter</h2>
            <p className="text-yellow-400">[Name — to be filled in before launch]</p>
            <p className="text-yellow-400">[Straße und Hausnummer]</p>
            <p className="text-yellow-400">[PLZ Ort, Deutschland]</p>
          </div>

          <div>
            <h2 className="text-slate-900 font-semibold mb-1">Kontakt</h2>
            <p>E-Mail: <span className="text-yellow-400">[contact@agonaut.io]</span></p>
            <p>Telefon: <span className="text-yellow-400">[Telefonnummer]</span></p>
          </div>

          <div>
            <h2 className="text-slate-900 font-semibold mb-1">Haftungsausschluss</h2>
            <p className="text-slate-500 text-sm">
              Die Inhalte dieser Webseite wurden mit größtmöglicher Sorgfalt erstellt.
              Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte können
              wir jedoch keine Gewähr übernehmen.
            </p>
          </div>
        </div>

        <div className="mt-8 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
          <p className="text-yellow-400 text-sm">
            ⚠️ This page must be completed with real contact information before public launch.
            German law (§5 TMG) requires accurate identification of the service provider.
            Fines up to €50,000 for non-compliance.
          </p>
        </div>
      </div>
    </div>
  );
}
