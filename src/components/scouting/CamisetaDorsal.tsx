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

  const sizeStyles = {
    xs: {
      svg: "w-5 h-5",
      fontSize: "text-[9px]",
    },
    sm: {
      svg: "w-6 h-6",
      fontSize: "text-[10px]",
    },
    md: {
      svg: "w-8 h-8",
      fontSize: "text-[12px]",
    },
    lg: {
      svg: "w-10 h-10",
      fontSize: "text-[15px]",
    },
  }[size];

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${sizeStyles.svg} ${className}`}
      title={number ? `Dorsal #${number}` : "Sin dorsal asignado"}
    >
      {/* Camiseta SVG Vector Icon matching the user's reference */}
      <svg
        viewBox="0 0 100 90"
        className="w-full h-full drop-shadow-sm"
        fill="currentColor"
      >
        {/* Camiseta blanca con contorno negro/oscuro */}
        <path
          d="M 33 8 
             C 38 18, 62 18, 67 8 
             L 94 18 
             C 97 20, 97 27, 93 33 
             L 81 41 
             C 78 43, 75 42, 74 38 
             L 74 82 
             C 74 86, 71 88, 67 88 
             L 33 88 
             C 29 88, 26 86, 26 82 
             L 26 38 
             C 25 42, 22 43, 19 41 
             L 7 33 
             C 3 27, 3 20, 6 18 
             Z"
          fill="#ffffff"
          stroke="#0f172a"
          strokeWidth="6.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Parche/Detalle de manga derecha */}
        <rect
          x="12"
          y="18"
          width="9"
          height="7"
          rx="1"
          fill="#0f172a"
          transform="rotate(-15 16 21)"
        />
        {/* Parche/Detalle inferior */}
        <rect
          x="31"
          y="77"
          width="6"
          height="6"
          rx="1"
          fill="#0f172a"
        />
      </svg>

      {/* Número dorsal en el centro de la camiseta */}
      <span
        className={`absolute font-black tracking-tighter text-[#0f172a] text-center leading-none ${sizeStyles.fontSize}`}
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          top: "47%",
          left: "50%",
          transform: "translate(-50%, -46%)",
        }}
      >
        {displayNum}
      </span>
    </div>
  );
}
