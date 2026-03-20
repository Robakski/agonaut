export default function LogoConceptsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 space-y-16">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Logo Concepts — Round 2</h1>
        <p className="text-slate-500 text-sm mt-1">Exploring the AG (silver) + AU (gold) angle</p>
      </div>

      {/* Concept A: Precious Metals — AG silver, AU gold */}
      <Concept num="A" title="Precious Metals" desc="AG in silver, AU in gold — the chemistry of value is in our name">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="text-[54px] font-bold tracking-tight" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              <span style={{ color: '#94a3b8' }}>Ag</span>
              <span className="text-slate-900">on</span>
              <span style={{ color: '#d97706' }}>au</span>
              <span className="text-slate-900">t</span>
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="text-[54px] font-bold tracking-tight" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              <span style={{ color: '#cbd5e1' }}>Ag</span>
              <span className="text-white">on</span>
              <span style={{ color: '#f59e0b' }}>au</span>
              <span className="text-white">t</span>
            </span>
          </Variant>
        </div>
      </Concept>

      {/* Concept B: Subtle Metals — metallic gradient on AG and AU only */}
      <Concept num="B" title="Subtle Metals" desc="Same idea but more understated — AG and AU slightly shifted, rest neutral">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="text-[54px] font-extrabold tracking-tight" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              <span style={{ color: '#a1a1aa' }}>Ag</span>
              <span className="text-slate-900">on</span>
              <span style={{ color: '#b45309' }}>au</span>
              <span className="text-slate-900">t</span>
            </span>
          </Variant>
          <Variant bg="white">
            <span className="text-[54px] font-extrabold tracking-tight" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              <span style={{ color: '#9ca3af' }}>AG</span>
              <span className="text-slate-900">ON</span>
              <span style={{ color: '#b45309' }}>AU</span>
              <span className="text-slate-900">T</span>
            </span>
          </Variant>
        </div>
      </Concept>

      {/* Concept C: Element Notation */}
      <Concept num="C" title="Element Notation" desc="Chemistry-inspired — Ag and Au styled as element symbols with subtle superscript">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="text-[50px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              <span className="relative">
                <span style={{ color: '#71717a' }}>Ag</span>
                <span className="absolute -top-2 -right-3 text-[14px] font-medium" style={{ color: '#a1a1aa' }}>47</span>
              </span>
              <span className="ml-3">on</span>
              <span className="relative ml-0">
                <span style={{ color: '#92400e' }}>au</span>
                <span className="absolute -top-2 -right-3 text-[14px] font-medium" style={{ color: '#d97706' }}>79</span>
              </span>
              <span>t</span>
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="text-[50px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              <span className="relative">
                <span style={{ color: '#d4d4d8' }}>Ag</span>
                <span className="absolute -top-2 -right-3 text-[14px] font-medium" style={{ color: '#a1a1aa' }}>47</span>
              </span>
              <span className="ml-3">on</span>
              <span className="relative ml-0">
                <span style={{ color: '#fbbf24' }}>au</span>
                <span className="absolute -top-2 -right-3 text-[14px] font-medium" style={{ color: '#f59e0b' }}>79</span>
              </span>
              <span>t</span>
            </span>
          </Variant>
        </div>
      </Concept>

      {/* Concept D: Clean Bimetal */}
      <Concept num="D" title="Clean Bimetal" desc="All caps, AG and AU just slightly warmer/cooler than the base — you feel it before you see it">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="text-[52px] font-bold tracking-[0.12em] text-slate-800" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              <span style={{ color: '#78716c' }}>AG</span>
              <span>ON</span>
              <span style={{ color: '#a16207' }}>AU</span>
              <span>T</span>
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="text-[52px] font-bold tracking-[0.12em] text-slate-200" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              <span style={{ color: '#d4d4d8' }}>AG</span>
              <span>ON</span>
              <span style={{ color: '#fbbf24' }}>AU</span>
              <span>T</span>
            </span>
          </Variant>
        </div>
      </Concept>

      {/* Concept E: Monogram + Wordmark */}
      <Concept num="E" title="Monogram Mark" desc="A standalone Ag|Au monogram for favicon/icon + full wordmark">
        <div className="flex justify-center gap-8 flex-wrap items-center">
          {/* Monogram */}
          <Variant bg="white">
            <div className="flex items-center gap-1">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center border-2" style={{ borderColor: '#d4d4d8', background: 'linear-gradient(135deg, #f4f4f5 0%, #e4e4e7 100%)' }}>
                <span className="text-xl font-bold" style={{ color: '#71717a' }}>Ag</span>
              </div>
              <div className="w-14 h-14 rounded-xl flex items-center justify-center border-2" style={{ borderColor: '#d97706', background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)' }}>
                <span className="text-xl font-bold" style={{ color: '#92400e' }}>Au</span>
              </div>
            </div>
          </Variant>
          <Variant bg="white">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-0.5">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f4f4f5 0%, #d4d4d8 100%)' }}>
                  <span className="text-sm font-bold" style={{ color: '#52525b' }}>Ag</span>
                </div>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fcd34d 100%)' }}>
                  <span className="text-sm font-bold" style={{ color: '#78350f' }}>Au</span>
                </div>
              </div>
              <span className="text-3xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "system-ui" }}>Agonaut</span>
            </div>
          </Variant>
        </div>
      </Concept>

      {/* Concept F: The Gradient Bridge */}
      <Concept num="F" title="The Gradient" desc="Silver-to-gold gradient flows through the entire word — precious metal spectrum">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span
              className="text-[54px] font-extrabold tracking-tight"
              style={{
                fontFamily: "system-ui, -apple-system, sans-serif",
                background: "linear-gradient(90deg, #a1a1aa 0%, #78716c 25%, #0f172a 40%, #0f172a 60%, #a16207 75%, #d97706 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Agonaut
            </span>
          </Variant>
          <Variant bg="dark">
            <span
              className="text-[54px] font-extrabold tracking-tight"
              style={{
                fontFamily: "system-ui, -apple-system, sans-serif",
                background: "linear-gradient(90deg, #d4d4d8 0%, #a1a1aa 20%, #ffffff 40%, #ffffff 60%, #fbbf24 80%, #f59e0b 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Agonaut
            </span>
          </Variant>
        </div>
      </Concept>

      {/* Concept G: Underline Metals */}
      <Concept num="G" title="Underline Accents" desc="Clean wordmark with silver and gold underlines beneath Ag and Au">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="text-[52px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              <span className="relative">
                Ag
                <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #d4d4d8, #a1a1aa)' }} />
              </span>
              on
              <span className="relative">
                au
                <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #fbbf24, #d97706)' }} />
              </span>
              t
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="text-[52px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              <span className="relative">
                Ag
                <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #e4e4e7, #a1a1aa)' }} />
              </span>
              on
              <span className="relative">
                au
                <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, #fbbf24, #f59e0b)' }} />
              </span>
              t
            </span>
          </Variant>
        </div>
      </Concept>

      {/* Concept H: Minimal Dot Metals */}
      <Concept num="H" title="Metal Dots" desc="Two small dots — silver and gold — sit beside the wordmark like a maker's hallmark">
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

      {/* Previous favorites for comparison */}
      <div className="border-t border-slate-200 pt-12">
        <p className="text-center text-xs text-slate-400 uppercase tracking-widest mb-8">Previous round favorites for comparison</p>
        
        <Concept num="R1-5" title="Soft Geometry (Round 1)" desc="Violet accent on the 'o'">
          <div className="flex justify-center gap-8 flex-wrap">
            <Variant bg="white">
              <span className="text-[52px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui" }}>
                Ag<span className="text-violet-600">o</span>naut
              </span>
            </Variant>
            <Variant bg="white">
              <span className="text-5xl font-bold tracking-[0.2em] text-slate-900" style={{ fontFamily: "system-ui" }}>
                AGON<span className="text-slate-300 font-light mx-0.5">|</span>AUT
              </span>
            </Variant>
          </div>
        </Concept>
      </div>

      <p className="text-center text-xs text-slate-400 pt-8 pb-4">
        Internal review — will be removed before launch
      </p>
    </div>
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
