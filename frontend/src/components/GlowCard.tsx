"use client";

import { useRef, useCallback, useState, useEffect } from "react";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: "amber" | "silver" | "blue" | "gold";
  intensity?: "subtle" | "medium" | "strong";
  /** Use dark card background (for dark sections) */
  dark?: boolean;
}

/**
 * Premium glow card — a bright light spot orbits the card's rectangular border.
 * Inspired by huly.io. Works on both light and dark backgrounds.
 *
 * On dark backgrounds, the card uses a semi-transparent dark fill with
 * a glassmorphism effect. The glow is more visible against dark.
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
  const animRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  const palette: Record<string, { rgb: string; hoverAlpha: number }> = {
    amber: { rgb: "212,175,55", hoverAlpha: 0.12 },
    silver: { rgb: "192,192,200", hoverAlpha: 0.10 },
    blue: { rgb: "96,165,250", hoverAlpha: 0.10 },
    gold: { rgb: "212,175,55", hoverAlpha: 0.14 },
  };

  const duration =
    intensity === "subtle" ? 8000 : intensity === "medium" ? 6000 : 4500;
  const p = palette[glowColor] || palette.amber;

  // Glow sizing by intensity
  const spotSize =
    intensity === "subtle" ? 120 : intensity === "medium" ? 160 : 200;
  const borderOpacity =
    intensity === "subtle" ? 0.6 : intensity === "medium" ? 0.8 : 1.0;
  const haloOpacity =
    intensity === "subtle" ? 0.15 : intensity === "medium" ? 0.25 : 0.35;

  // Orbit a point around the card's rectangular perimeter
  useEffect(() => {
    const animate = (time: number) => {
      if (!startRef.current) startRef.current = time;
      const t = (((time - startRef.current) % duration) / duration) * 4;
      let x: number, y: number;

      if (t < 1) {
        x = t; y = 0;
      } else if (t < 2) {
        x = 1; y = t - 1;
      } else if (t < 3) {
        x = 1 - (t - 2); y = 1;
      } else {
        x = 0; y = 1 - (t - 3);
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

  const cardBg = dark
    ? "bg-white/[0.04] backdrop-blur-sm border-white/[0.08]"
    : "bg-white border-slate-100";

  return (
    <div
      ref={cardRef}
      className={`relative group ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Outer halo — soft glow that bleeds beyond card edges */}
      <div
        className="absolute -inset-[20px] rounded-[inherit] pointer-events-none"
        style={{ zIndex: 0 }}
      >
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: `${spotSize + 80}px`,
            height: `${spotSize + 80}px`,
            left: `${lightPos.x}%`,
            top: `${lightPos.y}%`,
            translate: "-50% -50%",
            background: `radial-gradient(circle, rgba(${p.rgb},${haloOpacity}) 0%, rgba(${p.rgb},0.05) 40%, transparent 70%)`,
            filter: "blur(30px)",
          }}
        />
      </div>

      {/* Border glow — sharp light on the 2px edge */}
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
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: `${spotSize}px`,
              height: `${spotSize}px`,
              left: `${lightPos.x}%`,
              top: `${lightPos.y}%`,
              translate: "-50% -50%",
              background: `radial-gradient(circle, rgba(${p.rgb},${borderOpacity}) 0%, rgba(${p.rgb},0.25) 30%, transparent 55%)`,
              filter: "blur(3px)",
            }}
          />
        </div>
      </div>

      {/* Inner glow wash — subtle light inside the card near the traveling spot */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none overflow-hidden"
        style={{ zIndex: 2 }}
      >
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: `${spotSize + 40}px`,
            height: `${spotSize + 40}px`,
            left: `${lightPos.x}%`,
            top: `${lightPos.y}%`,
            translate: "-50% -50%",
            background: `radial-gradient(circle, rgba(${p.rgb},0.06) 0%, transparent 50%)`,
            filter: "blur(15px)",
          }}
        />
      </div>

      {/* Mouse spotlight on hover */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none transition-opacity duration-500 overflow-hidden"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(350px circle at ${mousePos.x}% ${mousePos.y}%, rgba(${p.rgb},${p.hoverAlpha}), transparent 60%)`,
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
