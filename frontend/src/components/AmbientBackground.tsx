"use client";

/**
 * Ambient animated background — ultra-subtle gold + silver smoke/liquid blobs.
 * Low opacity, slow drifting, creates depth and premium feel on white backgrounds.
 * Place behind page content with position: fixed or absolute.
 */
export function AmbientBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {/* Gold smoke — top left, drifting right and down */}
      <div
        className="absolute rounded-full"
        style={{
          width: "800px",
          height: "600px",
          top: "-5%",
          left: "-5%",
          background: "radial-gradient(ellipse at center, rgba(212,175,55,0.07) 0%, rgba(212,175,55,0.03) 40%, transparent 70%)",
          filter: "blur(80px)",
          animation: "ambient-drift-1 30s ease-in-out infinite",
        }}
      />

      {/* Silver mist — top right, drifting left */}
      <div
        className="absolute rounded-full"
        style={{
          width: "700px",
          height: "500px",
          top: "5%",
          right: "-8%",
          background: "radial-gradient(ellipse at center, rgba(170,170,185,0.06) 0%, rgba(170,170,185,0.02) 45%, transparent 70%)",
          filter: "blur(90px)",
          animation: "ambient-drift-2 35s ease-in-out infinite",
        }}
      />

      {/* Gold wash — center, slowly rising */}
      <div
        className="absolute rounded-full"
        style={{
          width: "600px",
          height: "600px",
          top: "30%",
          left: "35%",
          background: "radial-gradient(circle at center, rgba(197,165,78,0.05) 0%, rgba(197,165,78,0.02) 40%, transparent 65%)",
          filter: "blur(70px)",
          animation: "ambient-drift-3 25s ease-in-out infinite",
        }}
      />

      {/* Silver ribbon — mid-left, horizontal drift */}
      <div
        className="absolute"
        style={{
          width: "900px",
          height: "200px",
          top: "55%",
          left: "-10%",
          background: "linear-gradient(90deg, transparent 0%, rgba(180,180,195,0.04) 30%, rgba(212,175,55,0.03) 60%, transparent 100%)",
          filter: "blur(60px)",
          animation: "ambient-drift-4 40s ease-in-out infinite",
          borderRadius: "50%",
        }}
      />

      {/* Gold accent — bottom right, slow pulse */}
      <div
        className="absolute rounded-full"
        style={{
          width: "500px",
          height: "400px",
          bottom: "0%",
          right: "10%",
          background: "radial-gradient(ellipse at center, rgba(212,175,55,0.05) 0%, rgba(212,175,55,0.01) 50%, transparent 70%)",
          filter: "blur(80px)",
          animation: "ambient-drift-5 28s ease-in-out infinite",
        }}
      />

      {/* Silver wash — bottom left */}
      <div
        className="absolute rounded-full"
        style={{
          width: "600px",
          height: "350px",
          bottom: "10%",
          left: "5%",
          background: "radial-gradient(ellipse at center, rgba(175,175,190,0.04) 0%, transparent 65%)",
          filter: "blur(85px)",
          animation: "ambient-drift-2 32s ease-in-out infinite reverse",
        }}
      />
    </div>
  );
}
