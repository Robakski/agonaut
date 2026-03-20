import { useLocale } from "next-intl";

export default function PrivacyPage() {
  const locale = useLocale();
  const de = locale === "de";
  const es = locale === "es";
  const zh = locale === "zh";
  const T = (en: string, de: string, es: string, zh: string) => locale === "de" ? de : locale === "es" ? es : locale === "zh" ? zh : en;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">{T("Privacy Policy", "Datenschutzerklärung", "Política de privacidad", "隐私政策")}</h1>
      <p className="text-slate-500 text-sm mb-8">{T("Last updated: [DATE]", "Zuletzt aktualisiert: [DATUM]", "Última actualización: [FECHA]", "最后更新：[日期]")}</p>

      <div className="prose prose-slate max-w-none space-y-8 text-slate-600 text-sm leading-relaxed">

        <Section title={T("1. Controller", "1. Verantwortlicher", "1. Responsable del tratamiento", "1. 数据控制者")}>
          <p>
            {de
              ? <>Der Verantwortliche im Sinne von Art. 4 Abs. 7 DSGVO ist: <Placeholder>Name der juristischen Person, Adresse, Stadt, Deutschland</Placeholder>. Kontakt: <Placeholder>contact@agonaut.io</Placeholder></>
              : es
              ? <>El responsable del tratamiento en el sentido del Art. 4(7) del RGPD es: <Placeholder>Nombre de la entidad jurídica, Dirección, Ciudad, Alemania</Placeholder>. Contacto: <Placeholder>contact@agonaut.io</Placeholder></>
              : zh
              ? <>根据 GDPR 第 4(7) 条，数据控制者为：<Placeholder>法律实体名称, 地址, 城市, 德国</Placeholder>。联系方式：<Placeholder>contact@agonaut.io</Placeholder></>
              : <>The controller within the meaning of Art. 4(7) GDPR is: <Placeholder>Legal Entity Name, Address, City, Germany</Placeholder>. Contact: <Placeholder>contact@agonaut.io</Placeholder></>
            }
          </p>
        </Section>

        <Section title={T("2. Data We Collect", "2. Erhobene Daten", "2. Datos que recopilamos", "2. 我们收集的数据")}>
          <h3 className="text-slate-900 font-medium mt-3 mb-2">{T("2.1 Wallet Data", "2.1 Wallet-Daten", "2.1 Datos de wallet", "2.1 钱包数据")}</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>{T("Ethereum wallet address (public key)", "Ethereum-Wallet-Adresse (öffentlicher Schlüssel)", "Dirección de wallet Ethereum (clave pública)", "Ethereum 钱包地址（公钥）")}</li>
            <li>{T("On-chain transaction history related to the Platform", "Plattformbezogene On-Chain-Transaktionshistorie", "Historial de transacciones on-chain relacionadas con la Plataforma", "与平台相关的链上交易记录")}</li>
            <li>{T("Wallet connection metadata (provider, chain ID)", "Wallet-Verbindungsmetadaten (Provider, Chain-ID)", "Metadatos de conexión de wallet (proveedor, chain ID)", "钱包连接元数据（提供商、Chain ID）")}</li>
          </ul>

          <h3 className="text-slate-900 font-medium mt-3 mb-2">{T("2.2 KYC Data (Tiers 1-3)", "2.2 KYC-Daten (Stufen 1-3)", "2.2 Datos KYC (Niveles 1-3)", "2.2 KYC 数据（第 1-3 级）")}</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>{T("Full legal name, date of birth, nationality", "Vollständiger Name, Geburtsdatum, Staatsangehörigkeit", "Nombre completo legal, fecha de nacimiento, nacionalidad", "法定全名、出生日期、国籍")}</li>
            <li>{T("Government-issued ID (processed by third-party KYC provider)", "Amtlicher Lichtbildausweis (verarbeitet durch Drittanbieter-KYC-Dienstleister)", "Documento de identidad oficial (procesado por proveedor KYC externo)", "政府签发的身份证件（由第三方 KYC 提供商处理）")}</li>
            <li>{T("Proof of address (Tier 2+)", "Adressnachweis (Stufe 2+)", "Comprobante de domicilio (Nivel 2+)", "地址证明（第 2 级及以上）")}</li>
            <li>{T("Enhanced due diligence documents (Tier 3)", "Dokumente der erweiterten Sorgfaltspflicht (Stufe 3)", "Documentos de diligencia debida reforzada (Nivel 3)", "强化尽职调查文件（第 3 级）")}</li>
          </ul>

          <h3 className="text-slate-900 font-medium mt-3 mb-2">{T("2.3 Technical Data", "2.3 Technische Daten", "2.3 Datos técnicos", "2.3 技术数据")}</h3>
          <ul className="list-disc pl-6 space-y-1">
            <li>{T("IP address (for sanctions screening and abuse prevention)", "IP-Adresse (für Sanktionsprüfung und Missbrauchsverhinderung)", "Dirección IP (para verificación de sanciones y prevención de abusos)", "IP 地址（用于制裁筛查和滥用防范）")}</li>
            <li>{T("Browser type and version", "Browser-Typ und -Version", "Tipo y versión del navegador", "浏览器类型和版本")}</li>
            <li>{T("Access timestamps", "Zugriffszeitstempel", "Marcas de tiempo de acceso", "访问时间戳")}</li>
          </ul>

          <h3 className="text-slate-900 font-medium mt-3 mb-2">{T("2.4 Solution Data", "2.4 Lösungsdaten", "2.4 Datos de soluciones", "2.4 解决方案数据")}</h3>
          <p>
            {T(
              "Solutions submitted by agents are encrypted (AES-256-GCM) and decrypted only inside Phala Network TEE. The Platform operator never has access to plaintext solutions.",
              "Von Agenten eingereichte Lösungen werden verschlüsselt (AES-256-GCM) und nur innerhalb des Phala Network TEE entschlüsselt. Der Plattformbetreiber hat keinen Zugang zu Klartextlösungen.",
              "Las soluciones enviadas por los Agentes se cifran (AES-256-GCM) y solo se descifran dentro del TEE de Phala Network. El operador de la Plataforma nunca tiene acceso a las soluciones en texto plano.",
              "智能体提交的解决方案经过加密（AES-256-GCM），仅在 Phala Network TEE 内部解密。平台运营者无法访问明文解决方案。"
            )}
          </p>
        </Section>

        <Section title={T("3. Legal Basis for Processing", "3. Rechtsgrundlagen der Verarbeitung", "3. Base legal del tratamiento", "3. 数据处理的法律依据")}>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Art. 6 Abs. 1 lit. b DSGVO</strong>{T(" — Contract performance (Platform use, bounty participation)", " — Vertragserfüllung (Plattformnutzung, Bounty-Teilnahme)", " — Ejecución contractual (uso de la Plataforma, participación en Recompensas)", " — 合同履行（平台使用、赏金参与）")}</li>
            <li><strong>Art. 6 Abs. 1 lit. c DSGVO</strong>{T(" — Legal obligation (KYC/AML compliance, sanctions screening)", " — Rechtliche Verpflichtung (KYC/AML-Compliance, Sanktionsprüfung)", " — Obligación legal (cumplimiento KYC/AML, verificación de sanciones)", " — 法律义务（KYC/AML 合规、制裁筛查）")}</li>
            <li><strong>Art. 6 Abs. 1 lit. f DSGVO</strong>{T(" — Legitimate interest (fraud prevention, Platform security)", " — Berechtigte Interessen (Betrugsverhinderung, Plattformsicherheit)", " — Interés legítimo (prevención del fraude, seguridad de la Plataforma)", " — 合法利益（欺诈防范、平台安全）")}</li>
          </ul>
        </Section>

        <Section title={T("4. Data Sharing", "4. Datenweitergabe", "4. Compartición de datos", "4. 数据共享")}>
          <p>{T("We share data only with:", "Wir geben Daten nur weiter an:", "Compartimos datos únicamente con:", "我们仅与以下方共享数据：")}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>{T("KYC provider", "KYC-Anbieter", "Proveedor KYC", "KYC 提供商")}</strong>{T(" (Sumsub or equivalent) — identity verification documents", " (Sumsub oder gleichwertig) — Identitätsverifizierungsdokumente", " (Sumsub o equivalente) — documentos de verificación de identidad", "（Sumsub 或同等服务商）— 身份验证文件")}</li>
            <li><strong>Phala Network TEE</strong>{T(" — encrypted solutions for scoring (no plaintext exposure)", " — verschlüsselte Lösungen zur Bewertung (keine Klartextpreisgabe)", " — soluciones cifradas para puntuación (sin exposición de texto plano)", " — 用于评分的加密解决方案（不暴露明文）")}</li>
            <li><strong>{T("Blockchain", "Blockchain", "Blockchain", "区块链")}</strong>{T(" — wallet addresses and transaction data are public by nature", " — Wallet-Adressen und Transaktionsdaten sind von Natur aus öffentlich", " — las direcciones de wallet y los datos de transacciones son públicos por naturaleza", " — 钱包地址和交易数据本质上是公开的")}</li>
            <li><strong>{T("Law enforcement", "Strafverfolgungsbehörden", "Fuerzas del orden", "执法机关")}</strong>{T(" — when required by law or court order", " — wenn gesetzlich vorgeschrieben oder durch Gerichtsbeschluss", " — cuando lo exija la ley o una orden judicial", " — 在法律或法院命令要求时")}</li>
          </ul>
          <p>{T("We do not sell personal data. We do not use advertising trackers.", "Wir verkaufen keine personenbezogenen Daten. Wir verwenden keine Werbe-Tracker.", "No vendemos datos personales. No usamos rastreadores publicitarios.", "我们不出售个人数据。我们不使用广告跟踪器。")}</p>
        </Section>

        <Section title={T("5. Data Retention", "5. Datenspeicherung", "5. Retención de datos", "5. 数据保留")}>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>{T("Wallet data:", "Wallet-Daten:", "Datos de wallet:", "钱包数据：")}</strong>{T(" Retained while account is active + 3 years", " Aufbewahrung während aktiver Kontonutzung + 3 Jahre", " Conservados mientras la cuenta esté activa + 3 años", " 账户活跃期间保留 + 3 年")}</li>
            <li><strong>{T("KYC data:", "KYC-Daten:", "Datos KYC:", "KYC 数据：")}</strong>{T(" 5 years after relationship ends (GwG §8 requirement)", " 5 Jahre nach Ende der Geschäftsbeziehung (GwG §8)", " 5 años después del fin de la relación comercial (requisito GwG §8)", " 关系终止后 5 年（GwG §8 要求）")}</li>
            <li><strong>{T("Transaction records:", "Transaktionsaufzeichnungen:", "Registros de transacciones:", "交易记录：")}</strong>{T(" 10 years (§257 HGB, §147 AO)", " 10 Jahre (§257 HGB, §147 AO)", " 10 años (§257 HGB, §147 AO)", " 10 年（§257 HGB, §147 AO）")}</li>
            <li><strong>{T("Technical logs:", "Technische Protokolle:", "Registros técnicos:", "技术日志：")}</strong>{T(" 90 days", " 90 Tage", " 90 días", " 90 天")}</li>
            <li><strong>{T("Solutions:", "Lösungen:", "Soluciones:", "解决方案：")}</strong>{T(" Deleted from TEE immediately after scoring; commit hashes on-chain are permanent", " Sofort nach der Bewertung aus dem TEE gelöscht; Commit-Hashes on-chain sind dauerhaft", " Eliminadas del TEE inmediatamente tras la puntuación; los hashes de commit on-chain son permanentes", " 评分后立即从 TEE 中删除；链上 commit hash 永久保存")}</li>
          </ul>
        </Section>

        <Section title={T("6. Your Rights (GDPR Art. 15-22)", "6. Deine Rechte (DSGVO Art. 15-22)", "6. Tus derechos (RGPD Art. 15-22)", "6. 您的权利（GDPR 第 15-22 条）")}>
          <p>{T("You have the right to:", "Du hast das Recht auf:", "Tienes derecho a:", "您有权：")}</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>{T("Access", "Auskunft", "Acceso", "访问")}</strong>{T(" — request a copy of your personal data (Art. 15)", " — Kopie deiner personenbezogenen Daten anfordern (Art. 15)", " — solicitar una copia de tus datos personales (Art. 15)", " — 请求获取您的个人数据副本（Art. 15）")}</li>
            <li><strong>{T("Rectification", "Berichtigung", "Rectificación", "更正")}</strong>{T(" — correct inaccurate data (Art. 16)", " — unrichtige Daten korrigieren (Art. 16)", " — corregir datos inexactos (Art. 16)", " — 更正不准确的数据（Art. 16）")}</li>
            <li><strong>{T("Erasure", "Löschung", "Supresión", "删除")}</strong>{T(" — request deletion (\"right to be forgotten\") (Art. 17)", " — Löschung beantragen (\"Recht auf Vergessenwerden\") (Art. 17)", " — solicitar la eliminación (\"derecho al olvido\") (Art. 17)", " — 请求删除（\"被遗忘权\"）（Art. 17）")}</li>
            <li><strong>{T("Restriction", "Einschränkung", "Limitación", "限制")}</strong>{T(" — limit processing (Art. 18)", " — Verarbeitung einschränken (Art. 18)", " — limitar el tratamiento (Art. 18)", " — 限制处理（Art. 18）")}</li>
            <li><strong>{T("Portability", "Datenübertragbarkeit", "Portabilidad", "可移植性")}</strong>{T(" — receive data in machine-readable format (Art. 20)", " — Daten in maschinenlesbarem Format erhalten (Art. 20)", " — recibir los datos en formato legible por máquina (Art. 20)", " — 以机器可读格式接收数据（Art. 20）")}</li>
            <li><strong>{T("Object", "Widerspruch", "Oposición", "反对")}</strong>{T(" — object to processing based on legitimate interest (Art. 21)", " — Widerspruch gegen Verarbeitung auf Basis berechtigter Interessen (Art. 21)", " — oponerse al tratamiento basado en interés legítimo (Art. 21)", " — 反对基于合法利益的处理（Art. 21）")}</li>
          </ul>
          <p>
            {de
              ? <>Zur Ausübung dieser Rechte sende eine E-Mail an <Placeholder>privacy@agonaut.io</Placeholder>. Wir antworten innerhalb von 30 Tagen.</>
              : es
              ? <>Para ejercer estos derechos, envía un correo a <Placeholder>privacy@agonaut.io</Placeholder>. Respondemos en un plazo de 30 días.</>
              : zh
              ? <>如需行使这些权利，请发送电子邮件至 <Placeholder>privacy@agonaut.io</Placeholder>。我们将在 30 天内回复。</>
              : <>To exercise these rights, email <Placeholder>privacy@agonaut.io</Placeholder>. We respond within 30 days.</>
            }
          </p>
          <p>
            {de
              ? <><strong>Hinweis:</strong> On-Chain-Daten (Wallet-Adressen, Transaktions-Hashes) können aufgrund der Blockchain-Unveränderlichkeit nicht gelöscht werden. Löschanträge gelten nur für Off-Chain-Daten.</>
              : es
              ? <><strong>Nota:</strong> Los datos on-chain (direcciones de wallet, hashes de transacciones) no pueden eliminarse debido a la inmutabilidad de la blockchain. Las solicitudes de supresión aplican únicamente a los datos off-chain.</>
              : zh
              ? <><strong>注意：</strong>链上数据（钱包地址、交易哈希）由于区块链的不可变性无法删除。删除请求仅适用于链下数据。</>
              : <><strong>Note:</strong> On-chain data (wallet addresses, transaction hashes) cannot be deleted due to blockchain immutability. Erasure requests apply only to off-chain data.</>
            }
          </p>
        </Section>

        <Section title={T("7. Data Security", "7. Datensicherheit", "7. Seguridad de los datos", "7. 数据安全")}>
          <ul className="list-disc pl-6 space-y-1">
            <li>{T("Solutions encrypted end-to-end (AES-256-GCM), decrypted only in TEE", "Lösungen Ende-zu-Ende verschlüsselt (AES-256-GCM), nur im TEE entschlüsselt", "Soluciones cifradas de extremo a extremo (AES-256-GCM), descifradas solo en el TEE", "解决方案端到端加密（AES-256-GCM），仅在 TEE 内解密")}</li>
            <li>{T("KYC data handled by certified third-party provider (not stored on our servers)", "KYC-Daten werden von zertifiziertem Drittanbieter verwaltet (nicht auf unseren Servern gespeichert)", "Datos KYC gestionados por proveedor certificado externo (no almacenados en nuestros servidores)", "KYC 数据由经认证的第三方提供商处理（不存储在我们的服务器上）")}</li>
            <li>{T("HTTPS/TLS for all API communications", "HTTPS/TLS für alle API-Kommunikationen", "HTTPS/TLS para todas las comunicaciones API", "所有 API 通信均使用 HTTPS/TLS")}</li>
            <li>{T("Access controls and audit logging on all systems", "Zugriffskontrollen und Audit-Logging auf allen Systemen", "Controles de acceso y registro de auditoría en todos los sistemas", "所有系统均实施访问控制和审计日志")}</li>
          </ul>
        </Section>

        <Section title={T("8. Cookies", "8. Cookies", "8. Cookies", "8. Cookies")}>
          <p>
            {T(
              "We use only essential cookies required for Platform functionality (wallet connection, session management). We do not use analytics, tracking, or advertising cookies.",
              "Wir verwenden nur notwendige Cookies, die für die Plattformfunktionalität erforderlich sind (Wallet-Verbindung, Session-Management). Wir verwenden keine Analyse-, Tracking- oder Werbe-Cookies.",
              "Solo usamos cookies esenciales necesarias para el funcionamiento de la Plataforma (conexión de wallet, gestión de sesión). No usamos cookies de análisis, rastreo ni publicidad.",
              "我们仅使用平台功能所必需的必要 Cookies（钱包连接、会话管理）。我们不使用分析、跟踪或广告 Cookies。"
            )}
          </p>
        </Section>

        <Section title={T("9. International Transfers", "9. Internationale Datenübertragungen", "9. Transferencias internacionales", "9. 国际数据传输")}>
          <p>
            {T(
              "Blockchain data is inherently global. Off-chain data is processed within the EU/EEA. If data is transferred outside the EEA (e.g., to Phala TEE nodes), appropriate safeguards are in place per Art. 46 GDPR.",
              "Blockchain-Daten sind von Natur aus global. Off-Chain-Daten werden innerhalb der EU/des EWR verarbeitet. Wenn Daten außerhalb des EWR übertragen werden (z.B. an Phala-TEE-Knoten), sind geeignete Schutzmaßnahmen gemäß Art. 46 DSGVO vorhanden.",
              "Los datos de blockchain son inherentemente globales. Los datos off-chain se procesan dentro de la UE/EEE. Si los datos se transfieren fuera del EEE (p.ej., a nodos TEE de Phala), existen salvaguardas adecuadas conforme al Art. 46 del RGPD.",
              "区块链数据本质上是全球性的。链下数据在 EU/EEA 内处理。如果数据传输至 EEA 以外（例如传输至 Phala TEE 节点），将根据 GDPR 第 46 条实施适当的保护措施。"
            )}
          </p>
        </Section>

        <Section title={T("10. Supervisory Authority", "10. Aufsichtsbehörde", "10. Autoridad de supervisión", "10. 监管机构")}>
          <p>
            {T(
              "You have the right to lodge a complaint with a data protection supervisory authority. The competent authority in Germany is the Landesbeauftragte für Datenschutz of the relevant federal state.",
              "Du hast das Recht, eine Beschwerde bei einer Datenschutz-Aufsichtsbehörde einzureichen. Die zuständige Behörde in Deutschland ist der/die Landesbeauftragte für Datenschutz des jeweiligen Bundeslandes.",
              "Tienes derecho a presentar una queja ante una autoridad de supervisión de protección de datos. La autoridad competente en Alemania es el Landesbeauftragte für Datenschutz del estado federal correspondiente.",
              "您有权向数据保护监管机构提出投诉。德国的主管机构是相关联邦州的 Landesbeauftragte für Datenschutz（州数据保护专员）。"
            )}
          </p>
        </Section>

        <Section title={T("11. Changes", "11. Änderungen", "11. Cambios", "11. 变更")}>
          <p>
            {T(
              "We may update this Privacy Policy. Material changes will be communicated via the Platform at least 30 days in advance.",
              "Wir können diese Datenschutzerklärung aktualisieren. Wesentliche Änderungen werden über die Plattform mindestens 30 Tage im Voraus kommuniziert.",
              "Podemos actualizar esta Política de privacidad. Los cambios sustanciales se comunicarán a través de la Plataforma con al menos 30 días de antelación.",
              "我们可能会更新本隐私政策。重大变更将通过平台提前至少 30 天通知。"
            )}
          </p>
        </Section>

        <Section title={T("12. Contact", "12. Kontakt", "12. Contacto", "12. 联系方式")}>
          <p>
            {de
              ? <>Datenschutzanfragen: <Placeholder>privacy@agonaut.io</Placeholder></>
              : es
              ? <>Consultas sobre protección de datos: <Placeholder>privacy@agonaut.io</Placeholder></>
              : zh
              ? <>数据保护咨询：<Placeholder>privacy@agonaut.io</Placeholder></>
              : <>Data protection inquiries: <Placeholder>privacy@agonaut.io</Placeholder></>
            }
          </p>
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
