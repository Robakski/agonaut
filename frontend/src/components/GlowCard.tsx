"use client";

import { useRef, useCallback, useState } from "react";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: "amber" | "silver" | "blue" | "gold";
  intensity?: "subtle" | "medium" | "strong";
}

/**
 * Premium glow card:
 * 1. A large spinning conic-gradient disc sits behind the card
 * 2. The card clips it so only the border glow is visible
 * 3. Mouse hover adds a spotlight overlay
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

  const palette: Record<string, { stops: string; spot: string; shadow: string; shadowHover: string }> = {
    amber: {
      stops: "rgba(245,158,11,0.8), transparent 40%, rgba(217,119,6,0.6), transparent 60%, rgba(245,158,11,0.8)",
      spot: "rgba(245,158,11,0.15)",
      shadow: "0 0 40px -10px rgba(245,158,11,0.1)",
      shadowHover: "0 0 60px -10px rgba(245,158,11,0.2)",
    },
    silver: {
      stops: "rgba(203,213,225,0.9), transparent 40%, rgba(148,163,184,0.7), transparent 60%, rgba(203,213,225,0.9)",
      spot: "rgba(148,163,184,0.15)",
      shadow: "0 0 40px -10px rgba(148,163,184,0.1)",
      shadowHover: "0 0 60px -10px rgba(148,163,184,0.2)",
    },
    blue: {
      stops: "rgba(59,130,246,0.8), transparent 40%, rgba(37,99,235,0.6), transparent 60%, rgba(59,130,246,0.8)",
      spot: "rgba(59,130,246,0.12)",
      shadow: "0 0 40px -10px rgba(59,130,246,0.1)",
      shadowHover: "0 0 60px -10px rgba(59,130,246,0.2)",
    },
    gold: {
      stops: "rgba(234,179,8,0.9), transparent 40%, rgba(202,138,4,0.7), transparent 60%, rgba(234,179,8,0.9)",
      spot: "rgba(234,179,8,0.15)",
      shadow: "0 0 40px -10px rgba(234,179,8,0.12)",
      shadowHover: "0 0 60px -10px rgba(234,179,8,0.25)",
    },
  };

  const borderPx = intensity === "subtle" ? 1 : intensity === "medium" ? 1.5 : 2;
  const speed = intensity === "subtle" ? "12s" : intensity === "medium" ? "8s" : "5s";
  const p = palette[glowColor] || palette.amber;

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
        padding: `${borderPx}px`,
        boxShadow: isHovered ? p.shadowHover : p.shadow,
        transition: "box-shadow 0.5s ease",
      }}
    >
      {/* Spinning conic-gradient disc — clipped to border by the inner white card */}
      <div
        className="absolute inset-0 rounded-[inherit] overflow-hidden"
      >
        <div
          className="absolute"
          style={{
            /* Make it a large square centered on the card, so it covers corners when spinning */
            width: "200%",
            height: "200%",
            top: "-50%",
            left: "-50%",
            background: `conic-gradient(from 0deg at 50% 50%, ${p.stops})`,
            animation: `spin ${speed} linear infinite`,
          }}
        />
      </div>

      {/* Mouse spotlight on hover */}
      <div
        className="absolute inset-0 rounded-[inherit] pointer-events-none transition-opacity duration-300 z-10"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(350px circle at ${mousePos.x}% ${mousePos.y}%, ${p.spot}, transparent 60%)`,
        }}
      />

      {/* Inner white card — masks the spinning disc, leaving only the border visible */}
      <div className="relative bg-white rounded-[inherit] h-full z-10 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
