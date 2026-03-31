"use client";

import { useRef, useCallback, useState, useEffect } from "react";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: "amber" | "silver" | "blue" | "gold";
  intensity?: "subtle" | "medium" | "strong";
}

const TRAIL_COUNT = 20;
const SPACING = 0.018;

const PALETTES: Record<string, { core: string; edge: string; shadow: string; hoverAlpha: number }> = {
  amber: { core: "180,140,30", edge: "160,160,170", shadow: "212,175,55", hoverAlpha: 0.18 },
  silver: { core: "140,140,155", edge: "180,180,190", shadow: "160,160,175", hoverAlpha: 0.15 },
  blue: { core: "59,130,246", edge: "140,170,220", shadow: "59,130,246", hoverAlpha: 0.14 },
  gold: { core: "180,140,30", edge: "160,160,170", shadow: "212,175,55", hoverAlpha: 0.20 },
};

/**
 * Premium glow card for WHITE backgrounds.
 * Uses colored drop-shadows + a traveling border light.
 * The border is slightly darker/visible so the traveling glow reads clearly.
 */
export function GlowCard({
  children,
  className = "",
  glowColor = "amber",
  intensity = "medium",
}: GlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const spotsRef = useRef<(HTMLDivElement | null)[]>([]);
  const haloRef = useRef<HTMLDivElement>(null);
  const borderMaskRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);
  const animRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const sizeRef = useRef({ w: 400, h: 300 });

  const duration =
    intensity === "subtle" ? 35000 : intensity === "medium" ? 28000 : 20000;
  const p = PALETTES[glowColor] || PALETTES.amber;
  const borderOpacity =
    intensity === "subtle" ? 0.65 : intensity === "medium" ? 0.85 : 1.0;

  useEffect(() => {
    if (!cardRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      sizeRef.current = { w: entry.contentRect.width, h: entry.contentRect.height };
    });
    ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, []);

  function perimeterPos(progress: number, w: number, h: number) {
    const perimeter = 2 * (w + h);
    const dist = progress * perimeter;
    if (dist < w) return { x: (dist / w) * 100, y: 0 };
    if (dist < w + h) return { x: 100, y: ((dist - w) / h) * 100 };
    if (dist < 2 * w + h) return { x: (1 - (dist - w - h) / w) * 100, y: 100 };
    return { x: 0, y: (1 - (dist - 2 * w - h) / h) * 100 };
  }

  useEffect(() => {
    const animate = (time: number) => {
      if (!startRef.current) startRef.current = time;
      const { w, h } = sizeRef.current;
      const shorter = Math.min(w, h);
      const baseSpot = Math.max(160, shorter * 0.8);
      const progress = ((time - startRef.current) % duration) / duration;
      const borderPx = shorter < 200 ? 4 : shorter < 350 ? 3 : 2;
      const opacityBoost = shorter < 200 ? 1.5 : shorter < 350 ? 1.2 : 1.0;

      if (borderMaskRef.current) {
        borderMaskRef.current.style.padding = `${borderPx}px`;
      }

      for (let i = 0; i <= TRAIL_COUNT; i++) {
        const el = spotsRef.current[i];
        if (!el) continue;
        const pos = perimeterPos((progress - i * SPACING + 1) % 1, w, h);
        const t = i / TRAIL_COUNT;
        const size = baseSpot * (1 - t * 0.25);
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.left = `${pos.x}%`;
        el.style.top = `${pos.y}%`;
        if (opacityBoost > 1) el.style.opacity = `${opacityBoost}`;
      }

      if (haloRef.current) {
        const leadPos = perimeterPos(progress, w, h);
        const haloSize = baseSpot * 0.7;
        haloRef.current.style.width = `${haloSize}px`;
        haloRef.current.style.height = `${haloSize}px`;
        haloRef.current.style.left = `${leadPos.x}%`;
        haloRef.current.style.top = `${leadPos.y}%`;
      }

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

  // Build spot elements with gradient colors visible on white
  const spotElements = [];
  for (let i = 0; i <= TRAIL_COUNT; i++) {
    const t = i / TRAIL_COUNT;
    const opacity = borderOpacity * (1 - t * 0.85);
    const color = t < 0.4 ? p.core : p.edge;
    const blur = 2 + t * 6;
    spotElements.push(
      <div
        key={i}
        ref={(el) => { spotsRef.current[i] = el; }}
        className="absolute rounded-full pointer-events-none"
        style={{
          translate: "-50% -50%",
          background: `radial-gradient(circle, rgba(${color},${opacity}) 0%, rgba(${color},${opacity * 0.35}) 40%, transparent 65%)`,
          filter: `blur(${blur}px)`,
          willChange: "left, top, width, height",
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
      style={{
        // Colored drop-shadow around card for visibility on white
        filter: isHovered
          ? `drop-shadow(0 8px 30px rgba(${p.shadow},0.25)) drop-shadow(0 2px 8px rgba(${p.shadow},0.15))`
          : `drop-shadow(0 2px 12px rgba(${p.shadow},0.08))`,
        transition: "filter 0.5s ease",
      }}
    >
      {/* Outer halo — colored glow bleeding outside, with fade-to-white mask at edges */}
      <div
        className="absolute -inset-[16px] rounded-[inherit] pointer-events-none"
        style={{
          zIndex: 0,
          mask: "radial-gradient(ellipse at center, black 50%, transparent 100%)",
          WebkitMask: "radial-gradient(ellipse at center, black 50%, transparent 100%)",
        }}
      >
        <div
          ref={haloRef}
          className="absolute rounded-full pointer-events-none"
          style={{
            translate: "-50% -50%",
            background: `radial-gradient(circle, rgba(${p.shadow},0.12) 0%, rgba(${p.shadow},0.03) 45%, transparent 70%)`,
            filter: "blur(16px)",
            willChange: "left, top, width, height",
          }}
        />
      </div>

      {/* Border glow — traveling light along edge */}
      <div className="absolute inset-0 rounded-[inherit] pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
        <div
          ref={borderMaskRef}
          className="absolute inset-0 rounded-[inherit]"
          style={{
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
            padding: "2px",
          }}
        >
          {spotElements}
        </div>
      </div>

      {/* Mouse spotlight on hover */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none transition-opacity duration-500 overflow-hidden"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(300px circle at ${mousePos.x}% ${mousePos.y}%, rgba(${p.shadow},${p.hoverAlpha}), transparent 60%)`,
          zIndex: 2,
        }}
      />

      {/* Card content — white with subtle border */}
      <div
        className="relative rounded-[inherit] h-full overflow-hidden bg-white border border-slate-200/60"
        style={{ zIndex: 3 }}
      >
        {children}
      </div>
    </div>
  );
}
