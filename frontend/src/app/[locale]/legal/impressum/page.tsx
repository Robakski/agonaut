import { useLocale } from "next-intl";

export default function ImpressumPage() {
  const locale = useLocale();
  const de = locale === "de";
  const es = locale === "es";
  const zh = locale === "zh";
  const T = (en: string, de: string, es: string, zh: string) => locale === "de" ? de : locale === "es" ? es : locale === "zh" ? zh : en;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8">Impressum</h1>
      <div className="bg-white border border-slate-200 rounded-xl p-8">
        <p className="text-slate-500 mb-6">
          {T(
            "Information required pursuant to § 5 TMG (German Telemedia Act):",
            "Angaben gemäß § 5 TMG (Telemediengesetz):",
            "Información requerida conforme al § 5 TMG (Ley Alemana de Telemedios):",
            "根据 § 5 TMG（德国电信媒体法）要求提供的信息："
          )}
        </p>

        <div className="space-y-4 text-slate-600">
          <div>
            <h2 className="text-slate-900 font-semibold mb-1">
              {T("Service Provider (Diensteanbieter)", "Diensteanbieter", "Proveedor del servicio (Diensteanbieter)", "服务提供者 (Diensteanbieter)")}
            </h2>
            <p className="text-yellow-400">[{T("Name — to be filled in before launch", "Name – vor Launch ausfüllen", "Nombre — a completar antes del lanzamiento", "名称 — 上线前填写")}]</p>
            <p className="text-yellow-400">[{T("Street and house number", "Straße und Hausnummer", "Calle y número", "街道和门牌号")}]</p>
            <p className="text-yellow-400">[{T("Postal code, City, Germany", "PLZ Ort, Deutschland", "Código postal, Ciudad, Alemania", "邮编, 城市, 德国")}]</p>
          </div>

          <div>
            <h2 className="text-slate-900 font-semibold mb-1">
              {T("Contact (Kontakt)", "Kontakt", "Contacto (Kontakt)", "联系方式 (Kontakt)")}
            </h2>
            <p>{T("Email:", "E-Mail:", "Correo electrónico:", "电子邮件：")} <span className="text-yellow-400">[contact@agonaut.io]</span></p>
            <p>{T("Phone (Telefon):", "Telefon:", "Teléfono (Telefon):", "电话 (Telefon)：")} <span className="text-yellow-400">[{T("Phone number", "Telefonnummer", "Número de teléfono", "电话号码")}]</span></p>
          </div>

          <div>
            <h2 className="text-slate-900 font-semibold mb-1">
              {T("Liability Disclaimer (Haftungsausschluss)", "Haftungsausschluss", "Exención de responsabilidad (Haftungsausschluss)", "免责声明 (Haftungsausschluss)")}
            </h2>
            <p className="text-slate-500 text-sm">
              {T(
                "The contents of this website have been prepared with the greatest possible care. However, we cannot guarantee the accuracy, completeness, or timeliness of the content.",
                "Die Inhalte dieser Webseite wurden mit größtmöglicher Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen.",
                "Los contenidos de este sitio web han sido elaborados con el mayor cuidado posible. Sin embargo, no podemos garantizar la exactitud, integridad o actualidad del contenido.",
                "本网站内容经过最大程度的审慎编制。但我们无法保证内容的准确性、完整性或时效性。"
              )}
            </p>
          </div>
        </div>

        <div className="mt-8 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
          <p className="text-yellow-400 text-sm">
            {T(
              "⚠️ This page must be completed with real contact information before public launch. German law (§5 TMG) requires accurate identification of the service provider. Fines up to €50,000 for non-compliance.",
              "⚠️ Diese Seite muss vor dem öffentlichen Launch mit echten Kontaktdaten vervollständigt werden. Das deutsche Recht (§5 TMG) verlangt eine korrekte Identifikation des Diensteanbieters. Bußgelder bis zu 50.000 € bei Nichteinhaltung.",
              "⚠️ Esta página debe completarse con datos de contacto reales antes del lanzamiento público. La ley alemana (§5 TMG) exige la identificación precisa del proveedor del servicio. Multas de hasta 50.000 € por incumplimiento.",
              "⚠️ 本页面必须在正式上线前填写真实联系信息。德国法律（§5 TMG）要求准确标识服务提供者。违规罚款最高可达 50,000 欧元。"
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
