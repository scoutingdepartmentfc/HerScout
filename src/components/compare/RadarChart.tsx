import React, { useId, useState } from "react";

export interface RadarDataset {
  id: string;
  label: string;
  color: string;
  data: number[]; // Scores on 0 to 100 scale
  avatar?: string | null;
  teamBadge?: string | null;
  teamName?: string;
  position?: string;
}

export interface RadarAxis {
  key: string;
  label: string;
  category?: string;
  max?: number;
  format?: (v: number) => string;
}

interface RadarChartProps {
  axes: RadarAxis[];
  datasets: RadarDataset[];
  size?: number;
  highlightedDatasetId?: string | null;
  onHoverDataset?: (id: string | null) => void;
  className?: string;
}

export const RadarChart: React.FC<RadarChartProps> = ({
  axes,
  datasets,
  size = 720,
  highlightedDatasetId,
  onHoverDataset,
  className = "",
}) => {
  const chartId = useId();
  const [hoveredAxisIdx, setHoveredAxisIdx] = useState<number | null>(null);

  // Expanded radius to occupy maximum space
  const radius = size * 0.38;
  const centerX = size / 2;
  // Shift center slightly upward (-36px) so top labels sit closer to the header and chart fills upper room
  const centerY = size / 2 - 36;
  const numAxes = axes.length;

  if (numAxes < 3) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 text-xs">
        <p>Select at least 3 metrics to render the radar polygon.</p>
      </div>
    );
  }

  // Calculate coordinates for an axis index and a value (0-100)
  const getCoordinates = (axisIndex: number, value: number) => {
    // Start from top (-PI/2) and rotate clockwise
    const angle = (Math.PI * 2 * axisIndex) / numAxes - Math.PI / 2;
    const distance = (Math.max(0, Math.min(100, value)) / 100) * radius;
    return {
      x: centerX + distance * Math.cos(angle),
      y: centerY + distance * Math.sin(angle),
    };
  };

  // Concentric levels (20, 40, 60, 80, 100)
  const levels = [20, 40, 60, 80, 100];

  return (
    <div className={`relative w-full flex items-center justify-center select-none ${className}`}>
      <svg
        viewBox={`0 0 ${size} ${size - 25}`}
        className="w-full h-auto max-h-[660px] overflow-visible drop-shadow-2xl"
      >
        <defs>
          {datasets.map((ds, idx) => (
            <radialGradient
              key={`rad-grad-${ds.id}`}
              id={`radar-fill-${chartId}-${idx}`}
              cx="50%"
              cy="50%"
              r="50%"
              fx="50%"
              fy="50%"
            >
              <stop offset="0%" stopColor={ds.color} stopOpacity="0.45" />
              <stop offset="70%" stopColor={ds.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={ds.color} stopOpacity="0.05" />
            </radialGradient>
          ))}
          <filter id={`radar-glow-${chartId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Concentric Polygons / Circles */}
        {levels.map((lvl) => {
          const points = axes
            .map((_, i) => {
              const { x, y } = getCoordinates(i, lvl);
              return `${x},${y}`;
            })
            .join(" ");

          const isBenchmark = lvl === 80;
          return (
            <g key={`level-${lvl}`}>
              <polygon
                points={points}
                fill={lvl === 100 ? "rgba(15, 23, 42, 0.45)" : "none"}
                stroke={isBenchmark ? "rgba(16, 185, 129, 0.35)" : "rgba(255, 255, 255, 0.08)"}
                strokeWidth={isBenchmark ? 1.5 : 1}
                strokeDasharray={isBenchmark ? "4 4" : undefined}
              />
              {/* Level label on the top vertical axis */}
              <text
                x={centerX + 6}
                y={centerY - (lvl / 100) * radius + 3}
                fill={isBenchmark ? "#34d399" : "#64748b"}
                fontSize="9.5"
                fontWeight="600"
                fontFamily="monospace"
                className="select-none"
              >
                {lvl}
              </text>
            </g>
          );
        })}

        {/* Spokes / Axis lines */}
        {axes.map((ax, i) => {
          const edge = getCoordinates(i, 100);
          const isHovered = hoveredAxisIdx === i;

          return (
            <g
              key={`axis-${ax.key}`}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredAxisIdx(i)}
              onMouseLeave={() => setHoveredAxisIdx(null)}
            >
              <line
                x1={centerX}
                y1={centerY}
                x2={edge.x}
                y2={edge.y}
                stroke={isHovered ? "rgba(56, 189, 248, 0.7)" : "rgba(255, 255, 255, 0.12)"}
                strokeWidth={isHovered ? 2 : 1}
              />
            </g>
          );
        })}

        {/* Datasets Filled Polygons */}
        {datasets.map((ds, idx) => {
          const isHighlighted = highlightedDatasetId ? highlightedDatasetId === ds.id : true;
          const isMuted = highlightedDatasetId && highlightedDatasetId !== ds.id;

          const pointsArr = axes.map((_, axIdx) => {
            const val = ds.data[axIdx] ?? 0;
            return getCoordinates(axIdx, val);
          });
          const pointsStr = pointsArr.map((p) => `${p.x},${p.y}`).join(" ");

          return (
            <g
              key={`dataset-${ds.id}`}
              className="transition-all duration-300"
              style={{
                opacity: isMuted ? 0.18 : 1,
              }}
              onMouseEnter={() => onHoverDataset?.(ds.id)}
              onMouseLeave={() => onHoverDataset?.(null)}
            >
              {/* Polygon Area */}
              <polygon
                points={pointsStr}
                fill={`url(#radar-fill-${chartId}-${idx})`}
                className="transition-all duration-300"
              />

              {/* Stroke */}
              <polygon
                points={pointsStr}
                fill="none"
                stroke={ds.color}
                strokeWidth={isHighlighted && highlightedDatasetId ? 3.5 : 2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={`url(#radar-glow-${chartId})`}
              />

              {/* Data points */}
              {pointsArr.map((pt, pIdx) => {
                const val = ds.data[pIdx] ?? 0;
                return (
                  <circle
                    key={`point-${ds.id}-${pIdx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredAxisIdx === pIdx ? 5.5 : 3.5}
                    fill="#0b1329"
                    stroke={ds.color}
                    strokeWidth={2}
                    className="transition-transform duration-150 cursor-pointer"
                  >
                    <title>{`${ds.label} — ${axes[pIdx].label}: ${val.toFixed(1)}`}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}

        {/* Labels at Axis Edges */}
        {axes.map((ax, i) => {
          const angle = (Math.PI * 2 * i) / numAxes - Math.PI / 2;
          const labelDist = radius + 32;
          const lx = centerX + labelDist * Math.cos(angle);
          const ly = centerY + labelDist * Math.sin(angle);
          const isHovered = hoveredAxisIdx === i;

          // Align text dynamically based on horizontal position
          let textAnchor: "start" | "middle" | "end" = "middle";
          if (Math.cos(angle) > 0.2) textAnchor = "start";
          else if (Math.cos(angle) < -0.2) textAnchor = "end";

          return (
            <g
              key={`label-group-${ax.key}`}
              className="cursor-pointer transition-colors"
              onMouseEnter={() => setHoveredAxisIdx(i)}
              onMouseLeave={() => setHoveredAxisIdx(null)}
            >
              <text
                x={lx}
                y={ly}
                textAnchor={textAnchor}
                dominantBaseline="central"
                fill={isHovered ? "#38bdf8" : "#f1f5f9"}
                fontSize={isHovered ? "15" : "13.5"}
                fontWeight={isHovered ? "800" : "700"}
                className="font-sans drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] select-none transition-all tracking-wide"
              >
                {ax.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
