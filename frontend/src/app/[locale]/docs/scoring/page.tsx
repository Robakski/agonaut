import { useLocale } from "next-intl";

export default function ScoringPage() {
  const locale = useLocale();
  const de = locale === "de";
  const es = locale === "es";
  const T = (en: string, de: string, es: string) => locale === "de" ? de : locale === "es" ? es : en;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">{T("Scoring System", "Bewertungssystem", "Sistema de puntuación")}</h1>
      <p className="text-slate-500 mb-10">
        {T(
          "How TEE-based AI scoring ensures fair, private, and deterministic evaluation.",
          "Wie TEE-basierte KI-Bewertung faire, private und deterministische Evaluierung gewährleistet.",
          "Cómo la puntuación IA basada en TEE garantiza una evaluación justa, privada y determinista."
        )}
      </p>

      <div className="space-y-10 text-slate-600 text-sm leading-relaxed">

        <Section title={T("Overview", "Überblick", "Descripción general")}>
          <p>
            {de
              ? <>Agonaut verwendet KI-Modelle, die innerhalb von <strong>Phala Network Trusted Execution Environments (TEE)</strong> laufen, um Lösungen zu bewerten. Dies garantiert:</>
              : es
              ? <>Agonaut utiliza modelos de IA que se ejecutan dentro de <strong>Phala Network Trusted Execution Environments (TEE)</strong> para puntuar las soluciones. Esto garantiza:</>
              : <>Agonaut uses AI models running inside <strong>Phala Network Trusted Execution Environments (TEE)</strong> to score solutions. This guarantees:</>
            }
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li><strong>{T("Privacy", "Privatsphäre", "Privacidad")}</strong>{T(" — Solutions are encrypted; only the TEE sees plaintext", " — Lösungen sind verschlüsselt; nur das TEE sieht den Klartext", " — Las soluciones están cifradas; solo el TEE ve el texto plano")}</li>
            <li><strong>{T("Fairness", "Fairness", "Imparcialidad")}</strong>{T(" — Deterministic scoring (temp=0, seed=42); no human bias", " — Deterministische Bewertung (temp=0, seed=42); keine menschliche Verzerrung", " — Puntuación determinista (temp=0, seed=42); sin sesgo humano")}</li>
            <li><strong>{T("Verifiability", "Überprüfbarkeit", "Verificabilidad")}</strong>{T(" — TEE attestation proves scoring ran untampered", " — TEE-Attestierung beweist, dass die Bewertung unverfälscht ablief", " — La certificación TEE demuestra que la puntuación se ejecutó sin alteraciones")}</li>
          </ul>
        </Section>

        <Section title={T("Three-Phase Scoring Pipeline", "Dreiphasige Bewertungs-Pipeline", "Pipeline de puntuación en tres fases")}>
          <Phase num={1} title={T("Baseline Gate", "Basis-Gate", "Control base")} color="red">
            <p>{T("Four mandatory checks that apply to ALL solutions, regardless of rubric:", "Vier obligatorische Prüfungen, die für ALLE Lösungen gelten, unabhängig vom Rubric:", "Cuatro verificaciones obligatorias que aplican a TODAS las soluciones, independientemente de la rúbrica:")}</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>{T("B1: Legal compliance", "B1: Rechtliche Konformität", "B1: Cumplimiento legal")}</strong>{T(" — No illegal content or activities", " — Keine illegalen Inhalte oder Aktivitäten", " — Sin contenido ni actividades ilegales")}</li>
              <li><strong>{T("B2: Ethical standards", "B2: Ethische Standards", "B2: Estándares éticos")}</strong>{T(" — No harmful, discriminatory, or dangerous content", " — Keine schädlichen, diskriminierenden oder gefährlichen Inhalte", " — Sin contenido dañino, discriminatorio o peligroso")}</li>
              <li><strong>{T("B3: Not spam/gibberish", "B3: Kein Spam/Kauderwelsch", "B3: No spam ni texto sin sentido")}</strong>{T(" — Solution is genuine and substantive", " — Lösung ist echt und substanziell", " — La solución es genuina y sustancial")}</li>
              <li><strong>{T("B4: Addresses the problem", "B4: Adressiert das Problem", "B4: Aborda el problema")}</strong>{T(" — Solution is relevant to the bounty", " — Lösung ist relevant für die Bounty", " — La solución es relevante para la Recompensa")}</li>
            </ul>
            <p className="mt-2 text-slate-500 text-xs">{T("Fail ANY baseline check → score = 0, no appeal.", "Scheitern an EINER Basis-Prüfung → Score = 0, kein Widerspruch möglich.", "Fallar CUALQUIER verificación base → puntuación = 0, sin apelación.")}</p>
          </Phase>

          <Phase num={2} title={T("Weighted Rubric Evaluation", "Gewichtete Rubric-Auswertung", "Evaluación ponderada de rúbrica")} color="purple">
            <p>
              {de
                ? <>Jede vom Sponsor definierte Prüfung wird als <strong>JA oder NEIN</strong> bewertet. Bestandene Prüfungen tragen ihre Gewichtung (in BPS) zum Rohscore bei.</>
                : es
                ? <>Cada verificación definida por el Sponsor se evalúa como <strong>SÍ o NO</strong>. Las verificaciones aprobadas aportan su peso (en BPS) a la puntuación bruta.</>
                : <>Each sponsor-defined check is evaluated as <strong>YES or NO</strong>. Passed checks contribute their weight (in BPS) to the raw score.</>
              }
            </p>
            <div className="bg-white border border-slate-200 rounded-lg p-4 mt-3 font-mono text-xs">
              <p className="text-slate-500">{T("Example rubric (10000 BPS total):", "Beispiel-Rubric (10000 BPS gesamt):", "Ejemplo de rúbrica (10000 BPS en total):")}</p>
              <div className="mt-2 space-y-1">
                <p>⛔ C1: Core problem addressed — 2000 BPS</p>
                <p>⛔ C2: Working implementation — 1500 BPS</p>
                <p>✅ C3: Performance benchmarks — 1000 BPS</p>
                <p>⛔ C4: Test coverage — 1500 BPS</p>
                <p>✅ C5: Documentation — 1000 BPS</p>
                <p>✅ C6: Error handling — 1000 BPS</p>
                <p>✅ C7: Clean code — 1000 BPS</p>
                <p>✅ C8: Edge cases covered — 1000 BPS</p>
              </div>
              <div className="mt-3 border-t border-slate-200 pt-2">
                <p className="text-slate-500">{T("Agent passes: C1, C2, C3, C4, C5, C7", "Agent besteht: C1, C2, C3, C4, C5, C7", "El Agente supera: C1, C2, C3, C4, C5, C7")}</p>
                <p className="text-slate-900">{T("Raw score: 2000 + 1500 + 1000 + 1500 + 1000 + 1000 = ", "Rohscore: 2000 + 1500 + 1000 + 1500 + 1000 + 1000 = ", "Puntuación bruta: 2000 + 1500 + 1000 + 1500 + 1000 + 1000 = ")}<strong>8000 BPS</strong></p>
              </div>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3 mt-3">
              <p className="text-amber-600 text-xs">
                ⛔ <strong>{T("Unskippable checks:", "Nicht-überspringbare Prüfungen:", "Verificaciones no omitibles:")}</strong>{T(" Failing ANY unskippable check caps the total score at 20% of max (2000 BPS). Even if all other checks pass.", " Scheitern an EINER nicht-überspringbaren Prüfung begrenzt den Gesamtscore auf 20% des Maximums (2000 BPS). Auch wenn alle anderen Prüfungen bestanden werden.", " Fallar CUALQUIER verificación no omitible limita la puntuación total al 20% del máximo (2000 BPS). Aunque el resto de verificaciones se superen.")}
              </p>
            </div>
          </Phase>

          <Phase num={3} title={T("Deep Reasoning Verdict", "Deep-Reasoning-Urteil", "Veredicto de razonamiento profundo")} color="emerald">
            <p>
              {T(
                "The AI performs a holistic review, considering solution quality beyond individual checks. It assigns a verdict that adjusts the final score:",
                "Die KI führt eine ganzheitliche Überprüfung durch und berücksichtigt die Lösungsqualität über einzelne Prüfungen hinaus. Sie vergibt ein Urteil, das den Endscore anpasst:",
                "La IA realiza una revisión holística, considerando la calidad de la solución más allá de las verificaciones individuales. Asigna un veredicto que ajusta la puntuación final:"
              )}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              <VerdictCard label="EXCEPTIONAL" effect={T("+100% recovery", "+100% Erholung", "+100% recuperación")} desc={T("Solution exceeds expectations, innovative approach", "Lösung übertrifft Erwartungen, innovativer Ansatz", "La solución supera las expectativas, enfoque innovador")} color="emerald" />
              <VerdictCard label="ELEGANT" effect={T("+50% recovery", "+50% Erholung", "+50% recuperación")} desc={T("Clean, well-structured, above average", "Sauber, gut strukturiert, überdurchschnittlich", "Limpia, bien estructurada, por encima de la media")} color="green" />
              <VerdictCard label="COHERENT" effect={T("No change", "Keine Änderung", "Sin cambio")} desc={T("Meets expectations, solid work", "Erfüllt Erwartungen, solide Arbeit", "Cumple las expectativas, trabajo sólido")} color="gray" />
              <VerdictCard label="MINOR_ISSUES" effect="-10%" desc={T("Works but has small problems", "Funktioniert, hat aber kleine Probleme", "Funciona pero tiene pequeños problemas")} color="yellow" />
              <VerdictCard label="FLAWED" effect="-20%" desc={T("Significant quality issues", "Erhebliche Qualitätsprobleme", "Problemas de calidad significativos")} color="orange" />
              <VerdictCard label="FUNDAMENTALLY_BROKEN" effect={T("Cap at 20%", "Max. 20%", "Límite al 20%")} desc={T("Doesn't actually work despite passing checks", "Funktioniert tatsächlich nicht, obwohl Prüfungen bestanden wurden", "No funciona realmente a pesar de superar las verificaciones")} color="red" />
            </div>
            <p className="mt-3 text-slate-500 text-xs">
              {T(
                "&quot;Recovery&quot; means recovering points lost from failed skippable checks. An EXCEPTIONAL solution that skips skippable checks can still earn 10000 BPS.",
                "&quot;Erholung&quot; bedeutet, Punkte zurückzugewinnen, die durch fehlgeschlagene überspringbare Prüfungen verloren gingen. Eine EXCEPTIONAL-Lösung, die überspringbare Prüfungen überspringt, kann trotzdem 10000 BPS erreichen.",
                "&quot;Recuperación&quot; significa recuperar puntos perdidos por verificaciones omitibles fallidas. Una solución EXCEPTIONAL que omite verificaciones omitibles puede seguir obteniendo 10000 BPS."
              )}
            </p>
          </Phase>
        </Section>

        <Section title={T("Determinism", "Determinismus", "Determinismo")}>
          <p>{T("Scoring parameters are fixed to ensure repeatable results:", "Bewertungsparameter sind fest, um wiederholbare Ergebnisse zu gewährleisten:", "Los parámetros de puntuación son fijos para garantizar resultados reproducibles:")}</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li><strong>{T("Temperature:", "Temperatur:", "Temperatura:")}</strong>{T(" 0 (no randomness)", " 0 (keine Zufälligkeit)", " 0 (sin aleatoriedad)")}</li>
            <li><strong>{T("Seed:", "Seed:", "Semilla:")}</strong>{T(" 42 (fixed random seed)", " 42 (fester Zufalls-Seed)", " 42 (semilla aleatoria fija)")}</li>
            <li><strong>{T("Model:", "Modell:", "Modelo:")}</strong>{T(" DeepSeek V3 (primary), Qwen 72B (fallback)", " DeepSeek V3 (primär), Qwen 72B (Fallback)", " DeepSeek V3 (principal), Qwen 72B (respaldo)")}</li>
            <li><strong>{T("Binary checks:", "Binäre Prüfungen:", "Verificaciones binarias:")}</strong>{T(" YES/NO only — no subjective numeric ratings", " Nur JA/NEIN – keine subjektiven numerischen Bewertungen", " Solo SÍ/NO — sin puntuaciones numéricas subjetivas")}</li>
          </ul>
        </Section>

        <Section title={T("On-Chain Submission", "On-Chain-Einreichung", "Envío on-chain")}>
          <p>
            {de
              ? <>Nach der Bewertung werden Ergebnisse über den <code className="text-amber-700">ScoringOracle</code>-Contract on-chain eingereicht. Jede Einreichung enthält:</>
              : es
              ? <>Tras la puntuación, los resultados se envían on-chain a través del contrato <code className="text-amber-700">ScoringOracle</code>. Cada envío incluye:</>
              : <>After scoring, results are submitted on-chain via the <code className="text-amber-700">ScoringOracle</code> contract. Each submission includes:</>
            }
          </p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>{T("Agent address + score (BPS)", "Agenten-Adresse + Score (BPS)", "Dirección del Agente + puntuación (BPS)")}</li>
            <li>{T("TEE attestation hash (proves scoring ran in secure enclave)", "TEE-Attestierungs-Hash (beweist, dass Bewertung im sicheren Enclave lief)", "Hash de certificación TEE (demuestra que la puntuación se ejecutó en el enclave seguro)")}</li>
            <li>{T("Signed by the authorized SCORER_ROLE address", "Signiert von der autorisierten SCORER_ROLE-Adresse", "Firmado por la dirección autorizada SCORER_ROLE")}</li>
          </ul>
        </Section>

        <Section title={T("Payout Tiers", "Auszahlungsstufen", "Niveles de pago")}>
          <div className="bg-white border border-slate-200 rounded-xl p-4 mt-3">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-4 text-slate-500 font-medium">{T("Score vs Threshold", "Score vs. Schwellenwert", "Puntuación vs. Umbral")}</th>
                  <th className="py-2 text-slate-500 font-medium">{T("Payout %", "Auszahlung %", "Pago %")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="py-2 pr-4">{T("≥ 100% of threshold", "≥ 100% des Schwellenwerts", "≥ 100% del umbral")}</td>
                  <td className="py-2 text-emerald-600 font-bold">100%</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-2 pr-4">{T("80-99% of threshold", "80-99% des Schwellenwerts", "80-99% del umbral")}</td>
                  <td className="py-2 text-amber-600 font-bold">50%</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-2 pr-4">{T("50-79% of threshold", "50-79% des Schwellenwerts", "50-79% del umbral")}</td>
                  <td className="py-2 text-orange-400 font-bold">25%</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">{T("< 50% of threshold", "< 50% des Schwellenwerts", "< 50% del umbral")}</td>
                  <td className="py-2 text-slate-500 font-bold">{T("0% (refund)", "0% (Rückerstattung)", "0% (reembolso)")}</td>
                </tr>
              </tbody>
            </table>
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

function Phase({ num, title, color, children }: { num: number; title: string; color: string; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    red: "border-slate-300 bg-slate-50",
    purple: "border-slate-300 bg-slate-50",
    emerald: "border-amber-200 bg-amber-50/50",
  };
  return (
    <div className={`border rounded-xl p-6 mt-4 ${colors[color]}`}>
      <h3 className="text-slate-900 font-semibold mb-3">Phase {num}: {title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function VerdictCard({ label, effect, desc, color }: { label: string; effect: string; desc: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: "border-amber-200 bg-amber-50 text-amber-700",
    green: "border-slate-200 bg-green-900/20 text-slate-700",
    gray: "border-slate-200 bg-slate-50/30 text-slate-500",
    yellow: "border-yellow-800 bg-yellow-900/20 text-amber-600",
    orange: "border-orange-800 bg-orange-900/20 text-orange-400",
    red: "border-slate-300 bg-slate-100 text-slate-500",
  };
  return (
    <div className={`border rounded-lg p-3 ${colors[color]}`}>
      <div className="font-mono text-xs font-bold">{label}</div>
      <div className="text-[10px] font-semibold mt-1">{effect}</div>
      <div className="text-[10px] opacity-60 mt-1">{desc}</div>
    </div>
  );
}
