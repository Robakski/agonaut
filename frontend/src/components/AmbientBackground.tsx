"use client";

/**
 * Animated gold & silver flowing ribbons background.
 * Pure SVG + CSS animations — lightweight, scalable, GPU-friendly.
 * Multiple wave paths with metallic gradients at low opacity,
 * slowly flowing and morphing across the full page height.
 */
export function AmbientBackground() {
  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, overflow: "hidden" }}
    >
      {/* Full-height SVG with flowing wave ribbons */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1440 3000"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Gold metallic gradient */}
          <linearGradient id="gold-ribbon" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#D4AF37" stopOpacity="0" />
            <stop offset="15%" stopColor="#D4AF37" stopOpacity="0.08" />
            <stop offset="30%" stopColor="#C5A54E" stopOpacity="0.12" />
            <stop offset="50%" stopColor="#D4AF37" stopOpacity="0.06" />
            <stop offset="70%" stopColor="#BF9B30" stopOpacity="0.10" />
            <stop offset="85%" stopColor="#D4AF37" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
          </linearGradient>

          {/* Silver metallic gradient */}
          <linearGradient id="silver-ribbon" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#B8B8C0" stopOpacity="0" />
            <stop offset="20%" stopColor="#C8C8D0" stopOpacity="0.06" />
            <stop offset="40%" stopColor="#B0B0B8" stopOpacity="0.09" />
            <stop offset="60%" stopColor="#C0C0C8" stopOpacity="0.05" />
            <stop offset="80%" stopColor="#B8B8C0" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#B8B8C0" stopOpacity="0" />
          </linearGradient>

          {/* Bright gold highlight for edge shine */}
          <linearGradient id="gold-shine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#D4AF37" stopOpacity="0" />
            <stop offset="30%" stopColor="#F0D060" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#FFE080" stopOpacity="0.08" />
            <stop offset="70%" stopColor="#F0D060" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
          </linearGradient>

          {/* Silver highlight */}
          <linearGradient id="silver-shine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E0E0E8" stopOpacity="0" />
            <stop offset="35%" stopColor="#F0F0F5" stopOpacity="0.10" />
            <stop offset="65%" stopColor="#E8E8F0" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#E0E0E8" stopOpacity="0" />
          </linearGradient>

          {/* Gaussian blur for soft edges */}
          <filter id="ribbon-blur">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <filter id="ribbon-blur-lg">
            <feGaussianBlur stdDeviation="16" />
          </filter>
        </defs>

        {/* ═══ Wave 1 — Wide gold ribbon, top area ═══ */}
        <g filter="url(#ribbon-blur-lg)" opacity="0.7">
          <path
            d="M-100,200 C200,150 400,280 720,220 C1040,160 1200,300 1540,250"
            stroke="url(#gold-ribbon)"
            strokeWidth="80"
            fill="none"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; 40,30; -20,15; 0,0"
              dur="25s"
              repeatCount="indefinite"
            />
          </path>
        </g>

        {/* ═══ Wave 2 — Thin gold shine line, top ═══ */}
        <g opacity="0.5">
          <path
            d="M-50,230 C250,180 450,310 720,250 C990,190 1180,320 1500,270"
            stroke="url(#gold-shine)"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; 35,25; -15,12; 0,0"
              dur="25s"
              repeatCount="indefinite"
            />
          </path>
        </g>

        {/* ═══ Wave 3 — Silver ribbon, upper-mid ═══ */}
        <g filter="url(#ribbon-blur-lg)" opacity="0.6">
          <path
            d="M1540,550 C1200,500 1000,620 720,580 C440,540 200,650 -100,600"
            stroke="url(#silver-ribbon)"
            strokeWidth="60"
            fill="none"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; -30,20; 25,-10; 0,0"
              dur="30s"
              repeatCount="indefinite"
            />
          </path>
        </g>

        {/* ═══ Wave 4 — Silver shine line ═══ */}
        <g opacity="0.4">
          <path
            d="M1500,570 C1180,520 980,640 720,600 C460,560 220,670 -50,620"
            stroke="url(#silver-shine)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; -25,18; 20,-8; 0,0"
              dur="30s"
              repeatCount="indefinite"
            />
          </path>
        </g>

        {/* ═══ Wave 5 — Large gold ribbon, mid section ═══ */}
        <g filter="url(#ribbon-blur-lg)" opacity="0.5">
          <path
            d="M-100,950 C300,880 550,1050 720,980 C890,910 1150,1080 1540,1000"
            stroke="url(#gold-ribbon)"
            strokeWidth="100"
            fill="none"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; 50,-25; -30,20; 0,0"
              dur="35s"
              repeatCount="indefinite"
            />
          </path>
        </g>

        {/* ═══ Wave 6 — Gold shine, mid ═══ */}
        <g opacity="0.45">
          <path
            d="M-50,980 C350,910 580,1070 720,1010 C860,950 1130,1100 1500,1020"
            stroke="url(#gold-shine)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; 45,-22; -25,18; 0,0"
              dur="35s"
              repeatCount="indefinite"
            />
          </path>
        </g>

        {/* ═══ Wave 7 — Silver ribbon, lower-mid ═══ */}
        <g filter="url(#ribbon-blur-lg)" opacity="0.55">
          <path
            d="M1540,1400 C1100,1350 900,1480 720,1420 C540,1360 300,1500 -100,1440"
            stroke="url(#silver-ribbon)"
            strokeWidth="70"
            fill="none"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; -35,30; 20,-15; 0,0"
              dur="28s"
              repeatCount="indefinite"
            />
          </path>
        </g>

        {/* ═══ Wave 8 — Gold ribbon, lower ═══ */}
        <g filter="url(#ribbon-blur-lg)" opacity="0.45">
          <path
            d="M-100,1850 C350,1780 600,1920 720,1870 C840,1820 1100,1960 1540,1890"
            stroke="url(#gold-ribbon)"
            strokeWidth="90"
            fill="none"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; 40,20; -30,-10; 0,0"
              dur="32s"
              repeatCount="indefinite"
            />
          </path>
        </g>

        {/* ═══ Wave 9 — Gold shine, lower ═══ */}
        <g opacity="0.4">
          <path
            d="M-50,1880 C380,1810 620,1940 720,1895 C820,1850 1080,1980 1500,1910"
            stroke="url(#gold-shine)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; 35,18; -25,-8; 0,0"
              dur="32s"
              repeatCount="indefinite"
            />
          </path>
        </g>

        {/* ═══ Wave 10 — Silver ribbon, near bottom ═══ */}
        <g filter="url(#ribbon-blur-lg)" opacity="0.5">
          <path
            d="M1540,2350 C1150,2290 950,2420 720,2370 C490,2320 250,2450 -100,2390"
            stroke="url(#silver-ribbon)"
            strokeWidth="65"
            fill="none"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; -40,25; 30,-15; 0,0"
              dur="27s"
              repeatCount="indefinite"
            />
          </path>
        </g>

        {/* ═══ Wave 11 — Silver shine, bottom ═══ */}
        <g opacity="0.35">
          <path
            d="M1500,2370 C1130,2310 930,2440 720,2390 C510,2340 270,2470 -50,2410"
            stroke="url(#silver-shine)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; -35,22; 25,-12; 0,0"
              dur="27s"
              repeatCount="indefinite"
            />
          </path>
        </g>

        {/* ═══ Wave 12 — Final gold ribbon, bottom ═══ */}
        <g filter="url(#ribbon-blur-lg)" opacity="0.4">
          <path
            d="M-100,2780 C400,2720 650,2850 720,2800 C790,2750 1100,2880 1540,2820"
            stroke="url(#gold-ribbon)"
            strokeWidth="75"
            fill="none"
            strokeLinecap="round"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0,0; 30,15; -20,10; 0,0"
              dur="30s"
              repeatCount="indefinite"
            />
          </path>
        </g>
      </svg>
    </div>
  );
}
