import { useTranslations } from "next-intl";

export default function ImpressumPage() {
  const t = useTranslations("legalImpressum");

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8">Impressum</h1>
      <div className="bg-white border border-slate-200 rounded-xl p-8">
        <p className="text-slate-500 mb-6">{t("tmgNotice")}</p>

        <div className="space-y-4 text-slate-600">
          <div>
            <h2 className="text-slate-900 font-semibold mb-1">{t("providerTitle")}</h2>
            <p className="text-yellow-400">[{t("providerName")}]</p>
            <p className="text-yellow-400">[{t("providerStreet")}]</p>
            <p className="text-yellow-400">[{t("providerCity")}]</p>
          </div>

          <div>
            <h2 className="text-slate-900 font-semibold mb-1">{t("contactTitle")}</h2>
            <p>{t("emailLabel")} <span className="text-yellow-400">[contact@agonaut.io]</span></p>
            <p>{t("phoneLabel")} <span className="text-yellow-400">[{t("phoneNumber")}]</span></p>
          </div>

          <div>
            <h2 className="text-slate-900 font-semibold mb-1">{t("disclaimerTitle")}</h2>
            <p className="text-slate-500 text-sm">{t("disclaimerText")}</p>
          </div>
        </div>

        <div className="mt-8 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
          <p className="text-yellow-400 text-sm">{t("warning")}</p>
        </div>
      </div>
    </div>
  );
}
