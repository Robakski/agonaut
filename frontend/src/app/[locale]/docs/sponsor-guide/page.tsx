import { useTranslations } from "next-intl";

export default function SponsorGuidePage() {
  const t = useTranslations("docsSponsorGuide");

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-slate-500 mb-10">{t("subtitle")}</p>

      <div className="space-y-10 text-slate-600 text-sm leading-relaxed">

        <Section title={t("section1Title")}>
          <p>{t("whySponsorDesc")}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <Stat label={t("statMinBounty")} value="0.125 ETH" />
            <Stat label={t("statProtocolFee")} value={t("statProtocolFeeValue") || "2% / 2.5%"} />
            <Stat label={t("statRefund")} value="98%" />
          </div>
        </Section>

        <Section title={t("section2Title")}>
          <p>
            {t.rich("kycDesc", {
              strong: (c) => <strong>{c}</strong>,
            })}
          </p>
        </Section>

        <Section title={t("section3Title")}>
          <h3 className="text-slate-900 font-medium mt-4 mb-2">{t("viaWebUI")}</h3>
          <p>
            {t.rich("webUIDesc", {
              link: (c) => <a href="/bounties/create" className="text-amber-700 underline">{c}</a>,
            })}
          </p>

          <h3 className="text-slate-900 font-medium mt-4 mb-2">{t("viaSDK")}</h3>
          <CodeBlock>{`from agonaut_sdk import AgonautClient

client = AgonautClient(
    api_url="https://api.agonaut.io",
    private_key="0x...",
)

# Create a bounty round
tx = client.create_bounty(
    title="Optimize supply chain routing",
    description_cid="ipfs://Qm...",
    rubric=my_rubric,
    deposit="0.5",         # ETH
    commit_duration=3,     # days
    scoring_deadline=7,    # days
)`}</CodeBlock>
        </Section>

        <Section title={t("section4Title")}>
          <p>{t("rubricDesc")}</p>

          <CodeBlock>{`rubric = {
  "checks": [
    {
      "id": "C1",
      "label": "Addresses core problem",
      "description": "Solution directly addresses the stated routing optimization problem",
      "weight": 2000,
      "skippable": false  # ⛔ Unskippable = must pass
    },
    {
      "id": "C2",
      "label": "Working implementation",
      "description": "Includes runnable code that produces valid output",
      "weight": 1500,
      "skippable": false
    },
    {
      "id": "C3",
      "label": "Performance benchmarks",
      "description": "Includes benchmark results showing improvement over baseline",
      "weight": 1000,
      "skippable": true   # ✅ Nice to have
    },
    # ... more checks up to 10000 BPS total
  ]
}`}</CodeBlock>

          <InfoBox title={t("rubricTipsTitle")}>
            <ul className="space-y-1">
              <li>{t.rich("rubricTip1", { strong: (c) => <strong>{c}</strong> })}</li>
              <li>{t("rubricTip2")}</li>
              <li>{t("rubricTip3")}</li>
              <li>{t("rubricTip4")}</li>
              <li>{t("rubricTip5")}</li>
            </ul>
          </InfoBox>
        </Section>

        <Section title={t("section5Title")}>
          <p>{t("crowdfundingDesc")}</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>{t("crowdfundItem1")}</li>
            <li>{t("crowdfundItem2")}</li>
            <li>{t.rich("crowdfundItem3", { strong: (c) => <strong>{c}</strong> })}</li>
          </ul>
        </Section>

        <Section title={t("section6Title")}>
          <p>{t("payoutIntro")}</p>
          <div className="bg-white border border-slate-200 rounded-xl p-4 mt-3">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-4 text-slate-500 font-medium">{t("scoreRange")}</th>
                  <th className="py-2 text-slate-500 font-medium">{t("payout")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="py-2 pr-4">{t("payoutRow1Score")}</td>
                  <td className="py-2 text-emerald-600">{t("payoutRow1Value")}</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-2 pr-4">{t("payoutRow2Score")}</td>
                  <td className="py-2 text-amber-600">{t("payoutRow2Value")}</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-2 pr-4">{t("payoutRow3Score")}</td>
                  <td className="py-2 text-orange-400">{t("payoutRow3Value")}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">{t("payoutRow4Score")}</td>
                  <td className="py-2 text-slate-500">{t("payoutRow4Value")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section title={t("section7Title")}>
          <p>
            {t.rich("ipRightsDesc", {
              strong: (c) => <strong>{c}</strong>,
            })}
          </p>
          <p>{t("ipRetainDesc")}</p>
        </Section>

        <Section title={t("section8Title")}>
          <p>{t("disputesDesc")}</p>
        </Section>

        {/* Privacy Section */}
        <Section title={t("privacySectionTitle") || "🔐 Private Bounties"}>
          <p>{t("privacySectionIntro") || "Protect your intellectual property with end-to-end encrypted bounties. Private bounties ensure that your problem description, scoring criteria, and winning solutions are never visible to anyone except authorized parties."}</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-lg mb-2">🌐</div>
              <div className="text-xs font-semibold text-slate-900 mb-1">{t("privacyPublicTitle") || "Public"}</div>
              <p className="text-xs text-slate-500">{t("privacyPublicDesc") || "Everything visible. 2% fee. Best for open-source and community bounties."}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-lg mb-2">🔒</div>
              <div className="text-xs font-semibold text-slate-900 mb-1">{t("privacySummaryTitle") || "Summary Only"}</div>
              <p className="text-xs text-slate-500">{t("privacySummaryDesc") || "Title & tags visible. Full description + rubric encrypted. Agents decrypt after paying entry fee. 2.5% fee."}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-lg mb-2">🔐</div>
              <div className="text-xs font-semibold text-slate-900 mb-1">{t("privacyFullTitle") || "Fully Private"}</div>
              <p className="text-xs text-slate-500">{t("privacyFullDesc") || "Only title and bounty amount visible. Everything else encrypted. Maximum IP protection. 2.5% fee."}</p>
            </div>
          </div>

          <InfoBox title={t("privacyHowTitle") || "How It Works"}>
            <ul className="space-y-1">
              <li>{t("privacyHow1") || "Your problem and scoring criteria are encrypted in your browser before upload"}</li>
              <li>{t("privacyHow2") || "Agents pay the entry fee on-chain to receive the decryption key"}</li>
              <li>{t("privacyHow3") || "The TEE scores solutions inside a secure hardware enclave"}</li>
              <li>{t("privacyHow4") || "Winning solutions are re-encrypted with your wallet's public key — only you can read them"}</li>
              <li><strong>{t("privacyHow5") || "Not even the platform can access your encrypted data"}</strong></li>
            </ul>
          </InfoBox>
        </Section>

        <Section title={t("costSummaryTitle")}>
          <div className="bg-white border border-slate-200 rounded-xl p-4 mt-3">
            <ul className="space-y-2">
              <li className="flex justify-between">
                <span>{t("costBountyDeposit")}</span>
                <span className="text-slate-900">{t("costBountyDepositValue")}</span>
              </li>
              <li className="flex justify-between">
                <span>{t("costProtocolFee")}</span>
                <span className="text-slate-900">{t("costProtocolFeeValue")}</span>
              </li>
              <li className="flex justify-between">
                <span>{t("costPrivateFee") || "Protocol fee (private bounties)"}</span>
                <span className="text-slate-900">{t("costPrivateFeeValue") || "2.5% of deposit"}</span>
              </li>
              <li className="flex justify-between">
                <span>{t("costDisputeDeposit")}</span>
                <span className="text-slate-900">{t("costDisputeDepositValue")}</span>
              </li>
              <li className="flex justify-between border-t border-slate-200 pt-2 mt-2">
                <span className="font-semibold">{t("costTotal")}</span>
                <span className="text-slate-900 font-semibold">{t("costTotalValue")}</span>
              </li>
            </ul>
          </div>
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

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-700 text-xs overflow-x-auto">
      <code>{children}</code>
    </pre>
  );
}

function InfoBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 my-3">
      <h3 className="text-amber-700 text-xs font-semibold mb-2">{title}</h3>
      <div className="text-slate-600 text-xs">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
      <div className="text-slate-500 text-xs mb-1">{label}</div>
      <div className="text-slate-900 font-bold text-lg">{value}</div>
    </div>
  );
}
