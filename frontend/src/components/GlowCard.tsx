"use client";

import { useRef, useCallback, useState } from "react";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: "amber" | "silver" | "blue" | "gold";
  intensity?: "subtle" | "medium" | "strong";
}

/**
 * Premium glow card with:
 * 1. Rotating conic-gradient border (always visible, slow rotation)
 * 2. Mouse-tracking spotlight on hover (brighter glow follows cursor)
 * 3. Ambient outer glow (colored shadow that breathes)
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

  const colors: Record<string, { from: string; via: string; to: string; shadow: string; spotGlow: string }> = {
    amber: {
      from: "rgba(245, 158, 11, 0.6)",
      via: "rgba(217, 119, 6, 0.15)",
      to: "rgba(180, 83, 9, 0.6)",
      shadow: "0 0 30px rgba(245, 158, 11, 0.08), 0 0 60px rgba(245, 158, 11, 0.04)",
      spotGlow: "rgba(245, 158, 11, 0.25)",
    },
    silver: {
      from: "rgba(203, 213, 225, 0.7)",
      via: "rgba(148, 163, 184, 0.15)",
      to: "rgba(100, 116, 139, 0.7)",
      shadow: "0 0 30px rgba(148, 163, 184, 0.08), 0 0 60px rgba(148, 163, 184, 0.04)",
      spotGlow: "rgba(148, 163, 184, 0.3)",
    },
    blue: {
      from: "rgba(59, 130, 246, 0.6)",
      via: "rgba(37, 99, 235, 0.15)",
      to: "rgba(29, 78, 216, 0.6)",
      shadow: "0 0 30px rgba(59, 130, 246, 0.08), 0 0 60px rgba(59, 130, 246, 0.04)",
      spotGlow: "rgba(59, 130, 246, 0.25)",
    },
    gold: {
      from: "rgba(234, 179, 8, 0.7)",
      via: "rgba(202, 138, 4, 0.15)",
      to: "rgba(161, 98, 7, 0.7)",
      shadow: "0 0 30px rgba(234, 179, 8, 0.08), 0 0 60px rgba(234, 179, 8, 0.04)",
      spotGlow: "rgba(234, 179, 8, 0.3)",
    },
  };

  const borderWidth = intensity === "subtle" ? 1 : intensity === "medium" ? 1.5 : 2;
  const c = colors[glowColor] || colors.amber;

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
      style={{
        boxShadow: isHovered
          ? c.shadow.replace(/0\.08/g, "0.15").replace(/0\.04/g, "0.08")
          : c.shadow,
        transition: "box-shadow 0.5s ease",
      }}
    >
      {/* Rotating conic-gradient border — always visible */}
      <div
        className="absolute -inset-px rounded-[inherit] animate-[spin_8s_linear_infinite] pointer-events-none"
        style={{
          background: `conic-gradient(from 0deg, ${c.from}, transparent 25%, ${c.via}, transparent 50%, ${c.to}, transparent 75%, ${c.via}, ${c.from})`,
          padding: `${borderWidth}px`,
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "xor" as any,
          WebkitMaskComposite: "xor" as any,
        }}
      />

      {/* Mouse spotlight overlay on hover */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(300px circle at ${mousePos.x}% ${mousePos.y}%, ${c.spotGlow}, transparent 60%)`,
        }}
      />

      {/* Content */}
      <div className="relative bg-white rounded-[inherit] h-full overflow-hidden">
        {children}
      </div>
    </div>
  );
}
