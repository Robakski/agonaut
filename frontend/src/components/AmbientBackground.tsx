"use client";

/**
 * Subtle ambient background — soft drifting gold + silver blobs.
 * Ultra-low opacity, heavily blurred. Clean and bright.
 */
export function AmbientBackground() {
  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, overflow: "hidden" }}
    >
      <div
        className="absolute rounded-full"
        style={{
          width: "min(600px, 80vw)",
          height: "min(500px, 60vh)",
          top: "5%",
          left: "10%",
          background: "radial-gradient(ellipse at center, rgba(212,175,55,0.06) 0%, rgba(212,175,55,0.02) 40%, transparent 70%)",
          filter: "blur(80px)",
          animation: "ambient-drift-1 30s ease-in-out infinite",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: "min(550px, 70vw)",
          height: "min(400px, 50vh)",
          top: "8%",
          right: "10%",
          background: "radial-gradient(ellipse at center, rgba(170,170,185,0.05) 0%, rgba(170,170,185,0.015) 45%, transparent 70%)",
          filter: "blur(90px)",
          animation: "ambient-drift-2 35s ease-in-out infinite",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: "min(500px, 70vw)",
          height: "min(500px, 50vh)",
          top: "30%",
          left: "20%",
          background: "radial-gradient(circle at center, rgba(197,165,78,0.04) 0%, rgba(197,165,78,0.01) 40%, transparent 65%)",
          filter: "blur(70px)",
          animation: "ambient-drift-3 25s ease-in-out infinite",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: "min(450px, 65vw)",
          height: "min(350px, 40vh)",
          bottom: "8%",
          right: "12%",
          background: "radial-gradient(ellipse at center, rgba(212,175,55,0.04) 0%, rgba(212,175,55,0.01) 50%, transparent 70%)",
          filter: "blur(80px)",
          animation: "ambient-drift-2 28s ease-in-out infinite reverse",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: "min(500px, 70vw)",
          height: "min(300px, 35vh)",
          bottom: "12%",
          left: "10%",
          background: "radial-gradient(ellipse at center, rgba(175,175,190,0.035) 0%, transparent 65%)",
          filter: "blur(85px)",
          animation: "ambient-drift-3 32s ease-in-out infinite reverse",
        }}
      />
    </div>
  );
}
