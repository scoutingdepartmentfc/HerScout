"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";

/** Design size of a pitch card at scale 1 (card + role tag), in px. */
export const PITCH_CARD_W = 144;
export const PITCH_CARD_H = 232;
const MIN_SCALE = 0.38;
const SLOT_GAP = 8;

/** Scale (0.38–1) cards should render at so the widest line fits the pitch. */
export const PitchScaleContext = createContext(1);
export const usePitchScale = () => useContext(PitchScaleContext);

/** Scales an empty-slot placeholder (designed at 96x144) like the cards around it. */
export const EmptyPitchSlot: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const scale = usePitchScale();
  return (
    <div style={{ width: 96 * scale, height: 144 * scale }}>
      <div style={{ width: 96, height: 144, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
};

interface StadiumPitchProps {
  children: React.ReactNode;
  /** Players in the widest line of the formation (drives card size). */
  maxPerLine?: number;
}

export const StadiumPitch: React.FC<StadiumPitchProps> = ({ children, maxPerLine = 4 }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const update = () => {
      const perSlot = el.clientWidth / Math.max(1, maxPerLine) - SLOT_GAP;
      setScale(Math.min(1, Math.max(MIN_SCALE, perSlot / PITCH_CARD_W)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxPerLine]);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border-2 border-emerald-500/30 bg-[#06190f] shadow-2xl">
      {/* 3D Perspective & Grass texture background */}
      <div
        className="relative w-full min-h-[480px] sm:min-h-[720px] lg:min-h-[820px] px-1 py-4 sm:p-6 flex flex-col justify-between"
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
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[520px] max-w-[70%] h-28 sm:h-52 border-b-2 border-x-2 border-white/35 rounded-b-xl">
            {/* Goal area chica */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-12 sm:h-24 border-b-2 border-x-2 border-white/35 rounded-b-md" />
            {/* Punto de penalti */}
            <div className="absolute bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white/50" />
            {/* Top Penalty Arc */}
            <div className="absolute -bottom-8 sm:-bottom-14 left-1/2 -translate-x-1/2 w-24 h-8 sm:w-44 sm:h-14 border-b-2 border-white/35 rounded-b-full" />
          </div>

          {/* Bottom Penalty Area (Own Box) - Doble de grande */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[520px] max-w-[70%] h-28 sm:h-52 border-t-2 border-x-2 border-white/35 rounded-t-xl">
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
        <div ref={contentRef} className="relative z-10 w-full h-full flex flex-col justify-between py-2 sm:py-6">
          <PitchScaleContext.Provider value={scale}>{children}</PitchScaleContext.Provider>
        </div>
      </div>
    </div>
  );
};

