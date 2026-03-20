import { useTranslations } from "next-intl";

export default function TermsPage() {
  const t = useTranslations("legalTerms");

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-slate-500 text-sm mb-8">{t("lastUpdated")}</p>

      <div className="prose prose-slate max-w-none space-y-8 text-slate-600 text-sm leading-relaxed">

        <Section title={t("s1Title")}>
          <p>{t.rich("s1Text", { placeholder: (chunks) => <Placeholder>{chunks}</Placeholder> })}</p>
          <p>{t("s1Agree")}</p>
        </Section>

        <Section title={t("s2Title")}>
          <p>{t("s2Text")}</p>
        </Section>

        <Section title={t("s3Title")}>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("s3_1")}</li>
            <li>{t("s3_2")}</li>
            <li>{t("s3_3")}</li>
            <li>{t("s3_4")}</li>
          </ul>
        </Section>

        <Section title={t("s4Title")}>
          <p>{t.rich("s4Sponsors", { strong: (chunks) => <strong>{chunks}</strong> })}</p>
          <p>{t.rich("s4Agents", { strong: (chunks) => <strong>{chunks}</strong> })}</p>
          <p>{t.rich("s4Arbitrators", { strong: (chunks) => <strong>{chunks}</strong> })}</p>
        </Section>

        <Section title={t("s5Title")}>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t.rich("s5_1", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s5_2", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s5_3", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s5_4", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
          </ul>
          <p>{t("s5AllFees")}</p>
        </Section>

        <Section title={t("s6Title")}>
          <p>{t.rich("s6Phases", { strong: (chunks) => <strong>{chunks}</strong> })}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("s6_1")}</li>
            <li>{t("s6_2")}</li>
            <li>{t("s6_3")}</li>
            <li>{t("s6_4")}</li>
            <li>{t("s6_5")}</li>
          </ul>
        </Section>

        <Section title={t("s7Title")}>
          <p>{t("s7Text")}</p>
        </Section>

        <Section title={t("s8Title")}>
          <p>{t("s8Text1")}</p>
          <p>{t("s8Text2")}</p>
        </Section>

        <Section title={t("s9Title")}>
          <p>{t("s9Text")}</p>
        </Section>

        <Section title={t("s10Title")}>
          <p>{t.rich("s10Text1", { strong: (chunks) => <strong>{chunks}</strong> })}</p>
          <p>{t("s10Text2")}</p>
          <p>{t("s10Text3")}</p>
        </Section>

        <Section title={t("s11Title")}>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("s11_1")}</li>
            <li>{t("s11_2")}</li>
            <li>{t("s11_3")}</li>
            <li>{t("s11_4")}</li>
            <li>{t("s11_5")}</li>
            <li>{t("s11_6")}</li>
          </ul>
        </Section>

        <Section title={t("s12Title")}>
          <p>{t("s12Text")}</p>
        </Section>

        <Section title={t("s13Title")}>
          <p>{t("s13Intro")}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("s13_1")}</li>
            <li>{t("s13_2")}</li>
            <li>{t("s13_3")}</li>
            <li>{t("s13_4")}</li>
          </ul>
          <p>{t("s13Cap")}</p>
        </Section>

        <Section title={t("s14Title")}>
          <p>{t("s14Text")}</p>
        </Section>

        <Section title={t("s15Title")}>
          <p>{t.rich("s15Text", { link: (chunks) => <a href="/legal/privacy" className="text-amber-700 underline">{chunks}</a> })}</p>
        </Section>

        <Section title={t("s16Title")}>
          <p>{t("s16Text")}</p>
        </Section>

        <Section title={t("s17Title")}>
          <p>{t("s17Text")}</p>
        </Section>

        <Section title={t("s18Title")}>
          <p>{t("s18Text")}</p>
        </Section>

        <Section title={t("s19Title")}>
          <p>{t("s19Intro")}</p>
          <div className="flex flex-wrap gap-2 my-3">
            {(["northKorea", "iran", "syria", "cuba", "myanmar", "russia"] as const).map((key) => (
              <span key={key} className="text-xs bg-slate-100 text-slate-600 border border-slate-300 px-3 py-1 rounded">
                {t(`countries.${key}`)}
              </span>
            ))}
          </div>
          <p>{t("s19Responsibility")}</p>
        </Section>

        <Section title={t("s20Title")}>
          <p>{t.rich("s20Text", { placeholder: (chunks) => <Placeholder>{chunks}</Placeholder> })}</p>
        </Section>

        <Section title={t("s21Title")}>
          <p>{t.rich("s21Text", { placeholder: (chunks) => <Placeholder>{chunks}</Placeholder> })}</p>
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
