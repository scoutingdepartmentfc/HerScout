import React from "react";
import { getTeamColors } from "@/lib/teamColors";

interface CamisetaDorsalProps {
  number?: number | string | null;
  teamName?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "hero";
  className?: string;
}

export function CamisetaDorsal({
  number,
  teamName,
  size = "md",
  className = "",
}: CamisetaDorsalProps) {
  const displayNum = number != null && number !== "" ? String(number) : "-";
  const isTwoDigits = displayNum.length >= 2;
  const uid = React.useId().replace(/:/g, "");

  // Extraer colores del club o usar la camiseta neutral por defecto
  const colors = getTeamColors(teamName);
  const primaryColor = colors.primary || "#FFFFFF";
  const secondaryColor = colors.secondary || "#0F172A";

  // Determinar contraste para el texto del dorsal
  // Si el color primario de la camiseta es claro, el dorsal va en secundario oscuro
  const isPrimaryLight =
    primaryColor.toUpperCase() === "#FFFFFF" ||
    primaryColor.toUpperCase() === "#F0F0F0" ||
    primaryColor.toUpperCase() === "#E0E0E0" ||
    primaryColor.toUpperCase() === "#FDE047";

  const numberColor = isPrimaryLight ? (secondaryColor !== "#FFFFFF" ? secondaryColor : "#0F172A") : "#FFFFFF";
  const strokeBorderColor = isPrimaryLight ? "#0F172A" : secondaryColor;

  const sizeStyles = {
    xs: {
      box: "w-5 h-5",
    },
    sm: {
      box: "w-6 h-6",
    },
    md: {
      box: "w-8 h-8",
    },
    lg: {
      box: "w-10 h-10",
    },
    xl: {
      box: "w-14 h-14 sm:w-16 sm:h-16",
    },
    hero: {
      box: "w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28",
    },
  }[size];

  return (
    <div
      className={`group relative inline-flex items-center justify-center shrink-0 select-none ${sizeStyles.box} ${className}`}
      title={
        number
          ? `Dorsal #${number}${teamName ? ` (${teamName})` : ""}`
          : teamName
          ? `Camiseta ${teamName}`
          : "Sin dorsal"
      }
    >
      {/* Sutil halo dinámico con el color primario del club para formatos grandes */}
      {(size === "xl" || size === "hero" || size === "lg") && (
        <div
          className="absolute inset-2 rounded-full blur-xl opacity-35 group-hover:opacity-60 transition-opacity"
          style={{ backgroundColor: primaryColor }}
        />
      )}

      <svg
        viewBox="0 0 100 92"
        className="relative w-full h-full drop-shadow-lg overflow-visible"
      >
        <defs>
          <linearGradient id={`grad-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={primaryColor} />
            <stop offset="100%" stopColor={primaryColor} stopOpacity={0.88} />
          </linearGradient>
          <clipPath id={`clip-${uid}`}>
            <path d="M 31 7 C 37 17, 63 17, 69 7 L 96 17 C 99 19, 99 26, 95 32 L 83 40 C 80 42, 76 41, 75 36 L 75 83 C 75 87, 72 89, 68 89 L 32 89 C 28 89, 25 87, 25 83 L 25 36 C 24 41, 20 42, 17 40 L 5 32 C 1 26, 1 19, 4 17 Z" />
          </clipPath>
        </defs>

        {/* Cuerpo de la camiseta con degradado del color primario */}
        <path
          d="M 31 7 
             C 37 17, 63 17, 69 7 
             L 96 17 
             C 99 19, 99 26, 95 32 
             L 83 40 
             C 80 42, 76 41, 75 36 
             L 75 83 
             C 75 87, 72 89, 68 89 
             L 32 89 
             C 28 89, 25 87, 25 83 
             L 25 36 
             C 24 41, 20 42, 17 40 
             L 5 32 
             C 1 26, 1 19, 4 17 
             Z"
          fill={`url(#grad-${uid})`}
          stroke={strokeBorderColor}
          strokeWidth="3.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Textura y detalles premium interiores */}
        <g clipPath={`url(#clip-${uid})`}>
          {/* Brillo suave de luz superior */}
          <path d="M 0 0 L 70 0 L 25 92 L 0 92 Z" fill="#ffffff" opacity="0.08" />

          {/* Cuello del club */}
          <path
            d="M 31 7 C 37 17, 63 17, 69 7"
            fill="none"
            stroke={secondaryColor}
            strokeWidth="4"
          />

          {/* Franja de manga izquierda */}
          <path d="M 4 22 L 20 34" stroke={secondaryColor} strokeWidth="3.5" />
          {/* Franja de manga derecha */}
          <path d="M 96 22 L 80 34" stroke={secondaryColor} strokeWidth="3.5" />
        </g>

        {/* Parche/Detalle de manga */}
        <rect
          x="10"
          y="18"
          width="9"
          height="6.5"
          rx="1"
          fill={secondaryColor}
          transform="rotate(-15 14.5 21)"
        />
        {/* Parche/Detalle inferior */}
        <rect
          x="30"
          y="78"
          width="6"
          height="6"
          rx="1"
          fill={secondaryColor}
        />

        {/* Dorsal centrado con tipografía display moderna */}
        <text
          x="50"
          y="56"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={numberColor}
          stroke={isPrimaryLight ? "none" : "rgba(0,0,0,0.4)"}
          strokeWidth={isPrimaryLight ? "0" : "0.5"}
          fontWeight="900"
          fontSize={isTwoDigits ? "35" : "44"}
          letterSpacing={isTwoDigits ? "-2.5" : "-1"}
          fontFamily="'Barlow', system-ui, -apple-system, sans-serif"
        >
          {displayNum}
        </text>
      </svg>
    </div>
  );
}

const JERSEY_PATH =
  "M 31 7 C 37 17, 63 17, 69 7 L 96 17 C 99 19, 99 26, 95 32 L 83 40 C 80 42, 76 41, 75 36 L 75 83 C 75 87, 72 89, 68 89 L 32 89 C 28 89, 25 87, 25 83 L 25 36 C 24 41, 20 42, 17 40 L 5 32 C 1 26, 1 19, 4 17 Z";

/**
 * Camiseta grande para cabeceras (ficha de jugadora): silueta con degradado,
 * acentos ámbar y dorsal con tipografía display.
 */
export function CamisetaDorsalHero({
  number,
  className = "",
}: {
  number?: number | string | null;
  className?: string;
}) {
  const uid = React.useId().replace(/:/g, "");
  if (number == null || number === "") return null;
  const displayNum = String(number);
  const len = displayNum.length;
  const fontSize = len >= 3 ? 26 : len === 2 ? 38 : 46;

  return (
    <div
      className={`group relative shrink-0 select-none w-14 h-[52px] sm:w-16 sm:h-[58px] lg:w-20 lg:h-[72px] ${className}`}
      title={`Dorsal #${displayNum}`}
    >
      {/* Halo */}
      <div className="absolute inset-2 rounded-full bg-amber-400/20 blur-2xl transition-opacity group-hover:opacity-100 opacity-70" />
      <svg viewBox="0 0 100 92" className="relative w-full h-full overflow-visible">
        <defs>
          <linearGradient id={`jf-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="55%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#0b1220" />
          </linearGradient>
          <linearGradient id={`js-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id={`jn-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>
          <clipPath id={`jc-${uid}`}>
            <path d={JERSEY_PATH} />
          </clipPath>
        </defs>

        <path d={JERSEY_PATH} fill={`url(#jf-${uid})`} />
        <g clipPath={`url(#jc-${uid})`}>
          {/* Brillo diagonal */}
          <path d="M 0 0 L 60 0 L 20 92 L 0 92 Z" fill="#ffffff" opacity="0.06" />
          {/* Franjas en mangas */}
          <path d="M 2 27 L 22 39" stroke={`url(#js-${uid})`} strokeWidth="3" />
          <path d="M 98 27 L 78 39" stroke={`url(#js-${uid})`} strokeWidth="3" />
          {/* Cuello */}
          <path d="M 31 7 C 37 17, 63 17, 69 7" fill="none" stroke={`url(#js-${uid})`} strokeWidth="4" />
        </g>
        <path
          d={JERSEY_PATH}
          fill="none"
          stroke={`url(#js-${uid})`}
          strokeWidth="1.6"
          strokeLinejoin="round"
          opacity="0.8"
        />

        <text
          x="50"
          y="58"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={`url(#jn-${uid})`}
          stroke="#0b1220"
          strokeWidth="0.6"
          fontWeight="800"
          fontSize={fontSize}
          letterSpacing="-1"
          style={{ fontFamily: 'var(--font-display), "Arial Narrow", sans-serif' }}
        >
          {displayNum}
        </text>
      </svg>
    </div>
  );
}
