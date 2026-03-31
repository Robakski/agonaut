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
 * Premium glow card — a smooth continuous light ribbon orbits the card border.
 * 20 tightly-packed, large overlapping spots create a seamless gradient trail.
 * Gold center → white edges. Slow, elegant. Inspired by huly.io.
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
  const animRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  // 20 trail positions + lead = 21 total points
  const TRAIL_COUNT = 20;
  const SPACING = 0.018; // 1.8% apart — very tight
  const [positions, setPositions] = useState<{ x: number; y: number }[]>(
    Array(TRAIL_COUNT + 1).fill({ x: 0, y: 0 })
  );

  const palette: Record<string, { core: string; edge: string; hoverAlpha: number }> = {
    amber: { core: "212,175,55", edge: "255,255,255", hoverAlpha: 0.08 },
    silver: { core: "200,200,210", edge: "255,255,255", hoverAlpha: 0.06 },
    blue: { core: "96,165,250", edge: "200,220,255", hoverAlpha: 0.06 },
    gold: { core: "212,175,55", edge: "255,255,255", hoverAlpha: 0.10 },
  };

  const duration =
    intensity === "subtle" ? 18000 : intensity === "medium" ? 14000 : 10000;
  const p = palette[glowColor] || palette.amber;

  // Card dimensions for responsive sizing
  const [cardSize, setCardSize] = useState({ w: 400, h: 300 });
  useEffect(() => {
    if (!cardRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setCardSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, []);

  // Big spots — 80% of shorter dim, min 160px
  const baseSpot = Math.max(160, Math.min(cardSize.w, cardSize.h) * 0.8);

  const borderOpacity =
    intensity === "subtle" ? 0.5 : intensity === "medium" ? 0.7 : 0.85;
  const haloOpacity =
    intensity === "subtle" ? 0.06 : intensity === "medium" ? 0.10 : 0.14;

  function perimeterPos(progress: number) {
    const t = progress * 4;
    if (t < 1) return { x: t * 100, y: 0 };
    if (t < 2) return { x: 100, y: (t - 1) * 100 };
    if (t < 3) return { x: (1 - (t - 2)) * 100, y: 100 };
    return { x: 0, y: (1 - (t - 3)) * 100 };
  }

  useEffect(() => {
    const animate = (time: number) => {
      if (!startRef.current) startRef.current = time;
      const progress = ((time - startRef.current) % duration) / duration;

      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= TRAIL_COUNT; i++) {
        pts.push(perimeterPos((progress - i * SPACING + 1) % 1));
      }
      setPositions(pts);
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

  // Compute opacity and color for each trail position
  // 0 = lead (gold, full opacity) → TRAIL_COUNT = tail (white, nearly transparent)
  function trailProps(i: number) {
    const t = i / TRAIL_COUNT; // 0..1
    // Opacity: smooth falloff
    const opacity = borderOpacity * (1 - t * 0.85);
    // Color: gold for first 40%, blend to white for rest
    const color = t < 0.4 ? p.core : p.edge;
    // Size: all large for overlap, slight shrink toward tail
    const size = baseSpot * (1 - t * 0.25);
    // Blur: slightly more toward tail
    const blur = 4 + t * 8;
    return { opacity, color, size, blur };
  }

  return (
    <div
      ref={cardRef}
      className={`relative group ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Outer halo — subtle bleed, lead only */}
      <div
        className="absolute -inset-[12px] rounded-[inherit] pointer-events-none"
        style={{ zIndex: 0 }}
      >
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: `${baseSpot * 0.55}px`,
            height: `${baseSpot * 0.55}px`,
            left: `${positions[0]?.x ?? 0}%`,
            top: `${positions[0]?.y ?? 0}%`,
            translate: "-50% -50%",
            background: `radial-gradient(circle, rgba(${p.core},${haloOpacity}) 0%, rgba(${p.core},0.02) 50%, transparent 70%)`,
            filter: "blur(20px)",
          }}
        />
      </div>

      {/* Border glow — 21 overlapping spots masked to 2px border */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none overflow-hidden"
        style={{ zIndex: 1 }}
      >
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            padding: "2px",
          }}
        >
          {positions.map((pos, i) => {
            const tp = trailProps(i);
            return (
              <div
                key={i}
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: `${tp.size}px`,
                  height: `${tp.size}px`,
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  translate: "-50% -50%",
                  background: `radial-gradient(circle, rgba(${tp.color},${tp.opacity}) 0%, rgba(${tp.color},${tp.opacity * 0.3}) 40%, transparent 65%)`,
                  filter: `blur(${tp.blur}px)`,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Inner wash — very subtle glow inside near lead */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none overflow-hidden"
        style={{ zIndex: 2 }}
      >
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: `${baseSpot * 0.6}px`,
            height: `${baseSpot * 0.6}px`,
            left: `${positions[0]?.x ?? 0}%`,
            top: `${positions[0]?.y ?? 0}%`,
            translate: "-50% -50%",
            background: `radial-gradient(circle, rgba(${p.core},0.03) 0%, transparent 50%)`,
            filter: "blur(15px)",
          }}
        />
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
