"use client";

import React from "react";

interface StadiumPitchProps {
  children: React.ReactNode;
}

export const StadiumPitch: React.FC<StadiumPitchProps> = ({ children }) => {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border-2 border-emerald-500/30 bg-[#06190f] shadow-2xl">
      {/* 3D Perspective & Grass texture background */}
      <div
        className="relative w-full min-h-[720px] lg:min-h-[820px] p-6 flex flex-col justify-between"
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
        <div className="absolute inset-4 sm:inset-8 border-2 border-white/35 rounded-lg pointer-events-none">
          {/* Halfway line */}
          <div className="absolute top-1/2 inset-x-0 -translate-y-1/2 border-b-2 border-white/35" />

          {/* Center circle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-36 h-36 sm:w-44 sm:h-44 rounded-full border-2 border-white/35" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white/40" />

          {/* Top Penalty Area (Opponent Box) */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 sm:w-80 h-28 border-b-2 border-x-2 border-white/35 rounded-b-md">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-12 border-b-2 border-x-2 border-white/35 rounded-b-sm" />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white/40" />
            {/* Top Penalty Arc */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-24 h-8 border-b-2 border-white/35 rounded-b-full" />
          </div>

          {/* Bottom Penalty Area (Own Box) */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-72 sm:w-80 h-28 border-t-2 border-x-2 border-white/35 rounded-t-md">
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-36 h-12 border-t-2 border-x-2 border-white/35 rounded-t-sm" />
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white/40" />
            {/* Bottom Penalty Arc */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-24 h-8 border-t-2 border-white/35 rounded-t-full" />
          </div>

          {/* Corner arcs */}
          <div className="absolute top-0 left-0 w-8 h-8 border-b-2 border-r-2 border-white/35 rounded-br-full" />
          <div className="absolute top-0 right-0 w-8 h-8 border-b-2 border-l-2 border-white/35 rounded-bl-full" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-t-2 border-r-2 border-white/35 rounded-tr-full" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-t-2 border-l-2 border-white/35 rounded-tl-full" />
        </div>

        {/* Content: cards arranged inside */}
        <div className="relative z-10 w-full h-full flex flex-col justify-between py-6">
          {children}
        </div>
      </div>
    </div>
  );
};

