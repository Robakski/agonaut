"use client";

import { useRef, useCallback, useState, useEffect } from "react";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: "amber" | "silver" | "blue" | "gold";
  intensity?: "subtle" | "medium" | "strong";
  dark?: boolean;
}

/**
 * Premium glow card — an elongated light trail orbits the card border.
 * Gold center → white edges → smooth fade to transparent.
 * Slow, elegant movement. Inspired by huly.io.
 */
export function GlowCard({
  children,
  className = "",
  glowColor = "amber",
  intensity = "medium",
  dark = false,
}: GlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);
  const [lightPos, setLightPos] = useState({ x: 0, y: 0 });
  const [trailPos1, setTrailPos1] = useState({ x: 0, y: 0 });
  const [trailPos2, setTrailPos2] = useState({ x: 0, y: 0 });
  const animRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  // Core gold color for center, white for edges
  const palette: Record<string, { core: string; edge: string; hoverAlpha: number }> = {
    amber: { core: "212,175,55", edge: "255,255,255", hoverAlpha: 0.08 },
    silver: { core: "200,200,210", edge: "255,255,255", hoverAlpha: 0.06 },
    blue: { core: "96,165,250", edge: "200,220,255", hoverAlpha: 0.06 },
    gold: { core: "212,175,55", edge: "255,255,255", hoverAlpha: 0.10 },
  };

  // SLOW orbits — 14s medium, 18s subtle, 10s strong
  const duration =
    intensity === "subtle" ? 18000 : intensity === "medium" ? 14000 : 10000;
  const p = palette[glowColor] || palette.amber;

  // Intensity tuning
  const borderOpacity =
    intensity === "subtle" ? 0.5 : intensity === "medium" ? 0.7 : 0.85;
  const haloOpacity =
    intensity === "subtle" ? 0.06 : intensity === "medium" ? 0.10 : 0.14;

  // Convert progress (0..1) to perimeter position
  function perimeterPos(progress: number) {
    const t = progress * 4;
    if (t < 1) return { x: t * 100, y: 0 };
    if (t < 2) return { x: 100, y: (t - 1) * 100 };
    if (t < 3) return { x: (1 - (t - 2)) * 100, y: 100 };
    return { x: 0, y: (1 - (t - 3)) * 100 };
  }

  // Animate lead + 5 trailing positions for smooth continuous glow
  const [trailPos3, setTrailPos3] = useState({ x: 0, y: 0 });
  const [trailPos4, setTrailPos4] = useState({ x: 0, y: 0 });
  const [trailPos5, setTrailPos5] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const animate = (time: number) => {
      if (!startRef.current) startRef.current = time;
      const elapsed = time - startRef.current;
      const progress = (elapsed % duration) / duration;

      // Lead + 5 trails spaced 5% apart = ~30% of perimeter covered
      setLightPos(perimeterPos(progress));
      setTrailPos1(perimeterPos((progress - 0.05 + 1) % 1));
      setTrailPos2(perimeterPos((progress - 0.10 + 1) % 1));
      setTrailPos3(perimeterPos((progress - 0.15 + 1) % 1));
      setTrailPos4(perimeterPos((progress - 0.20 + 1) % 1));
      setTrailPos5(perimeterPos((progress - 0.25 + 1) % 1));

      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [duration]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }, []);

  const cardBg = dark
    ? "bg-white/[0.04] backdrop-blur-sm border-white/[0.08]"
    : "bg-white border-slate-100";

  // Render a single glow spot (used for lead + trails)
  function renderBorderSpot(
    pos: { x: number; y: number },
    size: number,
    opacity: number,
    color: string,
    blur: number,
    key: string
  ) {
    return (
      <div
        key={key}
        className="absolute rounded-full pointer-events-none"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          translate: "-50% -50%",
          background: `radial-gradient(circle, rgba(${color},${opacity}) 0%, rgba(${color},${opacity * 0.3}) 40%, transparent 65%)`,
          filter: `blur(${blur}px)`,
        }}
      />
    );
  }

  return (
    <div
      ref={cardRef}
      className={`relative group ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Outer halo — subtle bleed beyond card */}
      <div className="absolute -inset-[12px] rounded-[inherit] pointer-events-none" style={{ zIndex: 0 }}>
        {renderBorderSpot(lightPos, 120, haloOpacity, p.core, 25, "halo-lead")}
        {renderBorderSpot(trailPos2, 100, haloOpacity * 0.4, p.edge, 20, "halo-mid")}
      </div>

      {/* Border glow — smooth continuous trail along 2px edge */}
      <div className="absolute inset-0 rounded-[inherit] pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            padding: "2px",
          }}
        >
          {/* Lead — gold, brightest, largest */}
          {renderBorderSpot(lightPos, 200, borderOpacity, p.core, 4, "b0")}
          {/* Trail 1 — gold, slightly dimmer */}
          {renderBorderSpot(trailPos1, 190, borderOpacity * 0.75, p.core, 5, "b1")}
          {/* Trail 2 — gold→white transition */}
          {renderBorderSpot(trailPos2, 180, borderOpacity * 0.55, p.core, 6, "b2c")}
          {renderBorderSpot(trailPos2, 170, borderOpacity * 0.3, p.edge, 5, "b2w")}
          {/* Trail 3 — more white */}
          {renderBorderSpot(trailPos3, 160, borderOpacity * 0.35, p.edge, 7, "b3")}
          {renderBorderSpot(trailPos3, 150, borderOpacity * 0.2, p.core, 6, "b3c")}
          {/* Trail 4 — mostly white, fading */}
          {renderBorderSpot(trailPos4, 140, borderOpacity * 0.2, p.edge, 8, "b4")}
          {/* Trail 5 — faint white tail */}
          {renderBorderSpot(trailPos5, 120, borderOpacity * 0.1, p.edge, 10, "b5")}
        </div>
      </div>

      {/* Inner wash — very subtle */}
      <div className="absolute inset-0 rounded-[inherit] pointer-events-none overflow-hidden" style={{ zIndex: 2 }}>
        {renderBorderSpot(lightPos, 160, 0.03, p.core, 20, "wash")}
      </div>

      {/* Mouse spotlight on hover */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none transition-opacity duration-500 overflow-hidden"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(300px circle at ${mousePos.x}% ${mousePos.y}%, rgba(${p.core},${p.hoverAlpha}), transparent 60%)`,
          zIndex: 3,
        }}
      />

      {/* Card content */}
      <div
        className={`relative rounded-[inherit] h-full overflow-hidden border ${cardBg}`}
        style={{ zIndex: 4 }}
      >
        {children}
      </div>
    </div>
  );
}
