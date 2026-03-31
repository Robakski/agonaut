"use client";

import { useRef, useCallback, useState } from "react";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string; // e.g. "amber" | "silver" | "blue"
  intensity?: "subtle" | "medium" | "strong";
  as?: "div" | "a" | "li";
}

/**
 * Card with mouse-tracking border glow effect.
 * On hover, a radial gradient follows the cursor along the card border.
 * At rest, a subtle shimmer animation plays along the edges.
 */
export function GlowCard({
  children,
  className = "",
  glowColor = "amber",
  intensity = "medium",
  as: Tag = "div",
}: GlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const colorMap: Record<string, { glow: string; idle: string }> = {
    amber: {
      glow: "rgba(217, 119, 6, 0.4)",
      idle: "rgba(217, 119, 6, 0.08)",
    },
    silver: {
      glow: "rgba(148, 163, 184, 0.5)",
      idle: "rgba(148, 163, 184, 0.1)",
    },
    blue: {
      glow: "rgba(59, 130, 246, 0.4)",
      idle: "rgba(59, 130, 246, 0.08)",
    },
    gold: {
      glow: "rgba(245, 158, 11, 0.5)",
      idle: "rgba(245, 158, 11, 0.1)",
    },
  };

  const intensityMap = {
    subtle: { size: 120, borderOpacity: 0.15 },
    medium: { size: 180, borderOpacity: 0.3 },
    strong: { size: 250, borderOpacity: 0.5 },
  };

  const colors = colorMap[glowColor] || colorMap.amber;
  const config = intensityMap[intensity];

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  return (
    <Tag
      ref={cardRef as any}
      className={`relative group ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ isolation: "isolate" }}
    >
      {/* Glow border overlay */}
      <div
        className="absolute -inset-px rounded-[inherit] pointer-events-none transition-opacity duration-500"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(${config.size}px circle at ${mousePos.x}px ${mousePos.y}px, ${colors.glow}, transparent 60%)`,
        }}
      />
      {/* Idle shimmer border */}
      <div
        className="absolute -inset-px rounded-[inherit] pointer-events-none transition-opacity duration-500 animate-shimmer-border"
        style={{
          opacity: isHovered ? 0 : 1,
          background: `linear-gradient(90deg, transparent, ${colors.idle}, transparent)`,
          backgroundSize: "200% 100%",
        }}
      />
      {/* Inner content with solid background to mask the glow behind */}
      <div className="relative bg-white rounded-[inherit] h-full">
        {children}
      </div>
    </Tag>
  );
}
