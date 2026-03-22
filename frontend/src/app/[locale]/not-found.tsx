import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="text-6xl font-black text-slate-200 mb-4">404</div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">{t("title")}</h1>
      <p className="text-slate-400 mb-8 max-w-sm">{t("desc")}</p>
      <div className="flex gap-3">
        <Link
          href="/"
          className="px-6 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-all"
        >
          {t("home")}
        </Link>
        <Link
          href="/bounties"
          className="px-6 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:border-slate-300 transition-all"
        >
          {t("bounties")}
        </Link>
      </div>
    </div>
  );
}
