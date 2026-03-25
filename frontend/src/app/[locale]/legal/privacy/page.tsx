import { useTranslations } from "next-intl";

export default function PrivacyPage() {
  const t = useTranslations("legalPrivacy");

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-slate-500 text-sm mb-8">{t("lastUpdated")}</p>

      <div className="prose prose-slate max-w-none space-y-8 text-slate-600 text-sm leading-relaxed">

        <Section title={t("s1Title")}>
          <p>
            {t.rich("s1Text", { placeholder: (chunks) => <Placeholder>{chunks}</Placeholder> })}
          </p>
        </Section>

        <Section title={t("s2Title")}>
          <h3 className="text-slate-900 font-medium mt-3 mb-2">{t("s2_1Title")}</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("s2_1_1")}</li>
            <li>{t("s2_1_2")}</li>
            <li>{t("s2_1_3")}</li>
          </ul>

          <h3 className="text-slate-900 font-medium mt-3 mb-2">{t("s2_2Title")}</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("s2_2_1")}</li>
            <li>{t("s2_2_2")}</li>
            <li>{t("s2_2_3")}</li>
            <li>{t("s2_2_4")}</li>
          </ul>

          <h3 className="text-slate-900 font-medium mt-3 mb-2">{t("s2_3Title")}</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("s2_3_1")}</li>
            <li>{t("s2_3_2")}</li>
            <li>{t("s2_3_3")}</li>
          </ul>

          <h3 className="text-slate-900 font-medium mt-3 mb-2">{t("s2_4Title")}</h3>
          <p>{t("s2_4Text")}</p>
        </Section>

        <Section title={t("s3Title")}>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t.rich("s3_1", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s3_2", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s3_3", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
          </ul>
        </Section>

        <Section title={t("s4Title")}>
          <p>{t("s4Intro")}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t.rich("s4_1", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s4_2", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s4_3", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s4_4", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
          </ul>
          <p>{t("s4NoSell")}</p>
        </Section>

        <Section title={t("s5Title")}>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t.rich("s5_1", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s5_2", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s5_3", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s5_4", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s5_5", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s5_6", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s5_7", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
          </ul>
        </Section>

        <Section title={t("s6Title")}>
          <p>{t("s6Intro")}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t.rich("s6_1", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s6_2", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s6_3", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s6_4", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s6_5", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t.rich("s6_6", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
          </ul>
          <p>{t.rich("s6Exercise", { placeholder: (chunks) => <Placeholder>{chunks}</Placeholder> })}</p>
          <p>{t.rich("s6Note", { strong: (chunks) => <strong>{chunks}</strong> })}</p>
        </Section>

        <Section title={t("s7Title")}>
          <ul className="list-disc pl-6 space-y-1">
            <li>{t("s7_1")}</li>
            <li>{t("s7_2")}</li>
            <li>{t("s7_3")}</li>
            <li>{t("s7_4")}</li>
          </ul>
        </Section>

        <Section title={t("s8Title")}>
          <p>{t("s8Text")}</p>
        </Section>

        <Section title={t("s9Title")}>
          <p>{t("s9Text")}</p>
        </Section>

        <Section title={t("s10Title")}>
          <p>{t("s10Text")}</p>
        </Section>

        <Section title={t("s11Title")}>
          <p>{t("s11Text")}</p>
        </Section>

        <Section title={t("s12Title")}>
          <p>{t.rich("s12Text", { placeholder: (chunks) => <Placeholder>{chunks}</Placeholder> })}</p>
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
