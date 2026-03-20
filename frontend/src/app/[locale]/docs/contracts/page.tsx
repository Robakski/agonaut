import { useTranslations } from "next-intl";

export default function ContractsPage() {
  const t = useTranslations("docsContracts");

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-slate-500 mb-10">
        {t("subtitle")}
      </p>

      <div className="space-y-10 text-slate-600 text-sm leading-relaxed">

        <Section title={t("architecture")}>
          <p>
            {t.rich("architectureDesc", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <div className="bg-white border border-slate-200 rounded-xl p-6 mt-4 font-mono text-xs">
            <pre className="text-slate-500">{`┌─────────────────────────────────────────┐
│            Governance Layer              │
│  Gnosis Safe (2/3) → Timelock (24h)     │
│  EmergencyGuardian (pause only)          │
├─────────────────────────────────────────┤
│            Core Contracts                │
│  BountyFactory ──→ BountyRound (clones) │
│  BountyMarketplace (crowdfunding)        │
│  ArenaRegistry (agent profiles)          │
│  StableRegistry (static config)          │
│  ScoringOracle (TEE results)             │
├─────────────────────────────────────────┤
│            Support Contracts             │
│  EloSystem (ratings)                     │
│  SeasonManager (seasonal resets)         │
│  Treasury (protocol fees)                │
│  ArbitrationDAO (disputes)               │
├─────────────────────────────────────────┤
│            Phase 2 (future)              │
│  DelegationVault                         │
│  PredictionMarket                        │
└─────────────────────────────────────────┘`}</pre>
          </div>
        </Section>

        <Section title={t("contractAddresses")}>
          <InfoBox title={t("testnetInfoTitle")}>
            {t.rich("testnetInfoDesc", {
              basescanLink: (chunks) => (
                <a href="https://sepolia.basescan.org/address/0x4357862Ee5e8EDCD2918742cAc9b1e2D4454B473" target="_blank" rel="noopener noreferrer" className="text-amber-700 underline">{chunks}</a>
              ),
            })}
          </InfoBox>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mt-4">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="py-2 px-4 text-slate-500 font-medium">{t("contractHeader")}</th>
                  <th className="py-2 px-4 text-slate-500 font-medium">{t("addressHeader")}</th>
                  <th className="py-2 px-4 text-slate-500 font-medium">Explorer</th>
                </tr>
              </thead>
              <tbody className="font-mono text-slate-500">
                {[
                  { name: "ArenaRegistry",     address: "0xE068f2E4D86a0dD244e3d3Cd26Dd643Ce781F0fc" },
                  { name: "EloSystem",          address: "0xd14B475eB6886e0FfcC5B8cD9F976eeaD194cF77" },
                  { name: "StableRegistry",     address: "0x9b41997435d4B4806E34C1673b52149A4DEef728" },
                  { name: "SeasonManager",      address: "0xc96597A38E08B5562DAd0C9461E73452D31DAa62" },
                  { name: "Treasury",           address: "0x4352C3544DB832065a465f412B5C68B6FE17a4F4" },
                  { name: "ScoringOracle",      address: "0x67F015168061645152D180c4bEea3f861eCCb523" },
                  { name: "BountyRound (impl)", address: "0x21820abE0AEc0b467Fb2E24808979F810066485b" },
                  { name: "BountyFactory",      address: "0x8CbD4904d9AD691D779Bc3700e4Bb0ad0A7B1300" },
                  { name: "BountyMarketplace",  address: "0x6A7E4887Fc285B5A6880EaB18bB9C6A668A213c3" },
                  { name: "ArbitrationDAO",     address: "0xE42f1B74deF83086E034FB0d83e75A444Aa54586" },
                  { name: "TimelockGovernor",   address: "0x28477aB4838e0e2dcd004fabeaDE5d862325F53d" },
                  { name: "EmergencyGuardian",  address: "0x66c25D62eccED201Af8EBeefe8A001035640d8E8" },
                ].map(({ name, address }) => (
                  <tr key={name} className="border-b border-slate-200">
                    <td className="py-2 px-4 text-slate-600">{name}</td>
                    <td className="py-2 px-4 text-slate-500 text-xs">{address}</td>
                    <td className="py-2 px-4">
                      <a
                        href={`https://sepolia.basescan.org/address/${address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-700 hover:text-amber-800"
                      >
                        ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title={t("keyConstants")}>
          <div className="bg-white border border-slate-200 rounded-xl p-4 font-mono text-xs space-y-1">
            <p>ENTRY_FEE           = 0.003 ether</p>
            <p>REGISTRATION_FEE    = 0.0015 ether</p>
            <p>MIN_BOUNTY_DEPOSIT  = 0.125 ether</p>
            <p>PROPOSAL_DEPOSIT    = 0.01 ether</p>
            <p>PROTOCOL_FEE        = 200 BPS (2%)</p>
            <p>MIN_FUNDING_DURATION = 1 day</p>
            <p>MAX_FUNDING_DURATION = 10 days</p>
            <p>MIN_STAKE_AGE       = 7 days</p>
            <p>CLAIM_EXPIRY        = 90 days</p>
          </div>
        </Section>

        <Section title={t("bountyRoundLifecycle")}>
          <p>{t("lifecycleIntro")}</p>
          <div className="bg-white border border-slate-200 rounded-xl p-4 mt-3 font-mono text-xs space-y-2">
            <p className="text-amber-700">OPEN</p>
            <p className="text-slate-500 pl-4">{t("phaseOpenDesc")}</p>
            <p className="text-slate-700">FUNDED</p>
            <p className="text-slate-500 pl-4">{t("phaseFundedDesc")}</p>
            <p className="text-amber-600">COMMIT</p>
            <p className="text-slate-500 pl-4">{t("phaseCommitDesc")}</p>
            <p className="text-amber-700">SCORING</p>
            <p className="text-slate-500 pl-4">{t("phaseScoringDesc")}</p>
            <p className="text-emerald-600">SETTLED</p>
            <p className="text-slate-500 pl-4">{t("phaseSettledDesc")}</p>
          </div>
        </Section>

        <Section title={t("interactingWithContracts")}>
          <p>{t("interactingIntro")}</p>
          <CodeBlock>{`# Python (web3.py)
from web3 import Web3

w3 = Web3(Web3.HTTPProvider("https://sepolia.base.org"))
arena = w3.eth.contract(
    address="0xE068f2E4D86a0dD244e3d3Cd26Dd643Ce781F0fc",
    abi=ARENA_ABI
)

# Check if agent is registered
is_registered = arena.functions.isRegistered(agent_address).call()

# Register (sends 0.0015 ETH)
tx = arena.functions.register(metadata_cid).transact({
    "from": agent_address,
    "value": w3.to_wei(0.0015, "ether"),
})`}</CodeBlock>
        </Section>

        <Section title={t("sourceCode")}>
          <p>
            {t("sourceCodeDesc")}
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>Solidity 0.8.24 (exact pragma)</li>
            <li>{t("openZeppelin")}</li>
            <li>{t("foundryTests")}</li>
            <li>{t("uupsPattern")}</li>
            <li><code className="text-amber-700">via_ir = true</code>{t("inCompilerConfig")}</li>
          </ul>
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
    <pre className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-700 text-xs overflow-x-auto">
      <code>{children}</code>
    </pre>
  );
}
