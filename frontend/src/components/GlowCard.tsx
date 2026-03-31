"use client";

import { useRef, useCallback, useState, useEffect } from "react";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: "amber" | "silver" | "blue" | "gold";
  intensity?: "subtle" | "medium" | "strong";
  dark?: boolean;
}

const TRAIL_COUNT = 20;
const SPACING = 0.018;

const PALETTES: Record<string, { core: string; edge: string; hoverAlpha: number }> = {
  amber: { core: "212,175,55", edge: "255,255,255", hoverAlpha: 0.08 },
  silver: { core: "200,200,210", edge: "255,255,255", hoverAlpha: 0.06 },
  blue: { core: "96,165,250", edge: "200,220,255", hoverAlpha: 0.06 },
  gold: { core: "212,175,55", edge: "255,255,255", hoverAlpha: 0.10 },
};

/**
 * Premium glow card — smooth continuous light ribbon orbiting the card border.
 * Uses direct DOM manipulation for 60fps performance. Perimeter-proportional
 * speed so the light moves at constant velocity regardless of card aspect ratio.
 */
export function GlowCard({
  children,
  className = "",
  glowColor = "amber",
  intensity = "medium",
  dark = false,
}: GlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const spotsRef = useRef<(HTMLDivElement | null)[]>([]);
  const haloRef = useRef<HTMLDivElement>(null);
  const washRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);
  const animRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const sizeRef = useRef({ w: 400, h: 300 });

  const duration =
    intensity === "subtle" ? 35000 : intensity === "medium" ? 28000 : 20000;
  const p = PALETTES[glowColor] || PALETTES.amber;
  const borderOpacity =
    intensity === "subtle" ? 0.5 : intensity === "medium" ? 0.7 : 0.85;
  const haloOpacity =
    intensity === "subtle" ? 0.06 : intensity === "medium" ? 0.10 : 0.14;

  // Track card size via ResizeObserver
  useEffect(() => {
    if (!cardRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      sizeRef.current = { w: entry.contentRect.width, h: entry.contentRect.height };
    });
    ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, []);

  /**
   * Convert progress (0..1) to perimeter position, weighted by actual side lengths.
   * This ensures constant visual speed regardless of aspect ratio.
   */
  function perimeterPos(progress: number, w: number, h: number) {
    const perimeter = 2 * (w + h);
    const dist = progress * perimeter;

    if (dist < w) {
      // Top edge: left to right
      return { x: (dist / w) * 100, y: 0 };
    } else if (dist < w + h) {
      // Right edge: top to bottom
      return { x: 100, y: ((dist - w) / h) * 100 };
    } else if (dist < 2 * w + h) {
      // Bottom edge: right to left
      return { x: (1 - (dist - w - h) / w) * 100, y: 100 };
    } else {
      // Left edge: bottom to top
      return { x: 0, y: (1 - (dist - 2 * w - h) / h) * 100 };
    }
  }

  // Precompute trail properties (static — don't change per frame)
  const trailPropsRef = useRef<{ opacity: number; color: string; sizeMul: number; blur: number; bg: string }[]>([]);
  useEffect(() => {
    const props = [];
    for (let i = 0; i <= TRAIL_COUNT; i++) {
      const t = i / TRAIL_COUNT;
      const opacity = borderOpacity * (1 - t * 0.85);
      const color = t < 0.4 ? p.core : p.edge;
      const sizeMul = 1 - t * 0.25;
      const blur = 4 + t * 8;
      const bg = `radial-gradient(circle, rgba(${color},${opacity}) 0%, rgba(${color},${opacity * 0.3}) 40%, transparent 65%)`;
      props.push({ opacity, color, sizeMul, blur, bg });
    }
    trailPropsRef.current = props;
  }, [borderOpacity, p.core, p.edge]);

  // Animation loop — direct DOM updates, no React state
  useEffect(() => {
    const animate = (time: number) => {
      if (!startRef.current) startRef.current = time;
      const { w, h } = sizeRef.current;
      const baseSpot = Math.max(160, Math.min(w, h) * 0.8);
      const progress = ((time - startRef.current) % duration) / duration;

      for (let i = 0; i <= TRAIL_COUNT; i++) {
        const el = spotsRef.current[i];
        if (!el) continue;
        const pos = perimeterPos((progress - i * SPACING + 1) % 1, w, h);
        const tp = trailPropsRef.current[i];
        if (!tp) continue;
        const size = baseSpot * tp.sizeMul;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.left = `${pos.x}%`;
        el.style.top = `${pos.y}%`;
      }

      // Halo follows lead
      if (haloRef.current) {
        const leadPos = perimeterPos(progress, w, h);
        const haloSize = baseSpot * 0.55;
        haloRef.current.style.width = `${haloSize}px`;
        haloRef.current.style.height = `${haloSize}px`;
        haloRef.current.style.left = `${leadPos.x}%`;
        haloRef.current.style.top = `${leadPos.y}%`;
      }

      // Inner wash follows lead
      if (washRef.current) {
        const leadPos = perimeterPos(progress, w, h);
        const washSize = baseSpot * 0.6;
        washRef.current.style.width = `${washSize}px`;
        washRef.current.style.height = `${washSize}px`;
        washRef.current.style.left = `${leadPos.x}%`;
        washRef.current.style.top = `${leadPos.y}%`;
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

  const cardBg = dark
    ? "bg-white/[0.04] backdrop-blur-sm border-white/[0.08]"
    : "bg-white border-slate-100";

  // Build initial trail spot styles (static backgrounds + blur)
  const spotElements = [];
  for (let i = 0; i <= TRAIL_COUNT; i++) {
    const t = i / TRAIL_COUNT;
    const opacity = borderOpacity * (1 - t * 0.85);
    const color = t < 0.4 ? p.core : p.edge;
    const blur = 4 + t * 8;
    spotElements.push(
      <div
        key={i}
        ref={(el) => { spotsRef.current[i] = el; }}
        className="absolute rounded-full pointer-events-none"
        style={{
          translate: "-50% -50%",
          background: `radial-gradient(circle, rgba(${color},${opacity}) 0%, rgba(${color},${opacity * 0.3}) 40%, transparent 65%)`,
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
    >
      {/* Outer halo */}
      <div className="absolute -inset-[12px] rounded-[inherit] pointer-events-none" style={{ zIndex: 0 }}>
        <div
          ref={haloRef}
          className="absolute rounded-full pointer-events-none"
          style={{
            translate: "-50% -50%",
            background: `radial-gradient(circle, rgba(${p.core},${haloOpacity}) 0%, rgba(${p.core},0.02) 50%, transparent 70%)`,
            filter: "blur(20px)",
            willChange: "left, top, width, height",
          }}
        />
      </div>

      {/* Border glow — spots masked to 2px border */}
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
          {spotElements}
        </div>
      </div>

      {/* Inner wash */}
      <div className="absolute inset-0 rounded-[inherit] pointer-events-none overflow-hidden" style={{ zIndex: 2 }}>
        <div
          ref={washRef}
          className="absolute rounded-full pointer-events-none"
          style={{
            translate: "-50% -50%",
            background: `radial-gradient(circle, rgba(${p.core},0.03) 0%, transparent 50%)`,
            filter: "blur(15px)",
            willChange: "left, top, width, height",
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
