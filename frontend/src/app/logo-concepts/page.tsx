export default function LogoConceptsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 space-y-16">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Logo Concepts — Round 3</h1>
        <p className="text-slate-500 text-sm mt-1">Refining F (gradient), G (underlines), H (dots) directions</p>
      </div>

      {/* ── GRADIENT FAMILY (from F) ── */}
      <div className="text-center"><p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Gradient Family</p></div>

      <Concept num="G1-CAPS" title="G1 All Caps — Tight" desc="AGONAUT with tight letter spacing + silver→gold underline">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="relative inline-block text-[52px] font-bold text-slate-900" style={{ fontFamily: "system-ui", letterSpacing: "-0.02em" }}>
              AGONAUT
              <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #d4d4d8, #a1a1aa, #d97706, #f59e0b)' }} />
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="relative inline-block text-[52px] font-bold text-white" style={{ fontFamily: "system-ui", letterSpacing: "-0.02em" }}>
              AGONAUT
              <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #e4e4e7, #a1a1aa, #fbbf24, #f59e0b)' }} />
            </span>
          </Variant>
        </div>
        <div className="mt-6 flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="relative inline-block text-[52px] font-extrabold text-slate-900" style={{ fontFamily: "system-ui", letterSpacing: "-0.03em" }}>
              AGONAUT
              <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #d4d4d8, #a1a1aa, #d97706, #f59e0b)' }} />
            </span>
          </Variant>
          <Variant bg="white">
            <span className="relative inline-block text-[56px] font-bold text-slate-900" style={{ fontFamily: "system-ui", letterSpacing: "-0.04em" }}>
              AGONAUT
              <span className="absolute -bottom-1 left-0 right-0 h-[4px] rounded-full" style={{ background: 'linear-gradient(90deg, #d4d4d8, #a1a1aa, #d97706, #f59e0b)' }} />
            </span>
          </Variant>
          <Variant bg="white">
            <span className="relative inline-block text-[52px] font-black text-slate-900" style={{ fontFamily: "system-ui", letterSpacing: "-0.05em" }}>
              AGONAUT
              <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #d4d4d8, #a1a1aa, #d97706, #f59e0b)' }} />
            </span>
          </Variant>
        </div>
      </Concept>

      <Concept num="F1" title="Silver → Gold" desc="Full silver-to-gold gradient, no dark middle — pure precious metal spectrum">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <Grad style="linear-gradient(90deg, #a8a29e 0%, #d6d3d1 30%, #fbbf24 70%, #d97706 100%)">Agonaut</Grad>
          </Variant>
          <Variant bg="dark">
            <Grad style="linear-gradient(90deg, #d4d4d8 0%, #e7e5e4 30%, #fde68a 70%, #f59e0b 100%)">Agonaut</Grad>
          </Variant>
        </div>
      </Concept>

      <Concept num="F2" title="Ends Only" desc="Silver fades in on the left, gold fades in on the right — center stays neutral">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <Grad style="linear-gradient(90deg, #a1a1aa 0%, #0f172a 20%, #0f172a 80%, #d97706 100%)">Agonaut</Grad>
          </Variant>
          <Variant bg="dark">
            <Grad style="linear-gradient(90deg, #d4d4d8 0%, #ffffff 20%, #ffffff 80%, #fbbf24 100%)">Agonaut</Grad>
          </Variant>
        </div>
      </Concept>

      <Concept num="F3" title="Warm Gradient" desc="Silver → warm gray → amber — feels like molten metal cooling">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <Grad style="linear-gradient(90deg, #9ca3af 0%, #6b7280 30%, #92400e 65%, #b45309 100%)">Agonaut</Grad>
          </Variant>
          <Variant bg="dark">
            <Grad style="linear-gradient(90deg, #d1d5db 0%, #9ca3af 30%, #f59e0b 65%, #fbbf24 100%)">Agonaut</Grad>
          </Variant>
        </div>
      </Concept>

      <Concept num="F4" title="Lowercase Gradient" desc="Lowercase version — softer, more approachable">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <Grad style="linear-gradient(90deg, #a1a1aa 0%, #0f172a 20%, #0f172a 80%, #d97706 100%)">agonaut</Grad>
          </Variant>
          <Variant bg="white">
            <Grad style="linear-gradient(90deg, #a8a29e 0%, #d6d3d1 30%, #fbbf24 70%, #d97706 100%)">agonaut</Grad>
          </Variant>
        </div>
      </Concept>

      <Concept num="F5" title="Diagonal Gradient" desc="135° angle — silver top-left to gold bottom-right, like light hitting metal">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <Grad style="linear-gradient(135deg, #a1a1aa 0%, #57534e 35%, #92400e 65%, #d97706 100%)">Agonaut</Grad>
          </Variant>
          <Variant bg="dark">
            <Grad style="linear-gradient(135deg, #d4d4d8 0%, #a8a29e 35%, #fbbf24 65%, #f59e0b 100%)">Agonaut</Grad>
          </Variant>
        </div>
      </Concept>

      {/* ── UNDERLINE FAMILY (from G) ── */}
      <div className="text-center pt-8"><p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Underline Family</p></div>

      <Concept num="G1" title="Full Underline" desc="One continuous line: silver → gold gradient beneath the entire word">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="relative inline-block text-[52px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui" }}>
              Agonaut
              <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #d4d4d8, #a1a1aa, #d97706, #f59e0b)' }} />
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="relative inline-block text-[52px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui" }}>
              Agonaut
              <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #e4e4e7, #a1a1aa, #fbbf24, #f59e0b)' }} />
            </span>
          </Variant>
        </div>
      </Concept>

      <Concept num="G2" title="Split Underlines" desc="Original concept — silver under Ag, gold under au, with gap in the middle">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="text-[52px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui" }}>
              <U color="linear-gradient(90deg, #d4d4d8, #a1a1aa)">Ag</U>
              on
              <U color="linear-gradient(90deg, #fbbf24, #d97706)">au</U>
              t
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="text-[52px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui" }}>
              <U color="linear-gradient(90deg, #e4e4e7, #a1a1aa)">Ag</U>
              on
              <U color="linear-gradient(90deg, #fde68a, #f59e0b)">au</U>
              t
            </span>
          </Variant>
        </div>
      </Concept>

      <Concept num="G3" title="Thick Bar" desc="Bolder underline bar — more presence, works better at small sizes">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="relative inline-block text-[52px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui" }}>
              Agonaut
              <span className="absolute -bottom-1 left-0 right-0 h-[5px] rounded-full" style={{ background: 'linear-gradient(90deg, #d4d4d8, #78716c, #b45309, #f59e0b)' }} />
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="relative inline-block text-[52px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui" }}>
              Agonaut
              <span className="absolute -bottom-1 left-0 right-0 h-[5px] rounded-full" style={{ background: 'linear-gradient(90deg, #e4e4e7, #a1a1aa, #fbbf24, #f59e0b)' }} />
            </span>
          </Variant>
        </div>
      </Concept>

      <Concept num="G4" title="Overline" desc="Same gradient but above the word instead — unexpected, distinctive">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="relative inline-block text-[52px] font-bold tracking-tight text-slate-900 pt-2" style={{ fontFamily: "system-ui" }}>
              <span className="absolute top-0 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #d4d4d8, #a1a1aa, #d97706, #f59e0b)' }} />
              Agonaut
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="relative inline-block text-[52px] font-bold tracking-tight text-white pt-2" style={{ fontFamily: "system-ui" }}>
              <span className="absolute top-0 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #e4e4e7, #a1a1aa, #fbbf24, #f59e0b)' }} />
              Agonaut
            </span>
          </Variant>
        </div>
      </Concept>

      <Concept num="G5" title="Lowercase + Underline" desc="Lowercase with the full gradient underline">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="relative inline-block text-[52px] font-semibold tracking-wide text-slate-900" style={{ fontFamily: "system-ui" }}>
              agonaut
              <span className="absolute bottom-0.5 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #d4d4d8, #a1a1aa, #d97706, #f59e0b)' }} />
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="relative inline-block text-[52px] font-semibold tracking-wide text-white" style={{ fontFamily: "system-ui" }}>
              agonaut
              <span className="absolute bottom-0.5 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #e4e4e7, #a1a1aa, #fbbf24, #f59e0b)' }} />
            </span>
          </Variant>
        </div>
      </Concept>

      {/* ── DOT FAMILY (from H) ── */}
      <div className="text-center pt-8"><p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Dot / Mark Family</p></div>

      <Concept num="H1" title="Side Dots" desc="Original — silver + gold dots stacked beside the wordmark">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <div className="flex items-center gap-3">
              <span className="text-[50px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui" }}>Agonaut</span>
              <div className="flex flex-col gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: 'linear-gradient(135deg, #e4e4e7, #a1a1aa)' }} />
                <div className="w-3 h-3 rounded-full" style={{ background: 'linear-gradient(135deg, #fde68a, #d97706)' }} />
              </div>
            </div>
          </Variant>
          <Variant bg="dark">
            <div className="flex items-center gap-3">
              <span className="text-[50px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui" }}>Agonaut</span>
              <div className="flex flex-col gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: 'linear-gradient(135deg, #f4f4f5, #d4d4d8)' }} />
                <div className="w-3 h-3 rounded-full" style={{ background: 'linear-gradient(135deg, #fde68a, #f59e0b)' }} />
              </div>
            </div>
          </Variant>
        </div>
      </Concept>

      <Concept num="H2" title="Leading Dots" desc="Dots before the word — like a maker's stamp">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="w-3.5 h-3.5 rounded-full" style={{ background: 'linear-gradient(135deg, #e4e4e7, #9ca3af)' }} />
                <div className="w-3.5 h-3.5 rounded-full" style={{ background: 'linear-gradient(135deg, #fde68a, #d97706)' }} />
              </div>
              <span className="text-[50px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui" }}>Agonaut</span>
            </div>
          </Variant>
          <Variant bg="dark">
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="w-3.5 h-3.5 rounded-full" style={{ background: 'linear-gradient(135deg, #f4f4f5, #d4d4d8)' }} />
                <div className="w-3.5 h-3.5 rounded-full" style={{ background: 'linear-gradient(135deg, #fde68a, #f59e0b)' }} />
              </div>
              <span className="text-[50px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui" }}>Agonaut</span>
            </div>
          </Variant>
        </div>
      </Concept>

      <Concept num="H3" title="Inline Dots" desc="Dots replace the 'o' — silver dot and gold dot fused into the word">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <div className="flex items-baseline gap-0">
              <span className="text-[50px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui" }}>Ag</span>
              <div className="flex items-center mx-0.5">
                <div className="w-4 h-4 rounded-full -mr-0.5" style={{ background: 'linear-gradient(135deg, #e4e4e7, #9ca3af)' }} />
                <div className="w-4 h-4 rounded-full -ml-0.5" style={{ background: 'linear-gradient(135deg, #fde68a, #d97706)' }} />
              </div>
              <span className="text-[50px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui" }}>naut</span>
            </div>
          </Variant>
          <Variant bg="dark">
            <div className="flex items-baseline gap-0">
              <span className="text-[50px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui" }}>Ag</span>
              <div className="flex items-center mx-0.5">
                <div className="w-4 h-4 rounded-full -mr-0.5" style={{ background: 'linear-gradient(135deg, #f4f4f5, #d4d4d8)' }} />
                <div className="w-4 h-4 rounded-full -ml-0.5" style={{ background: 'linear-gradient(135deg, #fde68a, #f59e0b)' }} />
              </div>
              <span className="text-[50px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui" }}>naut</span>
            </div>
          </Variant>
        </div>
      </Concept>

      <Concept num="H4" title="Single Gradient Dot" desc="One dot that blends silver into gold — the simplest possible mark">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full" style={{ background: 'linear-gradient(135deg, #d4d4d8 0%, #fbbf24 100%)' }} />
              <span className="text-[50px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui" }}>Agonaut</span>
            </div>
          </Variant>
          <Variant bg="dark">
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full" style={{ background: 'linear-gradient(135deg, #e4e4e7 0%, #fbbf24 100%)' }} />
              <span className="text-[50px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui" }}>Agonaut</span>
            </div>
          </Variant>
        </div>
      </Concept>

      <Concept num="H5" title="Dot as Period" desc="Silver-gold gradient dot after the word like a confident period. Statement.">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <div className="flex items-baseline gap-1">
              <span className="text-[50px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui" }}>Agonaut</span>
              <div className="w-4 h-4 rounded-full mb-1" style={{ background: 'linear-gradient(135deg, #d4d4d8 0%, #fbbf24 100%)' }} />
            </div>
          </Variant>
          <Variant bg="dark">
            <div className="flex items-baseline gap-1">
              <span className="text-[50px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui" }}>Agonaut</span>
              <div className="w-4 h-4 rounded-full mb-1" style={{ background: 'linear-gradient(135deg, #e4e4e7 0%, #fbbf24 100%)' }} />
            </div>
          </Variant>
        </div>
      </Concept>

      {/* ── COMBINATIONS ── */}
      <div className="text-center pt-8"><p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Best of Both — Combinations</p></div>

      <Concept num="X1" title="Gradient + Underline" desc="Gradient text with the gradient underline — maximum precious metal energy">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="relative inline-block">
              <Grad style="linear-gradient(90deg, #a1a1aa 0%, #78716c 30%, #92400e 70%, #d97706 100%)">Agonaut</Grad>
              <span className="absolute -bottom-1 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #d4d4d8, #a1a1aa, #d97706, #f59e0b)' }} />
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="relative inline-block">
              <Grad style="linear-gradient(90deg, #d4d4d8 0%, #a1a1aa 30%, #fbbf24 70%, #f59e0b 100%)">Agonaut</Grad>
              <span className="absolute -bottom-1 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #e4e4e7, #d4d4d8, #fbbf24, #f59e0b)' }} />
            </span>
          </Variant>
        </div>
      </Concept>

      <Concept num="X2" title="Gradient + Leading Dot" desc="Gradient text with the blended silver-gold dot">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full" style={{ background: 'linear-gradient(135deg, #d4d4d8 0%, #fbbf24 100%)' }} />
              <Grad style="linear-gradient(90deg, #a1a1aa 0%, #0f172a 20%, #0f172a 80%, #d97706 100%)">Agonaut</Grad>
            </div>
          </Variant>
          <Variant bg="dark">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full" style={{ background: 'linear-gradient(135deg, #e4e4e7 0%, #fbbf24 100%)' }} />
              <Grad style="linear-gradient(90deg, #d4d4d8 0%, #ffffff 20%, #ffffff 80%, #fbbf24 100%)">Agonaut</Grad>
            </div>
          </Variant>
        </div>
      </Concept>

      <Concept num="X3" title="Underline + Trailing Dot" desc="Clean dark text, gradient underline, and the period dot">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <div className="flex items-baseline gap-1">
              <span className="relative inline-block text-[50px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui" }}>
                Agonaut
                <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #d4d4d8, #a1a1aa, #d97706, #f59e0b)' }} />
              </span>
              <div className="w-3.5 h-3.5 rounded-full mb-1.5" style={{ background: 'linear-gradient(135deg, #d4d4d8 0%, #fbbf24 100%)' }} />
            </div>
          </Variant>
          <Variant bg="dark">
            <div className="flex items-baseline gap-1">
              <span className="relative inline-block text-[50px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui" }}>
                Agonaut
                <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #e4e4e7, #d4d4d8, #fbbf24, #f59e0b)' }} />
              </span>
              <div className="w-3.5 h-3.5 rounded-full mb-1.5" style={{ background: 'linear-gradient(135deg, #e4e4e7 0%, #fbbf24 100%)' }} />
            </div>
          </Variant>
        </div>
      </Concept>

      {/* ── NAVBAR LOGOMARK OPTIONS ── */}
      <div className="text-center pt-8"><p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Navbar Logomark — Fixing the Double-A</p></div>

      <Concept num="N1" title="Logomark + gonaut" desc="The stylized A IS the first letter — no redundancy. Clean and clever.">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <div className="flex items-center gap-1">
              <svg width="32" height="32" viewBox="0 0 40 40"><polygon points="20,4 4,36 20,28 36,36" fill="url(#agNav)" /><defs><linearGradient id="agNav" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#d4d4d8" /><stop offset="100%" stopColor="#d97706" /></linearGradient></defs></svg>
              <span className="text-[22px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui" }}>gonaut</span>
            </div>
          </Variant>
          <Variant bg="dark">
            <div className="flex items-center gap-1">
              <svg width="32" height="32" viewBox="0 0 40 40"><polygon points="20,4 4,36 20,28 36,36" fill="url(#agNavD)" /><defs><linearGradient id="agNavD" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#e4e4e7" /><stop offset="100%" stopColor="#fbbf24" /></linearGradient></defs></svg>
              <span className="text-[22px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui" }}>gonaut</span>
            </div>
          </Variant>
        </div>
      </Concept>

      <Concept num="N2" title="Logomark Only (no text)" desc="Just the mark in the navbar — what Stripe, Linear, Apple do. Minimalist.">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <svg width="36" height="36" viewBox="0 0 40 40"><polygon points="20,4 4,36 20,28 36,36" fill="url(#agN2)" /><defs><linearGradient id="agN2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#d4d4d8" /><stop offset="100%" stopColor="#d97706" /></linearGradient></defs></svg>
          </Variant>
          <Variant bg="dark">
            <svg width="36" height="36" viewBox="0 0 40 40"><polygon points="20,4 4,36 20,28 36,36" fill="url(#agN2D)" /><defs><linearGradient id="agN2D" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#e4e4e7" /><stop offset="100%" stopColor="#fbbf24" /></linearGradient></defs></svg>
          </Variant>
        </div>
      </Concept>

      <Concept num="N3" title="AG Monogram + gonaut" desc="AG monogram as mark, rest of word follows. Precious metals reference built in.">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <div className="flex items-center gap-1.5">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg" style={{ background: 'linear-gradient(135deg, #d4d4d8 0%, #d97706 100%)' }}>
                <span className="text-[13px] font-black text-white tracking-tight" style={{ fontFamily: "system-ui" }}>AG</span>
              </div>
              <span className="text-[22px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui" }}>onaut</span>
            </div>
          </Variant>
          <Variant bg="dark">
            <div className="flex items-center gap-1.5">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg" style={{ background: 'linear-gradient(135deg, #e4e4e7 0%, #fbbf24 100%)' }}>
                <span className="text-[13px] font-black text-slate-900 tracking-tight" style={{ fontFamily: "system-ui" }}>AG</span>
              </div>
              <span className="text-[22px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui" }}>onaut</span>
            </div>
          </Variant>
        </div>
      </Concept>

      <Concept num="N4" title="Full Wordmark (no separate mark)" desc="Just &quot;AGONAUT&quot; with the gradient underline. No logomark needed.">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="relative inline-block text-[22px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui" }}>
              AGONAUT
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full" style={{ background: 'linear-gradient(90deg, #d4d4d8, #a1a1aa, #d97706, #f59e0b)' }} />
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="relative inline-block text-[22px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui" }}>
              AGONAUT
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full" style={{ background: 'linear-gradient(90deg, #e4e4e7, #a1a1aa, #fbbf24, #f59e0b)' }} />
            </span>
          </Variant>
        </div>
      </Concept>

      {/* ── FAVICON OPTIONS ── */}
      <div className="text-center pt-8"><p className="text-xs font-medium text-slate-400 uppercase tracking-widest">Favicon Options (shown at ~32px)</p></div>

      <Concept num="FV1" title="AG Monogram" desc="Silver+gold gradient square with AG — precious metals reference, reads as brand abbreviation. Best at tiny sizes.">
        <div className="flex justify-center gap-8 flex-wrap items-end">
          <Variant bg="white">
            <div className="flex items-end gap-6">
              {/* 64px preview */}
              <div className="flex items-center justify-center w-16 h-16 rounded-xl" style={{ background: 'linear-gradient(135deg, #d4d4d8 0%, #a1a1aa 40%, #d97706 100%)' }}>
                <span className="text-[22px] font-black text-white tracking-tight" style={{ fontFamily: "system-ui" }}>AG</span>
              </div>
              {/* 32px actual */}
              <div className="flex items-center justify-center w-8 h-8 rounded-md" style={{ background: 'linear-gradient(135deg, #d4d4d8 0%, #a1a1aa 40%, #d97706 100%)' }}>
                <span className="text-[10px] font-black text-white tracking-tight" style={{ fontFamily: "system-ui" }}>AG</span>
              </div>
              {/* 16px */}
              <div className="flex items-center justify-center w-4 h-4 rounded-sm" style={{ background: 'linear-gradient(135deg, #d4d4d8 0%, #d97706 100%)' }}>
                <span className="text-[6px] font-black text-white" style={{ fontFamily: "system-ui" }}>A</span>
              </div>
            </div>
          </Variant>
          <Variant bg="dark">
            <div className="flex items-end gap-6">
              <div className="flex items-center justify-center w-16 h-16 rounded-xl" style={{ background: 'linear-gradient(135deg, #e4e4e7 0%, #d4d4d8 40%, #fbbf24 100%)' }}>
                <span className="text-[22px] font-black text-slate-900 tracking-tight" style={{ fontFamily: "system-ui" }}>AG</span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 rounded-md" style={{ background: 'linear-gradient(135deg, #e4e4e7 0%, #d4d4d8 40%, #fbbf24 100%)' }}>
                <span className="text-[10px] font-black text-slate-900 tracking-tight" style={{ fontFamily: "system-ui" }}>AG</span>
              </div>
              <div className="flex items-center justify-center w-4 h-4 rounded-sm" style={{ background: 'linear-gradient(135deg, #e4e4e7 0%, #fbbf24 100%)' }}>
                <span className="text-[6px] font-black text-slate-900" style={{ fontFamily: "system-ui" }}>A</span>
              </div>
            </div>
          </Variant>
        </div>
      </Concept>

      <Concept num="FV2" title="Prism Triangle" desc="The geometric A from the original Prism concept — just the shape, no letter. Distinctive at all sizes.">
        <div className="flex justify-center gap-8 flex-wrap items-end">
          <Variant bg="white">
            <div className="flex items-end gap-6">
              <svg width="64" height="64" viewBox="0 0 40 40"><polygon points="20,4 4,36 20,28 36,36" fill="url(#fv2a)" /><defs><linearGradient id="fv2a" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#d4d4d8" /><stop offset="50%" stopColor="#a1a1aa" /><stop offset="100%" stopColor="#d97706" /></linearGradient></defs></svg>
              <svg width="32" height="32" viewBox="0 0 40 40"><polygon points="20,4 4,36 20,28 36,36" fill="url(#fv2b)" /><defs><linearGradient id="fv2b" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#d4d4d8" /><stop offset="100%" stopColor="#d97706" /></linearGradient></defs></svg>
              <svg width="16" height="16" viewBox="0 0 40 40"><polygon points="20,4 4,36 20,28 36,36" fill="url(#fv2c)" /><defs><linearGradient id="fv2c" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#d4d4d8" /><stop offset="100%" stopColor="#d97706" /></linearGradient></defs></svg>
            </div>
          </Variant>
          <Variant bg="dark">
            <div className="flex items-end gap-6">
              <svg width="64" height="64" viewBox="0 0 40 40"><polygon points="20,4 4,36 20,28 36,36" fill="url(#fv2d)" /><defs><linearGradient id="fv2d" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#e4e4e7" /><stop offset="50%" stopColor="#d4d4d8" /><stop offset="100%" stopColor="#fbbf24" /></linearGradient></defs></svg>
              <svg width="32" height="32" viewBox="0 0 40 40"><polygon points="20,4 4,36 20,28 36,36" fill="url(#fv2e)" /><defs><linearGradient id="fv2e" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#e4e4e7" /><stop offset="100%" stopColor="#fbbf24" /></linearGradient></defs></svg>
              <svg width="16" height="16" viewBox="0 0 40 40"><polygon points="20,4 4,36 20,28 36,36" fill="url(#fv2f)" /><defs><linearGradient id="fv2f" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#e4e4e7" /><stop offset="100%" stopColor="#fbbf24" /></linearGradient></defs></svg>
            </div>
          </Variant>
        </div>
      </Concept>

      <Concept num="FV3" title="Gradient Dot" desc="The simplest mark — a single silver→gold gradient circle. Like a molten metal droplet.">
        <div className="flex justify-center gap-8 flex-wrap items-end">
          <Variant bg="white">
            <div className="flex items-end gap-6">
              <div className="w-16 h-16 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #e4e4e7 0%, #d4d4d8 30%, #b45309 80%, #d97706 100%)' }} />
              <div className="w-8 h-8 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #e4e4e7 0%, #d4d4d8 30%, #b45309 80%, #d97706 100%)' }} />
              <div className="w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #e4e4e7 0%, #d97706 100%)' }} />
            </div>
          </Variant>
          <Variant bg="dark">
            <div className="flex items-end gap-6">
              <div className="w-16 h-16 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #f4f4f5 0%, #d4d4d8 30%, #f59e0b 80%, #fbbf24 100%)' }} />
              <div className="w-8 h-8 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #f4f4f5 0%, #d4d4d8 30%, #f59e0b 80%, #fbbf24 100%)' }} />
              <div className="w-4 h-4 rounded-full" style={{ background: 'radial-gradient(circle at 30% 30%, #f4f4f5 0%, #fbbf24 100%)' }} />
            </div>
          </Variant>
        </div>
      </Concept>

      <Concept num="FV4" title="AU Monogram" desc="Gold-forward: AU in a warm gradient square. The 'gold standard' of AI arenas.">
        <div className="flex justify-center gap-8 flex-wrap items-end">
          <Variant bg="white">
            <div className="flex items-end gap-6">
              <div className="flex items-center justify-center w-16 h-16 rounded-xl" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #a1a1aa 100%)' }}>
                <span className="text-[22px] font-black text-white tracking-tight" style={{ fontFamily: "system-ui" }}>AU</span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 rounded-md" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #a1a1aa 100%)' }}>
                <span className="text-[10px] font-black text-white tracking-tight" style={{ fontFamily: "system-ui" }}>AU</span>
              </div>
              <div className="flex items-center justify-center w-4 h-4 rounded-sm" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
              </div>
            </div>
          </Variant>
          <Variant bg="dark">
            <div className="flex items-end gap-6">
              <div className="flex items-center justify-center w-16 h-16 rounded-xl" style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d4d4d8 100%)' }}>
                <span className="text-[22px] font-black text-slate-900 tracking-tight" style={{ fontFamily: "system-ui" }}>AU</span>
              </div>
              <div className="flex items-center justify-center w-8 h-8 rounded-md" style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d4d4d8 100%)' }}>
                <span className="text-[10px] font-black text-slate-900 tracking-tight" style={{ fontFamily: "system-ui" }}>AU</span>
              </div>
              <div className="flex items-center justify-center w-4 h-4 rounded-sm" style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' }}>
              </div>
            </div>
          </Variant>
        </div>
      </Concept>

      <Concept num="FV5" title="Split Circle — AG|AU" desc="Circle split vertically: silver left, gold right. Duality of the two metals.">
        <div className="flex justify-center gap-8 flex-wrap items-end">
          <Variant bg="white">
            <div className="flex items-end gap-6">
              <svg width="64" height="64" viewBox="0 0 64 64">
                <clipPath id="leftHalf"><rect x="0" y="0" width="32" height="64" /></clipPath>
                <clipPath id="rightHalf"><rect x="32" y="0" width="32" height="64" /></clipPath>
                <circle cx="32" cy="32" r="30" fill="#b0b0b8" clipPath="url(#leftHalf)" />
                <circle cx="32" cy="32" r="30" fill="#d97706" clipPath="url(#rightHalf)" />
                <line x1="32" y1="4" x2="32" y2="60" stroke="white" strokeWidth="1.5" />
              </svg>
              <svg width="32" height="32" viewBox="0 0 64 64">
                <clipPath id="lh2"><rect x="0" y="0" width="32" height="64" /></clipPath>
                <clipPath id="rh2"><rect x="32" y="0" width="32" height="64" /></clipPath>
                <circle cx="32" cy="32" r="30" fill="#b0b0b8" clipPath="url(#lh2)" />
                <circle cx="32" cy="32" r="30" fill="#d97706" clipPath="url(#rh2)" />
                <line x1="32" y1="4" x2="32" y2="60" stroke="white" strokeWidth="2" />
              </svg>
              <svg width="16" height="16" viewBox="0 0 64 64">
                <clipPath id="lh3"><rect x="0" y="0" width="32" height="64" /></clipPath>
                <clipPath id="rh3"><rect x="32" y="0" width="32" height="64" /></clipPath>
                <circle cx="32" cy="32" r="30" fill="#b0b0b8" clipPath="url(#lh3)" />
                <circle cx="32" cy="32" r="30" fill="#d97706" clipPath="url(#rh3)" />
              </svg>
            </div>
          </Variant>
          <Variant bg="dark">
            <div className="flex items-end gap-6">
              <svg width="64" height="64" viewBox="0 0 64 64">
                <clipPath id="lhD"><rect x="0" y="0" width="32" height="64" /></clipPath>
                <clipPath id="rhD"><rect x="32" y="0" width="32" height="64" /></clipPath>
                <circle cx="32" cy="32" r="30" fill="#d4d4d8" clipPath="url(#lhD)" />
                <circle cx="32" cy="32" r="30" fill="#fbbf24" clipPath="url(#rhD)" />
                <line x1="32" y1="4" x2="32" y2="60" stroke="#0f172a" strokeWidth="1.5" />
              </svg>
              <svg width="32" height="32" viewBox="0 0 64 64">
                <clipPath id="lhD2"><rect x="0" y="0" width="32" height="64" /></clipPath>
                <clipPath id="rhD2"><rect x="32" y="0" width="32" height="64" /></clipPath>
                <circle cx="32" cy="32" r="30" fill="#d4d4d8" clipPath="url(#lhD2)" />
                <circle cx="32" cy="32" r="30" fill="#fbbf24" clipPath="url(#rhD2)" />
                <line x1="32" y1="4" x2="32" y2="60" stroke="#0f172a" strokeWidth="2" />
              </svg>
              <svg width="16" height="16" viewBox="0 0 64 64">
                <clipPath id="lhD3"><rect x="0" y="0" width="32" height="64" /></clipPath>
                <clipPath id="rhD3"><rect x="32" y="0" width="32" height="64" /></clipPath>
                <circle cx="32" cy="32" r="30" fill="#d4d4d8" clipPath="url(#lhD3)" />
                <circle cx="32" cy="32" r="30" fill="#fbbf24" clipPath="url(#rhD3)" />
              </svg>
            </div>
          </Variant>
        </div>
      </Concept>

      <p className="text-center text-xs text-slate-400 pt-8 pb-4">Internal review — will be removed before launch</p>
    </div>
  );
}

function Grad({ style, children }: { style: string; children: React.ReactNode }) {
  return (
    <span
      className="text-[52px] font-bold tracking-tight"
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        background: style,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
    >
      {children}
    </span>
  );
}

function U({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="relative">
      {children}
      <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full" style={{ background: color }} />
    </span>
  );
}

function Concept({ num, title, desc, children }: { num: string | number; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
      <div className="text-center mb-8">
        <p className="text-xs font-medium text-violet-600 uppercase tracking-widest mb-1">Concept {num}</p>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500 mt-1">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function Variant({ bg, children }: { bg: "white" | "dark"; children: React.ReactNode }) {
  return (
    <div className={`inline-flex items-center justify-center px-10 py-6 rounded-xl ${
      bg === "white" ? "bg-white border border-slate-200" : "bg-slate-900"
    }`}>
      {children}
    </div>
  );
}
