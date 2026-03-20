export default function LogoConceptsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 space-y-16">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Logo Concepts</h1>
        <p className="text-slate-500 text-sm mt-1">Internal review — pick your favorite</p>
      </div>

      {/* Concept 1: The Weighted A */}
      <Concept num={1} title="The Weighted A" desc="Geometric sans, violet dots replace both A crossbars">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <svg width="340" height="60" viewBox="0 0 340 60">
              {/* A with dot */}
              <path d="M2 56 L18 4 L34 56" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="18" cy="38" r="3.2" fill="#7c3aed"/>
              {/* G */}
              <path d="M72 18 C66 6, 50 4, 44 14 C38 24, 38 40, 44 48 C50 56, 66 54, 72 44 L72 34 L60 34" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              {/* O */}
              <ellipse cx="104" cy="30" rx="17" ry="25" fill="none" stroke="#0f172a" strokeWidth="4"/>
              {/* N */}
              <path d="M134 56 L134 4 L166 56 L166 4" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              {/* A with dot */}
              <path d="M182 56 L198 4 L214 56" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="198" cy="38" r="3.2" fill="#7c3aed"/>
              {/* U */}
              <path d="M230 4 L230 40 C230 52, 244 56, 258 56 C272 56, 272 52, 272 40 L272 4" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              {/* T */}
              <path d="M290 4 L330 4 M310 4 L310 56" fill="none" stroke="#0f172a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Variant>
          <Variant bg="dark">
            <svg width="340" height="60" viewBox="0 0 340 60">
              <path d="M2 56 L18 4 L34 56" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="18" cy="38" r="3.2" fill="#7c3aed"/>
              <path d="M72 18 C66 6, 50 4, 44 14 C38 24, 38 40, 44 48 C50 56, 66 54, 72 44 L72 34 L60 34" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              <ellipse cx="104" cy="30" rx="17" ry="25" fill="none" stroke="white" strokeWidth="4"/>
              <path d="M134 56 L134 4 L166 56 L166 4" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M182 56 L198 4 L214 56" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="198" cy="38" r="3.2" fill="#7c3aed"/>
              <path d="M230 4 L230 40 C230 52, 244 56, 258 56 C272 56, 272 52, 272 40 L272 4" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M290 4 L330 4 M310 4 L310 56" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Variant>
        </div>
      </Concept>

      {/* Concept 2: Split Gravity */}
      <Concept num={2} title="Split Gravity" desc="Weight shift — AGONA in medium, UT in bold">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="text-5xl tracking-[0.15em] text-slate-900" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
              <span className="font-medium">AGONA</span><span className="font-extrabold">UT</span>
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="text-5xl tracking-[0.15em] text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
              <span className="font-medium">AGONA</span><span className="font-extrabold">UT</span>
            </span>
          </Variant>
        </div>
      </Concept>

      {/* Concept 3: Lowercase Confidence */}
      <Concept num={3} title="Lowercase Confidence" desc="All lowercase, rounded, modern — Linear/Vercel energy">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="text-[52px] font-semibold tracking-wide text-slate-900" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              agonaut
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="text-[52px] font-semibold tracking-wide text-white" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              agonaut
            </span>
          </Variant>
        </div>
      </Concept>

      {/* Concept 4: The Bridge */}
      <Concept num={4} title="The Bridge" desc="AGON|AUT — hairline divider reveals the etymology (agon = competition, aut = self)">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="text-5xl font-bold tracking-[0.2em] text-slate-900" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
              AGON<span className="text-slate-300 font-light mx-0.5">|</span>AUT
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="text-5xl font-bold tracking-[0.2em] text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
              AGON<span className="text-slate-600 font-light mx-0.5">|</span>AUT
            </span>
          </Variant>
        </div>
      </Concept>

      {/* Concept 5: Soft Geometry with colored O */}
      <Concept num={5} title="Soft Geometry" desc="Title case, the 'o' carries a violet accent — becomes the visual anchor">
        <div className="flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="text-[52px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              Ag<span className="text-violet-600">o</span>naut
            </span>
          </Variant>
          <Variant bg="dark">
            <span className="text-[52px] font-bold tracking-tight text-white" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              Ag<span className="text-violet-600">o</span>naut
            </span>
          </Variant>
        </div>
        {/* Variations */}
        <div className="mt-6 flex justify-center gap-8 flex-wrap">
          <Variant bg="white">
            <span className="text-[52px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              Ag<span className="text-cyan-500">o</span>naut
            </span>
          </Variant>
          <Variant bg="white">
            <span className="text-[52px] font-bold tracking-tight text-slate-900" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              <span className="text-violet-600">A</span>gonaut
            </span>
          </Variant>
          <Variant bg="white">
            <span className="text-[52px] font-extrabold tracking-tight text-slate-900" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              ag<span className="text-violet-600">o</span>naut
            </span>
          </Variant>
        </div>
      </Concept>

      <p className="text-center text-xs text-slate-400 pt-8 pb-4">
        Internal review page — will be removed before launch
      </p>
    </div>
  );
}

function Concept({ num, title, desc, children }: { num: number; title: string; desc: string; children: React.ReactNode }) {
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
