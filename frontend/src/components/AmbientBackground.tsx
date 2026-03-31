"use client";

/**
 * Flowing liquid gold & silver background.
 * Large morphing blobs with metallic gradients that slowly flow and reshape.
 * Creates a liquid/smoke effect reminiscent of molten metal.
 * Pure CSS animations — no JS, no canvas, lightweight.
 */
export function AmbientBackground() {
  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, overflow: "hidden" }}
    >
      {/* ═══ Gold flow 1 — massive top-left, drifting right ═══ */}
      <div
        className="absolute"
        style={{
          width: "120vw",
          height: "45vh",
          top: "-5%",
          left: "-15%",
          background: "linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(191,155,48,0.12) 30%, rgba(197,165,78,0.06) 60%, rgba(212,175,55,0.03) 100%)",
          filter: "blur(60px)",
          borderRadius: "40% 60% 55% 45% / 50% 40% 60% 50%",
          animation: "liquid-flow-1 20s ease-in-out infinite",
        }}
      />

      {/* ═══ Gold shine — bright edge highlight following flow 1 ═══ */}
      <div
        className="absolute"
        style={{
          width: "80vw",
          height: "8vh",
          top: "12%",
          left: "5%",
          background: "linear-gradient(90deg, transparent 0%, rgba(240,208,96,0.15) 20%, rgba(255,224,128,0.08) 50%, rgba(240,208,96,0.12) 80%, transparent 100%)",
          filter: "blur(12px)",
          borderRadius: "50%",
          animation: "liquid-shine-1 20s ease-in-out infinite",
        }}
      />

      {/* ═══ Silver flow 1 — wide ribbon across upper section ═══ */}
      <div
        className="absolute"
        style={{
          width: "130vw",
          height: "35vh",
          top: "15%",
          left: "-20%",
          background: "linear-gradient(160deg, rgba(180,180,195,0.04) 0%, rgba(200,200,215,0.09) 35%, rgba(175,175,190,0.06) 65%, rgba(190,190,205,0.03) 100%)",
          filter: "blur(65px)",
          borderRadius: "55% 45% 50% 50% / 45% 55% 45% 55%",
          animation: "liquid-flow-2 25s ease-in-out infinite",
        }}
      />

      {/* ═══ Gold flow 2 — thick flowing band, mid-upper ═══ */}
      <div
        className="absolute"
        style={{
          width: "110vw",
          height: "50vh",
          top: "25%",
          left: "-10%",
          background: "linear-gradient(120deg, rgba(212,175,55,0.03) 0%, rgba(191,155,48,0.10) 25%, rgba(212,175,55,0.14) 45%, rgba(197,165,78,0.08) 65%, rgba(212,175,55,0.03) 100%)",
          filter: "blur(55px)",
          borderRadius: "45% 55% 60% 40% / 55% 45% 55% 45%",
          animation: "liquid-flow-3 22s ease-in-out infinite",
        }}
      />

      {/* ═══ Gold edge shine — mid section ═══ */}
      <div
        className="absolute"
        style={{
          width: "70vw",
          height: "6vh",
          top: "42%",
          left: "15%",
          background: "linear-gradient(90deg, transparent, rgba(240,208,96,0.12) 30%, rgba(255,230,140,0.06) 50%, rgba(240,208,96,0.10) 70%, transparent)",
          filter: "blur(10px)",
          borderRadius: "50%",
          animation: "liquid-shine-2 22s ease-in-out infinite",
        }}
      />

      {/* ═══ Silver flow 2 — large mid-section ═══ */}
      <div
        className="absolute"
        style={{
          width: "120vw",
          height: "40vh",
          top: "40%",
          left: "-15%",
          background: "linear-gradient(145deg, rgba(175,175,190,0.03) 0%, rgba(200,200,215,0.08) 30%, rgba(190,190,205,0.11) 50%, rgba(180,180,195,0.06) 75%, rgba(175,175,190,0.02) 100%)",
          filter: "blur(60px)",
          borderRadius: "50% 50% 45% 55% / 40% 60% 40% 60%",
          animation: "liquid-flow-4 28s ease-in-out infinite",
        }}
      />

      {/* ═══ Silver shine — mid ═══ */}
      <div
        className="absolute"
        style={{
          width: "65vw",
          height: "5vh",
          top: "55%",
          left: "20%",
          background: "linear-gradient(90deg, transparent, rgba(220,220,235,0.10) 25%, rgba(240,240,248,0.06) 50%, rgba(220,220,235,0.08) 75%, transparent)",
          filter: "blur(8px)",
          borderRadius: "50%",
          animation: "liquid-shine-3 28s ease-in-out infinite",
        }}
      />

      {/* ═══ Gold flow 3 — lower section, flowing opposite ═══ */}
      <div
        className="absolute"
        style={{
          width: "115vw",
          height: "45vh",
          top: "55%",
          left: "-8%",
          background: "linear-gradient(150deg, rgba(212,175,55,0.04) 0%, rgba(197,165,78,0.10) 30%, rgba(191,155,48,0.13) 55%, rgba(212,175,55,0.06) 80%, rgba(197,165,78,0.02) 100%)",
          filter: "blur(55px)",
          borderRadius: "60% 40% 45% 55% / 50% 50% 50% 50%",
          animation: "liquid-flow-5 24s ease-in-out infinite",
        }}
      />

      {/* ═══ Gold shine — lower ═══ */}
      <div
        className="absolute"
        style={{
          width: "75vw",
          height: "7vh",
          top: "72%",
          left: "10%",
          background: "linear-gradient(90deg, transparent, rgba(240,208,96,0.10) 20%, rgba(255,224,128,0.06) 45%, rgba(240,208,96,0.12) 70%, transparent)",
          filter: "blur(10px)",
          borderRadius: "50%",
          animation: "liquid-shine-4 24s ease-in-out infinite",
        }}
      />

      {/* ═══ Silver flow 3 — bottom section ═══ */}
      <div
        className="absolute"
        style={{
          width: "125vw",
          height: "38vh",
          top: "70%",
          left: "-18%",
          background: "linear-gradient(130deg, rgba(190,190,205,0.03) 0%, rgba(200,200,215,0.08) 25%, rgba(180,180,195,0.10) 50%, rgba(195,195,210,0.05) 75%, rgba(185,185,200,0.02) 100%)",
          filter: "blur(60px)",
          borderRadius: "45% 55% 55% 45% / 55% 45% 50% 50%",
          animation: "liquid-flow-6 26s ease-in-out infinite",
        }}
      />

      {/* ═══ Gold flow 4 — bottom ═══ */}
      <div
        className="absolute"
        style={{
          width: "110vw",
          height: "40vh",
          top: "82%",
          left: "-5%",
          background: "linear-gradient(140deg, rgba(212,175,55,0.03) 0%, rgba(191,155,48,0.09) 35%, rgba(212,175,55,0.12) 60%, rgba(197,165,78,0.05) 100%)",
          filter: "blur(55px)",
          borderRadius: "50% 50% 40% 60% / 45% 55% 55% 45%",
          animation: "liquid-flow-1 30s ease-in-out infinite reverse",
        }}
      />
    </div>
  );
}
