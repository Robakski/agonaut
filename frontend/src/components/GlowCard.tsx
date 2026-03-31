"use client";

import { useRef, useCallback, useState } from "react";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: "amber" | "silver" | "blue" | "gold";
  intensity?: "subtle" | "medium" | "strong";
}

/**
 * Premium glow card — single smooth gradient from gold → transparent.
 * No sharp borders, no double lines. Just one soft glow that fades
 * smoothly into the white background and can bleed across cards.
 */
export function GlowCard({
  children,
  className = "",
  glowColor = "amber",
  intensity = "medium",
}: GlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);

  // Single color per theme — the gradient handles the fade
  const palette: Record<string, { rgb: string; spotAlpha: number }> = {
    amber:  { rgb: "191,155,48",  spotAlpha: 0.10 },
    silver: { rgb: "160,165,175", spotAlpha: 0.12 },
    blue:   { rgb: "59,130,246",  spotAlpha: 0.10 },
    gold:   { rgb: "191,155,48",  spotAlpha: 0.12 },
  };

  const speed = intensity === "subtle" ? "20s" : intensity === "medium" ? "14s" : "10s";
  const p = palette[glowColor] || palette.amber;

  // Single arc: bright spot → smooth gradient → fully transparent
  // Only ~12% of the circle is lit, rest is clear
  const stops = `rgba(${p.rgb},0.7) 0%, rgba(${p.rgb},0.35) 4%, rgba(${p.rgb},0.1) 8%, transparent 14%, transparent 100%`;

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }, []);

  return (
    <div
      ref={cardRef}
      className={`relative ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* SINGLE glow layer — clipped to border zone around the card.
          Inner white card covers center, so glow only shows in the 20px edge zone. */}
      <div className="absolute -inset-[20px] overflow-hidden rounded-[inherit] pointer-events-none" style={{ zIndex: 0 }}>
        <div
          className="absolute rounded-full aspect-square"
          style={{
            width: "max(120%, 900px)",
            height: "max(120%, 900px)",
            top: "50%",
            left: "50%",
            translate: "-50% -50%",
            background: `conic-gradient(from 0deg at 50% 50%, ${stops})`,
            animation: `spin ${speed} linear infinite`,
            filter: "blur(20px)",
          }}
        />
      </div>

      {/* Mouse spotlight on hover */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none transition-opacity duration-500"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(400px circle at ${mousePos.x}% ${mousePos.y}%, rgba(${p.rgb},${p.spotAlpha}), transparent 60%)`,
          zIndex: 1,
        }}
      />

      {/* Inner white card — clean content area */}
      <div
        className="relative bg-white rounded-[inherit] h-full overflow-hidden border border-slate-100"
        style={{ zIndex: 2 }}
      >
        {children}
      </div>
    </div>
  );
}
