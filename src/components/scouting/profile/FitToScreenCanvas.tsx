"use client";

import React, { useLayoutEffect, useRef, useState } from "react";

export type FitMode = "mobile" | "landscape" | "portrait";

/**
 * Design canvas (CSS px) each layout is drawn on. The canvas is scaled with CSS zoom to fill the
 * available width; it also shrinks to fit the height, but never below MIN_SCALE so text stays
 * readable — on very short screens the page scrolls a little instead.
 */
const DESIGNS = {
  landscape: { minW: 1560, minH: 800 }, // 4 columns (laptops, desktops, landscape tablets)
  portrait: { minW: 1100, minH: 1450 }, // 2 columns + bottom band (portrait tablets)
} as const;

const MAX_SCALE = 1.6;
const MIN_SCALE = 0.85;

/** Phones (portrait or landscape) keep the stacked, scrolling layout. */
const isMobileViewport = () => window.innerWidth < 768 || window.innerHeight < 500;

interface Layout {
  mode: FitMode;
  scale: number;
  width: number;
  height: number;
}

interface Props {
  className?: string;
  children: (mode: FitMode) => React.ReactNode;
}

export function FitToScreenCanvas({ className = "", children }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);

  // Measure the available area and pick the layout that gives the largest scale
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const compute = () => {
      if (isMobileViewport()) {
        setLayout((prev) => (prev?.mode === "mobile" ? prev : { mode: "mobile", scale: 1, width: 0, height: 0 }));
        return;
      }
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      let best: Layout | null = null;
      for (const mode of ["landscape", "portrait"] as const) {
        const { minW, minH } = DESIGNS[mode];
        const widthScale = Math.min(w / minW, MAX_SCALE);
        // Fit the height too, but don't drop below MIN_SCALE (width remains a hard limit)
        const scale = Math.min(widthScale, Math.max(h / minH, MIN_SCALE));
        const cand = { mode, scale, width: w / scale, height: Math.max(h / scale, minH) };
        if (!best || cand.scale > best.scale) best = cand;
      }
      setLayout((prev) =>
        prev &&
        prev.mode === best!.mode &&
        Math.abs(prev.scale - best!.scale) < 0.001 &&
        Math.abs(prev.width - best!.width) < 0.5 &&
        Math.abs(prev.height - best!.height) < 0.5
          ? prev
          : best
      );
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(host);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, []);

  const fit = layout && layout.mode !== "mobile";

  return (
    <div ref={hostRef} className={`w-full md:h-full ${fit ? "overflow-x-hidden overflow-y-auto" : ""}`}>
      {layout?.mode === "mobile" && <div className={className}>{children("mobile")}</div>}
      {fit && (
        <div
          className={`profile-fit ${layout.mode === "landscape" ? "profile-fit-land" : ""} ${className}`}
          style={{ width: layout.width, height: layout.height, zoom: layout.scale }}
        >
          {children(layout.mode)}
        </div>
      )}
    </div>
  );
}
