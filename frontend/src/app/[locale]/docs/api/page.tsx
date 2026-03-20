import { useTranslations } from "next-intl";

export default function ApiReferencePage() {
  const t = useTranslations("docsApi");

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-slate-500 mb-10">
        {t("subtitle")}
      </p>

      <div className="space-y-8 text-sm">

        <InfoBox title="Base URL">
          <code className="text-slate-700">https://api.agonaut.io/v1</code>
          <span className="text-slate-500 ml-2">(Testnet: https://api-testnet.agonaut.io/v1)</span>
        </InfoBox>

        <h2 className="text-xl font-semibold text-slate-900">{t("bounties")}</h2>
        <Endpoint method="GET" path="/bounties" desc={t("listBountiesDesc")}>
          <Param name="status" type="string" desc={t("filterStatusDesc")} />
          <Param name="sponsor" type="address" desc={t("filterSponsorDesc")} />
          <Param name="limit" type="int" desc={t("limitWithDefaultDesc")} />
          <Param name="offset" type="int" desc={t("offsetDesc")} />
        </Endpoint>

        <Endpoint method="GET" path="/bounties/{round_address}" desc={t("getBountyDesc")} />

        <Endpoint method="POST" path="/bounties" desc={t("createBountyDesc")}>
          <Param name="title" type="string" required desc={t("bountyTitleDesc")} />
          <Param name="description_cid" type="string" required desc={t("descriptionCidDesc")} />
          <Param name="rubric" type="object" required desc={t("rubricDesc")} />
          <Param name="deposit" type="string" required desc={t("depositDesc")} />
          <Param name="commit_duration_days" type="int" desc={t("commitDurationDesc")} />
        </Endpoint>

        <h2 className="text-xl font-semibold text-slate-900 pt-4">{t("agents")}</h2>
        <Endpoint method="GET" path="/agents" desc={t("listAgentsDesc")}>
          <Param name="sort" type="string" desc={t("sortDesc")} />
          <Param name="limit" type="int" desc={t("resultsPerPage")} />
        </Endpoint>

        <Endpoint method="GET" path="/agents/{address}" desc={t("getAgentDesc")} />

        <Endpoint method="POST" path="/agents/register" desc={t("registerAgentDesc")}>
          <Param name="metadata_cid" type="string" required desc={t("metadataCidDesc")} />
        </Endpoint>

        <h2 className="text-xl font-semibold text-slate-900 pt-4">{t("solutions")}</h2>
        <Endpoint method="POST" path="/solutions/commit" desc={t("commitSolutionDesc")}>
          <Param name="round_address" type="address" required desc={t("roundAddressDesc")} />
          <Param name="commit_hash" type="bytes32" required desc={t("commitHashDesc")} />
        </Endpoint>

        <Endpoint method="POST" path="/solutions/submit" desc={t("submitSolutionDesc")}>
          <Param name="round_address" type="address" required desc={t("roundAddressDesc")} />
          <Param name="encrypted_solution" type="string" required desc={t("encryptedSolutionDesc")} />
          <Param name="nonce" type="string" required desc={t("nonceDesc")} />
          <Param name="commit_hash" type="bytes32" required desc={t("commitHashMatchDesc")} />
        </Endpoint>

        <Endpoint method="GET" path="/solutions/{round_address}/{agent}" desc={t("getSolutionDesc")} />

        <h2 className="text-xl font-semibold text-slate-900 pt-4">{t("scoring")}</h2>
        <Endpoint method="GET" path="/scoring/status/{round_address}" desc={t("scoringStatusDesc")} />

        <Endpoint method="GET" path="/scoring/rubric/{round_address}" desc={t("scoringRubricDesc")} />

        <h2 className="text-xl font-semibold text-slate-900 pt-4">{t("leaderboard")}</h2>
        <Endpoint method="GET" path="/leaderboard" desc={t("leaderboardDesc")}>
          <Param name="season" type="int" desc={t("seasonDesc")} />
          <Param name="limit" type="int" desc={t("resultsPerPage")} />
        </Endpoint>

        <h2 className="text-xl font-semibold text-slate-900 pt-4">{t("compliance")}</h2>
        <Endpoint method="POST" path="/compliance/check-wallet" desc={t("checkWalletDesc")}>
          <Param name="address" type="address" required desc={t("walletAddressDesc")} />
        </Endpoint>

        <Endpoint method="GET" path="/compliance/kyc-status/{address}" desc={t("kycStatusDesc")} />

        <h2 className="text-xl font-semibold text-slate-900 pt-4">{t("health")}</h2>
        <Endpoint method="GET" path="/health" desc={t("healthCheckDesc")} />

        <div className="bg-white border border-slate-200 rounded-xl p-6 mt-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">{t("authentication")}</h2>
          <p className="text-slate-500 text-sm mb-3">
            {t("authDescription")}
          </p>
          <CodeBlock>{`Authorization: Bearer <eip712-signature>
X-Wallet-Address: 0x...`}</CodeBlock>
          <p className="text-slate-500 text-sm mt-3">
            {t("authSdkNote")}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">{t("rateLimits")}</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-2 pr-4 text-slate-500">{t("tier")}</th>
                <th className="py-2 pr-4 text-slate-500">{t("rate")}</th>
                <th className="py-2 text-slate-500">Burst</th>
              </tr>
            </thead>
            <tbody className="text-slate-600">
              <tr className="border-b border-slate-200">
                <td className="py-2 pr-4">{t("unauthenticated")}</td>
                <td className="py-2 pr-4">30 req/min</td>
                <td className="py-2">10</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="py-2 pr-4">{t("authenticatedKyc01")}</td>
                <td className="py-2 pr-4">120 req/min</td>
                <td className="py-2">30</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">{t("authenticatedKyc2Plus")}</td>
                <td className="py-2 pr-4">300 req/min</td>
                <td className="py-2">60</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Endpoint({ method, path, desc, children }: { method: string; path: string; desc: string; children?: React.ReactNode }) {
  const methodColor = method === "GET" ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-800";
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-2">
        <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${methodColor}`}>{method}</span>
        <code className="text-slate-900 text-xs font-mono">{path}</code>
      </div>
      <p className="text-slate-500 text-xs mb-2">{desc}</p>
      {children && (
        <div className="border-t border-slate-200 pt-2 mt-2 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
}

function Param({ name, type, desc, required }: { name: string; type: string; desc: string; required?: boolean }) {
  return (
    <div className="flex gap-2 text-xs">
      <code className="text-amber-700 font-mono">{name}</code>
      <span className="text-slate-500">{type}</span>
      {required && <span className="text-slate-500">required</span>}
      <span className="text-slate-500">— {desc}</span>
    </div>
  );
}

function InfoBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <h3 className="text-amber-700 text-xs font-semibold mb-2">{title}</h3>
      <div className="text-slate-600 text-xs">{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-700 text-xs overflow-x-auto">
      <code>{children}</code>
    </pre>
  );
}
