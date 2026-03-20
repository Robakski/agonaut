import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function LegalPage() {
  const t = useTranslations("legalHub");

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8">{t("title")}</h1>

      <div className="space-y-6">
        <LegalCard
          title={t("termsTitle")}
          desc={t("termsDesc")}
          href="/legal/terms"
          readLabel={t("readMore")}
        />
        <LegalCard
          title={t("privacyTitle")}
          desc={t("privacyDesc")}
          href="/legal/privacy"
          readLabel={t("readMore")}
        />
        <LegalCard
          title="Impressum"
          desc={t("impressumDesc")}
          href="/legal/impressum"
          readLabel={t("readMore")}
        />
      </div>

      <div className="mt-12 bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">{t("complianceTitle")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h3 className="text-slate-500 font-medium mb-2">KYC/AML</h3>
            <ul className="text-slate-400 space-y-1">
              <li>{t("kycTiered")}</li>
              <li>{t("kycSanctions")}</li>
              <li>{t("kycOFAC")}</li>
              <li>{t("kycSuspicious")}</li>
            </ul>
          </div>
          <div>
            <h3 className="text-slate-500 font-medium mb-2">{t("dataProtectionTitle")}</h3>
            <ul className="text-slate-400 space-y-1">
              <li>{t("dpGDPR")}</li>
              <li>{t("dpBDSG")}</li>
              <li>{t("dpNoCookies")}</li>
              <li>{t("dpTEE")}</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-slate-50 border border-slate-200 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">{t("blockedTitle")}</h2>
        <p className="text-slate-500 text-sm mb-4">{t("blockedDesc")}</p>
        <div className="flex flex-wrap gap-2">
          {(["northKorea", "iran", "syria", "cuba", "myanmar", "russia"] as const).map((key) => (
            <span key={key} className="text-xs bg-slate-100 text-slate-600 border border-slate-300 px-3 py-1 rounded">
              {t(`countries.${key}`)}
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
