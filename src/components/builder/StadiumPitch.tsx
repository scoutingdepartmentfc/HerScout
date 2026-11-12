"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";

/** Design size of a pitch card at scale 1, in px. */
export const PITCH_CARD_W = 128;
export const PITCH_CARD_H = 164;
const MIN_SCALE = 0.38;
const SLOT_GAP = 10;
/** Inner padding of the slots area (px per side). */
const PAD = 14;

/** Scale slots render at so the whole pitch fits. */
export const PitchScaleContext = createContext(1);
export const usePitchScale = () => useContext(PitchScaleContext);

/** Scales content designed at w x h like the other slots of the pitch. */
export const EmptyPitchSlot: React.FC<{ children: React.ReactNode; w?: number; h?: number }> = ({ children, w = 96, h = 144 }) => {
  const scale = usePitchScale();
  return (
    <div style={{ width: w * scale, height: h * scale }} className="relative hover:z-40">
      <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
};

interface StadiumPitchProps {
  /** Slots of each line of the system, from attack to goalkeeper. */
  lines: React.ReactNode[][];
  /** Horizontal: goalkeeper on the left, attack on the right. Vertical: attack on top. */
  orientation?: "horizontal" | "vertical";
  /** Design size of each slot. */
  slotW?: number;
  slotH?: number;
  /** Take the parent's height and scale so the whole pitch is always visible (otherwise the height follows the content). */
  fit?: boolean;
  /** Only some lines shown: they may be laid across the pitch when that makes the slots bigger. */
  focus?: boolean;
  minScale?: number;
  maxScale?: number;
}

export const StadiumPitch: React.FC<StadiumPitchProps> = ({
  lines, orientation = "vertical", slotW = PITCH_CARD_W, slotH = PITCH_CARD_H, fit = false, focus = false,
  minScale = MIN_SCALE, maxScale = 1,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const horizontal = orientation === "horizontal";
  const [layout, setLayout] = useState({ scale: 1, columns: horizontal });
  /** Sin `fit`: alto mínimo para la proporción del campo (crece si el contenido lo necesita) */
  const [minH, setMinH] = useState(0);
  const shape = lines.map((l) => l.length).join(",");
  const ratio = horizontal ? 100 / 60 : 60 / 100;

  // Mayor rectángulo con la proporción del campo que cabe en el hueco
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!fit || !el) return;
    const update = () => {
      const w = Math.min(el.clientWidth, el.clientHeight * ratio);
      setBox({ w: Math.floor(w), h: Math.floor(w / ratio) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, ratio]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const counts = shape ? shape.split(",").map(Number) : [1];
    const n = Math.max(1, counts.length);
    const maxPer = Math.max(1, ...counts);
    const update = () => {
      if (!fit) setMinH(Math.round(el.clientWidth / ratio));
      const W = el.clientWidth - 2 * PAD;
      const H = el.clientHeight - 2 * PAD;
      // Lines as columns (horizontal pitch) or as rows (vertical pitch)
      const asColumns = Math.min((W / n - SLOT_GAP) / slotW, (H / maxPer - SLOT_GAP) / slotH);
      const asRows = fit
        ? Math.min((W / maxPer - SLOT_GAP) / slotW, (H / n - SLOT_GAP) / slotH)
        : (W / maxPer - SLOT_GAP) / slotW;
      let columns = horizontal;
      if (focus && fit) columns = asColumns > asRows;
      const s = columns ? asColumns : asRows;
      setLayout({ scale: Math.min(maxScale, Math.max(minScale, s)), columns });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shape, horizontal, slotW, slotH, fit, focus, minScale, maxScale, box.w > 0, ratio]);

  // Columns: goalkeeper on the left → attack on the right
  const ordered = layout.columns ? [...lines].reverse() : lines;

  const pitch = (style?: React.CSSProperties) => (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 border-emerald-500/30 bg-[#06190f] shadow-2xl flex flex-col ${fit ? "" : "w-full"}`}
      style={style}
    >
      <PitchMarkings horizontal={horizontal} />
      <div
        ref={contentRef}
        className={`relative z-10 w-full flex-1 flex ${fit ? "min-h-0" : "gap-y-5"} ${layout.columns ? "flex-row" : "flex-col"} justify-around`}
        style={{ padding: PAD, minHeight: fit ? undefined : minH }}
      >
        <PitchScaleContext.Provider value={layout.scale}>
          {ordered.map((line, i) => (
            <div
              key={i}
              className={`flex items-center justify-around ${layout.columns ? "flex-col" : "flex-row flex-wrap gap-y-3"}`}
              style={layout.columns ? undefined : { columnGap: SLOT_GAP }}
            >
              {line}
            </div>
          ))}
        </PitchScaleContext.Provider>
      </div>
    </div>
  );

  // Siempre en proporción real: 100×60 (horizontal) o 60×100 (vertical)
  if (!fit) return pitch();
  return (
    <div ref={boxRef} className="w-full h-full flex items-center justify-center">
      {box.w > 0 && pitch({ width: box.w, height: box.h })}
    </div>
  );
};

/** Grass and FIFA-style markings, drawn in % so they follow any size. */
function PitchMarkings({ horizontal }: { horizontal: boolean }) {
  const ln = "border-white/30";
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: `radial-gradient(ellipse at 50% 50%, rgba(16, 185, 129, 0.16) 0%, transparent 70%),
          repeating-linear-gradient(${horizontal ? "90deg" : "0deg"}, #134e2f 0 6.25%, #0f3f26 6.25% 12.5%)`,
      }}
    >
      <div className={`absolute inset-2 sm:inset-3 border-2 ${ln} rounded-md`}>
        {horizontal ? (
          <div className={`absolute inset-y-0 left-1/2 -translate-x-1/2 border-l-2 ${ln}`} />
        ) : (
          <div className={`absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 ${ln}`} />
        )}
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 aspect-square rounded-full border-2 ${ln} ${
            horizontal ? "h-[30.5%]" : "w-[30.5%]"
          }`}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white/40" />
        {horizontal ? (
          <>
            <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-[67%] w-[16.5%] border-2 border-l-0 ${ln}`}>
              <div className={`absolute left-0 top-1/2 -translate-y-1/2 h-[45%] w-[33%] border-2 border-l-0 ${ln}`} />
              <div className="absolute left-[67%] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/45" />
            </div>
            <div className={`absolute right-0 top-1/2 -translate-y-1/2 h-[67%] w-[16.5%] border-2 border-r-0 ${ln}`}>
              <div className={`absolute right-0 top-1/2 -translate-y-1/2 h-[45%] w-[33%] border-2 border-r-0 ${ln}`} />
              <div className="absolute right-[67%] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/45" />
            </div>
          </>
        ) : (
          <>
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[67%] h-[16.5%] border-2 border-t-0 ${ln}`}>
              <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[45%] h-[33%] border-2 border-t-0 ${ln}`} />
              <div className="absolute top-[67%] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white/45" />
            </div>
            <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-[67%] h-[16.5%] border-2 border-b-0 ${ln}`}>
              <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-[45%] h-[33%] border-2 border-b-0 ${ln}`} />
              <div className="absolute bottom-[67%] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white/45" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
