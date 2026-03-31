"use client";

import { useRef, useCallback, useState, useEffect } from "react";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: "amber" | "silver" | "blue" | "gold";
  intensity?: "subtle" | "medium" | "strong";
}

/**
 * Premium glow card — a light spot travels along the card's rectangular border path.
 * No spinning disc. The light follows the perimeter like a torch tracing edges.
 * Inspired by huly.io's card edge lighting technique.
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
  const [lightPos, setLightPos] = useState({ x: 0, y: 0 });
  const animRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  const palette: Record<string, { rgb: string; spotAlpha: number }> = {
    amber:  { rgb: "191,155,48",  spotAlpha: 0.12 },
    silver: { rgb: "160,165,175", spotAlpha: 0.14 },
    blue:   { rgb: "59,130,246",  spotAlpha: 0.12 },
    gold:   { rgb: "191,155,48",  spotAlpha: 0.14 },
  };

  const duration = intensity === "subtle" ? 8000 : intensity === "medium" ? 6000 : 4000;
  const p = palette[glowColor] || palette.amber;

  // Animate a point along the card's rectangular perimeter
  useEffect(() => {
    const animate = (time: number) => {
      if (!startRef.current) startRef.current = time;
      const elapsed = time - startRef.current;
      const progress = (elapsed % duration) / duration; // 0..1

      // Perimeter walk: top → right → bottom → left
      // We parameterize as 0..4 (one unit per side)
      const t = progress * 4;
      let x: number, y: number;

      if (t < 1) {
        // Top edge: left to right
        x = t;
        y = 0;
      } else if (t < 2) {
        // Right edge: top to bottom
        x = 1;
        y = t - 1;
      } else if (t < 3) {
        // Bottom edge: right to left
        x = 1 - (t - 2);
        y = 1;
      } else {
        // Left edge: bottom to top
        x = 0;
        y = 1 - (t - 3);
      }

      setLightPos({ x: x * 100, y: y * 100 });
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

  // Glow size/strength by intensity
  const glowSize = intensity === "subtle" ? 140 : intensity === "medium" ? 180 : 220;
  const glowOpacity = intensity === "subtle" ? 0.5 : intensity === "medium" ? 0.7 : 0.9;
  const outerBlur = intensity === "subtle" ? 30 : intensity === "medium" ? 40 : 50;

  return (
    <div
      ref={cardRef}
      className={`relative ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Traveling light — a radial gradient spot that follows the border path */}
      {/* Outer soft halo (bleeds outside the card) */}
      <div
        className="absolute -inset-[24px] rounded-[inherit] pointer-events-none"
        style={{ zIndex: 0 }}
      >
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: `${glowSize + 60}px`,
            height: `${glowSize + 60}px`,
            left: `${lightPos.x}%`,
            top: `${lightPos.y}%`,
            translate: "-50% -50%",
            background: `radial-gradient(circle, rgba(${p.rgb},${glowOpacity * 0.4}) 0%, rgba(${p.rgb},0.08) 40%, transparent 70%)`,
            filter: `blur(${outerBlur}px)`,
          }}
        />
      </div>

      {/* Inner border glow — sharp light on the edge */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none overflow-hidden"
        style={{ zIndex: 1 }}
      >
        {/* Border-only mask: show glow only in the 2px border zone */}
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            padding: "2px",
          }}
        >
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: `${glowSize}px`,
              height: `${glowSize}px`,
              left: `${lightPos.x}%`,
              top: `${lightPos.y}%`,
              translate: "-50% -50%",
              background: `radial-gradient(circle, rgba(${p.rgb},${glowOpacity}) 0%, rgba(${p.rgb},0.3) 30%, transparent 60%)`,
              filter: "blur(4px)",
            }}
          />
        </div>

        {/* Secondary soft glow behind the border (visible through card slightly) */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: `${glowSize + 20}px`,
            height: `${glowSize + 20}px`,
            left: `${lightPos.x}%`,
            top: `${lightPos.y}%`,
            translate: "-50% -50%",
            background: `radial-gradient(circle, rgba(${p.rgb},0.15) 0%, rgba(${p.rgb},0.04) 40%, transparent 65%)`,
            filter: "blur(12px)",
          }}
        />
      </div>

      {/* Mouse spotlight on hover */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none transition-opacity duration-500"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(350px circle at ${mousePos.x}% ${mousePos.y}%, rgba(${p.rgb},${p.spotAlpha}), transparent 60%)`,
          zIndex: 3,
        }}
      />

      {/* Inner white card — clean content area */}
      <div
        className="relative bg-white rounded-[inherit] h-full overflow-hidden border border-slate-100"
        style={{ zIndex: 4 }}
      >
        {children}
      </div>
    </div>
  );
}
