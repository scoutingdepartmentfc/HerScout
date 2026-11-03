import React from "react";

interface CamisetaDorsalProps {
  number?: number | string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

export function CamisetaDorsal({
  number,
  size = "md",
  className = "",
}: CamisetaDorsalProps) {
  const displayNum = number != null && number !== "" ? String(number) : "-";
  const isTwoDigits = displayNum.length >= 2;

  // Optimized sizing and font rendering:
  // Using wider proportion + SVG text scaling so numbers never clip or get cut off
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
  }[size];

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${sizeStyles.box} ${className}`}
      title={number ? `Dorsal #${number}` : "Sin dorsal"}
    >
      <svg
        viewBox="0 0 100 90"
        className="w-full h-full drop-shadow-sm overflow-visible"
      >
        {/* Camiseta blanca con contorno oscuro de alta definición */}
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
          fill="#ffffff"
          stroke="#0f172a"
          strokeWidth="6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Parche/Detalle en manga */}
        <rect
          x="10"
          y="18"
          width="9"
          height="6.5"
          rx="1"
          fill="#0f172a"
          transform="rotate(-15 14.5 21)"
        />
        {/* Parche/Detalle inferior */}
        <rect
          x="30"
          y="78"
          width="6"
          height="6"
          rx="1"
          fill="#0f172a"
        />

        {/* Dorsal renderizado directamente dentro del SVG:
            Garantiza centrado geométrico perfecto y sin desbordamientos tanto en 1 como en 2 dígitos */}
        <text
          x="50"
          y="56"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#0f172a"
          fontWeight="900"
          fontSize={isTwoDigits ? "33" : "42"}
          letterSpacing={isTwoDigits ? "-2.5" : "-1"}
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {displayNum}
        </text>
      </svg>
    </div>
  );
}
