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
      // Single bright spot — pure clockwise, no reversal
      stops: "rgba(191,155,48,1) 0%, rgba(191,155,48,0.4) 8%, transparent 25%, transparent 75%, rgba(191,155,48,0.4) 92%, rgba(191,155,48,1) 100%",
      spot: "rgba(191,155,48,0.12)",
      shadow: "0 0 30px -5px rgba(191,155,48,0.06), 0 0 60px -10px rgba(191,155,48,0.03)",
      shadowHover: "0 0 40px -5px rgba(191,155,48,0.12), 0 0 80px -10px rgba(191,155,48,0.06)",
    },
    silver: {
      stops: "rgba(180,180,190,1) 0%, rgba(180,180,190,0.4) 8%, transparent 25%, transparent 75%, rgba(180,180,190,0.4) 92%, rgba(180,180,190,1) 100%",
      spot: "rgba(180,180,190,0.15)",
      shadow: "0 0 30px -5px rgba(180,180,190,0.06), 0 0 60px -10px rgba(180,180,190,0.03)",
      shadowHover: "0 0 40px -5px rgba(180,180,190,0.12), 0 0 80px -10px rgba(180,180,190,0.06)",
    },
    blue: {
      stops: "rgba(59,130,246,1) 0%, rgba(59,130,246,0.4) 8%, transparent 25%, transparent 75%, rgba(59,130,246,0.4) 92%, rgba(59,130,246,1) 100%",
      spot: "rgba(59,130,246,0.12)",
      shadow: "0 0 30px -5px rgba(59,130,246,0.06), 0 0 60px -10px rgba(59,130,246,0.03)",
      shadowHover: "0 0 40px -5px rgba(59,130,246,0.12), 0 0 80px -10px rgba(59,130,246,0.06)",
    },
    gold: {
      stops: "rgba(191,155,48,1) 0%, rgba(191,155,48,0.4) 8%, transparent 25%, transparent 75%, rgba(191,155,48,0.4) 92%, rgba(191,155,48,1) 100%",
      spot: "rgba(191,155,48,0.15)",
      shadow: "0 0 30px -5px rgba(191,155,48,0.08), 0 0 60px -10px rgba(191,155,48,0.04)",
      shadowHover: "0 0 40px -5px rgba(191,155,48,0.15), 0 0 80px -10px rgba(191,155,48,0.08)",
    },
  };

  const borderPx = intensity === "subtle" ? 1.5 : intensity === "medium" ? 2.5 : 3.5;
  const speed = intensity === "subtle" ? "20s" : intensity === "medium" ? "14s" : "10s";
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
      {/* Outer glow — soft blurred halo that fades to white */}
      <div
        className="absolute -inset-[6px] rounded-[inherit] overflow-hidden pointer-events-none"
      >
        <div
          className="absolute"
          style={{
            width: "200%",
            height: "200%",
            top: "-50%",
            left: "-50%",
            background: `conic-gradient(from 0deg at 50% 50%, ${p.stops})`,
            animation: `spin ${speed} linear infinite`,
            filter: "blur(12px)",
            opacity: 0.5,
          }}
        />
      </div>

      {/* Inner sharp border — spinning conic-gradient disc */}
      <div
        className="absolute inset-0 rounded-[inherit] overflow-hidden"
      >
        <div
          className="absolute"
          style={{
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
