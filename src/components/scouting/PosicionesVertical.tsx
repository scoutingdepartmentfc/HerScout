import React from "react";

export const POS_VERTICAL: Record<string, [number, number]> = {
  Portero: [34, 95],
  GK: [34, 95],
  "Lateral Derecho": [56, 75],
  RB: [56, 75],
  "Central Derecho": [45, 82],
  "Central Izquierdo": [23, 82],
  CB: [34, 82],
  "Lateral Izquierdo": [12, 75],
  LB: [12, 75],
  "Mediocentro Defensivo": [34, 66],
  CDM: [34, 66],
  Mediocentro: [34, 52.5],
  Centrocampista: [34, 52.5],
  CM: [34, 52.5],
  Mediapunta: [34, 37],
  AMF: [34, 37],
  CAM: [34, 37],
  "Extremo Derecho": [56, 26],
  RW: [56, 26],
  "Extremo Izquierdo": [12, 26],
  LW: [12, 26],
  Delantero: [34, 15],
  Delantera: [34, 15],
  ST: [34, 15],
  CF: [34, 15],
};

export const PosicionesVertical: React.FC<{
  positions: Record<string, { min: number; pj?: number }>;
}> = ({ positions }) => {
  const total = Object.values(positions).reduce((a, b) => a + b.min, 0) || 1;
  const entries = Object.entries(positions).filter(([d]) => POS_VERTICAL[d]);

  return (
    <div
      className="relative mx-auto select-none overflow-hidden rounded-lg bg-[#070c18] border border-border/80"
      style={{ aspectRatio: "68 / 105", width: "100%", maxWidth: "300px" }}
    >
      {/* Attack indicator */}
      <div className="absolute top-2.5 right-3 z-20 flex flex-col items-center gap-0.5 opacity-90 bg-black/60 px-2 py-0.5 rounded border border-white/10">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#F2C230"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
        <span className="text-[9px] font-bold text-amber-300">Attack</span>
      </div>

      <svg viewBox="0 0 68 105" className="absolute inset-0 h-full w-full select-none">
        {/* Pitch Lines */}
        <g fill="none" stroke="rgba(255, 255, 255, 0.28)" strokeWidth="0.5">
          <rect x="2" y="2" width="64" height="101" />
          <line x1="2" y1="52.5" x2="66" y2="52.5" />
          <circle cx="34" cy="52.5" r="9.15" />
          <circle cx="34" cy="52.5" r="0.6" fill="rgba(255, 255, 255, 0.4)" stroke="none" />
          {/* Opponent top box */}
          <rect x="13.84" y="2" width="40.32" height="16.5" />
          <rect x="24.84" y="2" width="18.32" height="5.5" />
          {/* Own bottom box */}
          <rect x="13.84" y="86.5" width="40.32" height="16.5" />
          <rect x="24.84" y="97.5" width="18.32" height="5.5" />
        </g>

        {/* Tactical Nodes with percentage and code */}
        {entries.map(([d, { min: m }]) => {
          const p = POS_VERTICAL[d];
          if (!p) return null;
          const pct = m / total;
          const pctRounded = Math.round(pct * 100);
          const radius = 5.2 + 4.5 * Math.sqrt(pct);
          const code = d.slice(0, 3).toUpperCase();

          return (
            <g key={d} className="cursor-pointer">
              <circle
                cx={p[0]}
                cy={p[1]}
                r={radius + 1.2}
                fill="none"
                stroke="rgba(242, 194, 48, 0.5)"
                strokeWidth={0.6}
              />
              <circle
                cx={p[0]}
                cy={p[1]}
                r={radius}
                fill="rgba(242, 194, 48, 0.95)"
                stroke="#0A1422"
                strokeWidth={0.7}
              />
              <text
                x={p[0]}
                y={p[1] - 0.7}
                textAnchor="middle"
                fontSize={radius * 0.48}
                fill="#0E1A2B"
                fontWeight={800}
              >
                {code}
              </text>
              <text
                x={p[0]}
                y={p[1] + radius * 0.52}
                textAnchor="middle"
                fontSize={radius * 0.42}
                fill="#0E1A2B"
                fontWeight={600}
              >
                {pctRounded}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

