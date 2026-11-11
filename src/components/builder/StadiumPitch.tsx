"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";

/** Design size of a pitch card at scale 1, in px. */
export const PITCH_CARD_W = 128;
export const PITCH_CARD_H = 164;
const MIN_SCALE = 0.38;
const SLOT_GAP = 8;

/** Scale (0.38–1) cards should render at so the widest line and every line fit the pitch. */
export const PitchScaleContext = createContext(1);
export const usePitchScale = () => useContext(PitchScaleContext);

/** Scales content designed at w x h (default: an empty card slot) like the cards around it. */
export const EmptyPitchSlot: React.FC<{ children: React.ReactNode; w?: number; h?: number }> = ({ children, w = 96, h = 144 }) => {
  const scale = usePitchScale();
  return (
    <div style={{ width: w * scale, height: h * scale }}>
      <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
};

interface StadiumPitchProps {
  children: React.ReactNode;
  /** Players in the widest line of the formation (drives card size). */
  maxPerLine?: number;
  /** Lines of the formation: with `fill`, cards also shrink so every line fits the height. */
  lines?: number;
  /** Design size of what sits in each slot (defaults to a pitch card). */
  cardW?: number;
  cardH?: number;
  /** Take the parent's height (the whole pitch always visible) instead of a fixed minimum height. */
  fill?: boolean;
}

export const StadiumPitch: React.FC<StadiumPitchProps> = ({
  children, maxPerLine = 4, lines = 4, cardW = PITCH_CARD_W, cardH = PITCH_CARD_H, fill = false,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const update = () => {
      const perSlot = el.clientWidth / Math.max(1, maxPerLine) - SLOT_GAP;
      let s = perSlot / cardW;
      if (fill) s = Math.min(s, (el.clientHeight / Math.max(1, lines) - SLOT_GAP) / cardH);
      setScale(Math.min(1, Math.max(MIN_SCALE, s)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxPerLine, lines, cardW, cardH, fill]);

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border-2 border-emerald-500/30 bg-[#06190f] shadow-2xl ${fill ? "h-full" : ""}`}>
      {/* 3D Perspective & Grass texture background */}
      <div
        className={`relative w-full px-1 py-4 flex flex-col justify-between ${
          fill ? "h-full sm:px-4 sm:py-5" : "min-h-[480px] sm:min-h-[720px] lg:min-h-[820px] sm:p-6"
        }`}
        style={{
          background: `
            radial-gradient(ellipse at 50% 20%, rgba(16, 185, 129, 0.25) 0%, transparent 70%),
            repeating-linear-gradient(
              0deg,
              #134e2f 0px,
              #134e2f 48px,
              #0f3f26 48px,
              #0f3f26 96px
            )
          `,
        }}
      >
        {/* Stadium lighting glow at top */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-emerald-400/15 via-emerald-500/5 to-transparent pointer-events-none" />

        {/* Pitch Lines (FIFA Regulation) */}
        <div className="absolute inset-2 sm:inset-8 border-2 border-white/35 rounded-lg pointer-events-none">
          {/* Halfway line */}
          <div className="absolute top-1/2 inset-x-0 -translate-y-1/2 border-b-2 border-white/35" />

          {/* Center circle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 sm:w-44 sm:h-44 rounded-full border-2 border-white/35" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white/40" />

          {/* Top Penalty Area (Opponent Box) - Doble de grande */}
          <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[520px] max-w-[60%] border-b-2 border-x-2 border-white/35 rounded-b-xl ${fill ? "h-[16%]" : "h-28 sm:h-52"}`}>
            {/* Goal area chica */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-12 sm:h-24 border-b-2 border-x-2 border-white/35 rounded-b-md" />
            {/* Punto de penalti */}
            <div className="absolute bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white/50" />
            {/* Top Penalty Arc */}
            <div className="absolute -bottom-8 sm:-bottom-14 left-1/2 -translate-x-1/2 w-24 h-8 sm:w-44 sm:h-14 border-b-2 border-white/35 rounded-b-full" />
          </div>

          {/* Bottom Penalty Area (Own Box) - Doble de grande */}
          <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-[520px] max-w-[60%] border-t-2 border-x-2 border-white/35 rounded-t-xl ${fill ? "h-[16%]" : "h-28 sm:h-52"}`}>
            {/* Goal area chica */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-12 sm:h-24 border-t-2 border-x-2 border-white/35 rounded-t-md" />
            {/* Punto de penalti */}
            <div className="absolute top-4 sm:top-8 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white/50" />
            {/* Bottom Penalty Arc */}
            <div className="absolute -top-8 sm:-top-14 left-1/2 -translate-x-1/2 w-24 h-8 sm:w-44 sm:h-14 border-t-2 border-white/35 rounded-t-full" />
          </div>

          {/* Corner arcs */}
          <div className="absolute top-0 left-0 w-8 h-8 border-b-2 border-r-2 border-white/35 rounded-br-full" />
          <div className="absolute top-0 right-0 w-8 h-8 border-b-2 border-l-2 border-white/35 rounded-bl-full" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-t-2 border-r-2 border-white/35 rounded-tr-full" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-t-2 border-l-2 border-white/35 rounded-tl-full" />
        </div>

        {/* Content: cards arranged inside */}
        <div ref={contentRef} className={`relative z-10 w-full h-full flex flex-col justify-between ${fill ? "" : "py-2 sm:py-6"}`}>
          <PitchScaleContext.Provider value={scale}>{children}</PitchScaleContext.Provider>
        </div>
      </div>
    </div>
  );
};

