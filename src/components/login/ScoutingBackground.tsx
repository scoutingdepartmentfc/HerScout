"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Animated login background: a women's football match seen from a broadcast camera with player tracking.
 * Simple simulation in pitch metres (105 x 68): both teams shift with the ball, the team in possession passes,
 * possession changes hands, and one "target" player is tracked with her live speed, distance, sprints and heatmap.
 * Respects prefers-reduced-motion (draws a still frame) and pauses while the tab is hidden.
 */

const L = 105;
const W = 68;
const SPRINT_MS = 5.5; // 19.8 km/h

type Jugadora = {
  equipo: 0 | 1;
  base: [number, number];
  x: number; y: number; vx: number; vy: number;
  fase: number; dorsal: number; portera: boolean;
};

// Team 0 (HerScout blue) attacks +x in a 4-3-3; team 1 attacks -x in a 4-4-2
const FORMACIONES: [number, number][][] = [
  [[5, 34], [20, 10], [18, 26], [18, 42], [20, 58], [36, 20], [33, 34], [36, 48], [52, 12], [55, 34], [52, 56]],
  [[5, 34], [20, 10], [18, 27], [18, 41], [20, 58], [38, 12], [36, 28], [36, 40], [38, 56], [52, 27], [52, 41]],
];
const DORSALES = [[1, 2, 4, 5, 3, 8, 6, 10, 11, 9, 7], [1, 2, 4, 5, 3, 7, 8, 6, 11, 9, 10]];
const OBJETIVO = 10; // team 0, right winger (#7)

function crearJugadoras(): Jugadora[] {
  const js: Jugadora[] = [];
  FORMACIONES.forEach((f, equipo) =>
    f.forEach(([bx, by], i) => {
      const x = equipo === 0 ? bx : L - bx;
      const y = equipo === 0 ? by : W - by;
      js.push({ equipo: equipo as 0 | 1, base: [x, y], x, y, vx: 0, vy: 0, fase: Math.random() * 100,
                dorsal: DORSALES[equipo][i], portera: i === 0 });
    }));
  return js;
}

export function ScoutingBackground({ onStats }: { onStats?: (s: { minuto: string }) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let ancho = 0, alto = 0, dpr = 1;
    const redimensionar = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      ancho = canvas.clientWidth;
      alto = canvas.clientHeight;
      canvas.width = Math.round(ancho * dpr);
      canvas.height = Math.round(alto * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    redimensionar();
    window.addEventListener("resize", redimensionar);

    // Heatmap blob sprite (drawn scaled per position)
    const blob = document.createElement("canvas");
    blob.width = blob.height = 64;
    const bctx = blob.getContext("2d")!;
    const grad = bctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(59,130,246,0.55)");
    grad.addColorStop(0.5, "rgba(56,189,248,0.18)");
    grad.addColorStop(1, "rgba(56,189,248,0)");
    bctx.fillStyle = grad;
    bctx.fillRect(0, 0, 64, 64);

    const js = crearJugadoras();
    const balon = { x: 52, y: 34, h: 0, de: 9, a: -1, t: 0, dur: 1, x0: 0, y0: 0, x1: 0, y1: 0, espera: 1.2 };
    let posesion: 0 | 1 = 0;
    let pasesRestantes = 6;
    const estela: [number, number][] = [];
    const calor: [number, number][] = [];
    const pases: { x0: number; y0: number; x1: number; y1: number; vida: number }[] = [];
    let distancia = 3412; // metres already covered "this match"
    let sprints = 14;
    let esprintando = false;
    let reloj = 61 * 60 + 23;
    let tiempo = 0;
    let muestreo = 0;

    // Broadcast camera: perspective onto a trapezoid with a slow pan
    const proyectar = (x: number, y: number) => {
      const d = 1 - y / W; // 0 = near touchline, 1 = far
      const s = 1 / (1 + d * 1.55);
      const pan = Math.sin(tiempo * 0.05) * 6 + (balon.x - L / 2) * 0.18;
      const cx = ancho / 2;
      const mitad = Math.max(ancho * 0.72, 640);
      const sx = cx + ((x - L / 2 - pan) / (L / 2)) * mitad * s;
      const horizonte = -alto * 0.5;
      const sy = horizonte + (alto * 1.12 - horizonte) * s;
      return { sx, sy, s };
    };

    const elegirReceptor = (de: number) => {
      const p = js[de];
      const dir = p.equipo === 0 ? 1 : -1;
      const opciones = js
        .map((q, i) => ({ q, i }))
        .filter(({ q, i }) => i !== de && q.equipo === p.equipo && !q.portera)
        .map(({ q, i }) => {
          const dist = Math.hypot(q.x - p.x, q.y - p.y);
          const avance = (q.x - p.x) * dir;
          let peso = dist < 7 || dist > 40 ? 0.05 : 1;
          peso *= avance > 0 ? 1 + avance / 15 : 0.6;
          if (i === OBJETIVO) peso *= 1.8; // the target gets the ball often
          return { i, peso };
        });
      const total = opciones.reduce((a, o) => a + o.peso, 0);
      let r = Math.random() * total;
      for (const o of opciones) {
        r -= o.peso;
        if (r <= 0) return o.i;
      }
      return opciones[0].i;
    };

    const pasar = () => {
      const de = balon.de;
      let a: number;
      if (pasesRestantes <= 0) {
        // Turnover: the nearest opponent intercepts
        const p = js[de];
        a = js.reduce((m, q, i) => (q.equipo !== p.equipo && !q.portera &&
          Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(js[m].x - p.x, js[m].y - p.y) ? i : m),
          js.findIndex((q) => q.equipo !== p.equipo && !q.portera));
        posesion = js[a].equipo;
        pasesRestantes = 4 + Math.floor(Math.random() * 6);
      } else {
        a = elegirReceptor(de);
        pasesRestantes--;
      }
      const r = js[a];
      balon.x0 = balon.x; balon.y0 = balon.y;
      balon.x1 = r.x + r.vx * 0.6; balon.y1 = r.y + r.vy * 0.6;
      const dist = Math.hypot(balon.x1 - balon.x0, balon.y1 - balon.y0);
      balon.dur = Math.min(1.7, Math.max(0.45, dist / 17));
      balon.t = 0;
      balon.a = a;
      pases.push({ x0: balon.x0, y0: balon.y0, x1: balon.x1, y1: balon.y1, vida: 1 });
    };

    const paso = (dt: number) => {
      tiempo += dt;
      reloj += dt;

      // Ball: in flight or at the feet of its owner
      if (balon.a >= 0) {
        balon.t += dt / balon.dur;
        const t = Math.min(1, balon.t);
        const e = 1 - Math.pow(1 - t, 2);
        balon.x = balon.x0 + (balon.x1 - balon.x0) * e;
        balon.y = balon.y0 + (balon.y1 - balon.y0) * e;
        const largo = Math.hypot(balon.x1 - balon.x0, balon.y1 - balon.y0);
        balon.h = largo > 25 ? Math.sin(t * Math.PI) * largo * 0.12 : 0;
        if (t >= 1) {
          balon.de = balon.a;
          balon.a = -1;
          balon.h = 0;
          balon.espera = 0.7 + Math.random() * 1.6;
        }
      } else {
        const p = js[balon.de];
        const dir = p.equipo === 0 ? 1 : -1;
        balon.x = p.x + dir * 0.8;
        balon.y = p.y + 0.3;
        balon.espera -= dt;
        if (balon.espera <= 0) pasar();
      }

      // Players: spring towards a target that follows the team block, the ball and a personal drift
      for (let i = 0; i < js.length; i++) {
        const p = js[i];
        const dir = p.equipo === 0 ? 1 : -1;
        const ataca = posesion === p.equipo;
        const factor = p.portera ? 0.08 : 0.42;
        let tx = p.base[0] + (balon.x - L / 2) * factor + (p.portera ? 0 : (ataca ? 9 : -5) * dir);
        let ty = p.base[1] + (balon.y - W / 2) * (p.portera ? 0.12 : 0.28);
        tx += Math.sin(tiempo * 0.37 + p.fase) * 2.2 + Math.sin(tiempo * 0.91 + p.fase * 2) * 1.1;
        ty += Math.cos(tiempo * 0.29 + p.fase) * 2.4;
        // Nearest defender presses the ball
        if (!ataca && !p.portera && Math.hypot(p.x - balon.x, p.y - balon.y) < 9) {
          tx += (balon.x - p.x) * 0.5;
          ty += (balon.y - p.y) * 0.5;
        }
        // The target makes runs in behind when her team has the ball
        if (i === OBJETIVO && ataca && Math.sin(tiempo * 0.23) > 0.55) tx += 14;
        tx = Math.min(L - 1.5, Math.max(1.5, tx));
        ty = Math.min(W - 1.5, Math.max(1.5, ty));
        p.vx += ((tx - p.x) * 1.9 - p.vx * 2.4) * dt;
        p.vy += ((ty - p.y) * 1.9 - p.vy * 2.4) * dt;
        const v = Math.hypot(p.vx, p.vy);
        const max = i === OBJETIVO ? 8.6 : 7.8;
        if (v > max) { p.vx *= max / v; p.vy *= max / v; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      // Target tracking
      const o = js[OBJETIVO];
      const v = Math.hypot(o.vx, o.vy);
      distancia += v * dt;
      if (v > SPRINT_MS && !esprintando) { sprints++; esprintando = true; }
      if (v < SPRINT_MS - 0.8) esprintando = false;
      muestreo += dt;
      if (muestreo > 0.12) {
        muestreo = 0;
        estela.push([o.x, o.y]);
        if (estela.length > 40) estela.shift();
        calor.push([o.x, o.y]);
        if (calor.length > 420) calor.shift();
      }
      for (const ps of pases) ps.vida -= dt * 0.55;
      while (pases.length && pases[0].vida <= 0) pases.shift();
    };

    const linea = (pts: [number, number][], cerrar = false) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const { sx, sy } = proyectar(x, y);
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      if (cerrar) ctx.closePath();
      ctx.stroke();
    };

    const arco = (cx: number, cy: number, r: number, a0: number, a1: number) => {
      const pts: [number, number][] = [];
      for (let k = 0; k <= 40; k++) {
        const a = a0 + ((a1 - a0) * k) / 40;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      linea(pts);
    };

    const dibujarCampo = () => {
      // Grass with mowing stripes
      for (let k = 0; k < 14; k++) {
        const x0 = (L / 14) * k, x1 = (L / 14) * (k + 1);
        const a = proyectar(x0, 0), b = proyectar(x1, 0), c = proyectar(x1, W), d = proyectar(x0, W);
        ctx.fillStyle = k % 2 ? "rgba(20,64,50,0.75)" : "rgba(15,52,42,0.75)";
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(226,232,240,0.3)";
      ctx.lineWidth = 1.2;
      linea([[0, 0], [L, 0], [L, W], [0, W]], true);
      linea([[L / 2, 0], [L / 2, W]]);
      arco(L / 2, W / 2, 9.15, 0, Math.PI * 2);
      for (const lado of [0, 1]) {
        const x = (v: number) => (lado ? L - v : v);
        linea([[x(0), 13.84], [x(16.5), 13.84], [x(16.5), 54.16], [x(0), 54.16]]);
        linea([[x(0), 24.84], [x(5.5), 24.84], [x(5.5), 43.16], [x(0), 43.16]]);
        arco(x(11), W / 2, 9.15, lado ? Math.PI - 0.93 : -0.93, lado ? Math.PI + 0.93 : 0.93);
      }
    };

    const dibujar = () => {
      ctx.clearRect(0, 0, ancho, alto);
      dibujarCampo();

      // Heatmap of the target
      ctx.globalCompositeOperation = "lighter";
      for (const [x, y] of calor) {
        const { sx, sy, s } = proyectar(x, y);
        const r = 26 * s * (ancho / 1400 + 0.6);
        ctx.globalAlpha = 0.16;
        ctx.drawImage(blob, sx - r, sy - r * 0.6, r * 2, r * 1.2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // Recent passes
      for (const ps of pases) {
        const a = proyectar(ps.x0, ps.y0), b = proyectar(ps.x1, ps.y1);
        ctx.strokeStyle = `rgba(147,197,253,${0.35 * ps.vida})`;
        ctx.setLineDash([5, 6]);
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }
      ctx.setLineDash([]);

      // Target trail
      if (estela.length > 1) {
        for (let k = 1; k < estela.length; k++) {
          const a = proyectar(...estela[k - 1]), b = proyectar(...estela[k]);
          ctx.strokeStyle = `rgba(56,189,248,${(k / estela.length) * 0.8})`;
          ctx.lineWidth = 2.2 * b.s;
          ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        }
      }

      // Players, far ones first
      const orden = js.map((p, i) => i).sort((a, b) => js[a].y - js[b].y);
      for (const i of orden) {
        const p = js[i];
        const { sx, sy, s } = proyectar(p.x, p.y);
        const r = Math.max(2.5, 7.5 * s * (ancho / 1600 + 0.55));
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath(); ctx.ellipse(sx, sy + r * 0.3, r * 1.1, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
        const color = p.equipo === 0 ? (p.portera ? "#facc15" : "#3b82f6") : (p.portera ? "#f97316" : "#e2e8f0");
        ctx.fillStyle = color;
        ctx.shadowColor = p.equipo === 0 ? "rgba(59,130,246,0.8)" : "rgba(226,232,240,0.35)";
        ctx.shadowBlur = 10 * s;
        ctx.beginPath(); ctx.arc(sx, sy - r * 0.4, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (r > 5) {
          ctx.fillStyle = p.equipo === 0 ? "#eff6ff" : "#0f172a";
          ctx.font = `600 ${Math.round(r * 0.95)}px ui-sans-serif, system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(p.dorsal), sx, sy - r * 0.4 + 0.5);
        }
      }

      // Ball (with shadow when it is in the air)
      {
        const { sx, sy, s } = proyectar(balon.x, balon.y);
        const r = Math.max(1.8, 3.6 * s * (ancho / 1600 + 0.55));
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath(); ctx.ellipse(sx, sy, r * 1.2, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "rgba(255,255,255,0.9)";
        ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(sx, sy - r - balon.h * 6 * s, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Target lock-on and live data tag
      const o = js[OBJETIVO];
      const { sx, sy, s } = proyectar(o.x, o.y);
      const pulso = (tiempo * 1.2) % 1;
      const R = 22 * s * (ancho / 1600 + 0.6);
      ctx.strokeStyle = "rgba(56,189,248,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(sx, sy, R, R * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(56,189,248,${0.6 * (1 - pulso)})`;
      ctx.beginPath(); ctx.ellipse(sx, sy, R * (1 + pulso * 0.9), R * 0.42 * (1 + pulso * 0.9), 0, 0, Math.PI * 2); ctx.stroke();

      const kmh = Math.hypot(o.vx, o.vy) * 3.6;
      const tx = Math.min(ancho - 190, Math.max(12, sx + 26));
      const ty = Math.max(70, sy - 120);
      ctx.strokeStyle = "rgba(56,189,248,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, sy - R * 0.5); ctx.lineTo(sx + 10, ty + 62); ctx.lineTo(tx, ty + 62); ctx.stroke();
      ctx.fillStyle = "rgba(7,12,24,0.78)";
      ctx.strokeStyle = "rgba(56,189,248,0.45)";
      ctx.beginPath(); ctx.roundRect(tx, ty, 176, 66, 8); ctx.fill(); ctx.stroke();
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#38bdf8";
      ctx.font = "700 10px ui-sans-serif, system-ui";
      ctx.fillText("TARGET  #7 · RIGHT WING", tx + 10, ty + 17);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "700 20px ui-sans-serif, system-ui";
      ctx.fillText(kmh.toFixed(1), tx + 10, ty + 42);
      const anchoVel = ctx.measureText(kmh.toFixed(1)).width;
      ctx.fillStyle = "#94a3b8";
      ctx.font = "500 10px ui-sans-serif, system-ui";
      ctx.fillText("km/h", tx + 14 + anchoVel, ty + 42);
      ctx.fillText(`DIST ${(distancia / 1000).toFixed(2)} km   SPRINTS ${sprints}`, tx + 10, ty + 58);
      if (kmh > SPRINT_MS * 3.6) {
        ctx.fillStyle = "#f43f5e";
        ctx.font = "700 9px ui-sans-serif, system-ui";
        ctx.fillText("SPRINT", tx + 128, ty + 42);
      }
    };

    let raf = 0;
    let previo = performance.now();
    let ultimoMinuto = "";
    const bucle = (ahora: number) => {
      const dt = Math.min(0.05, (ahora - previo) / 1000);
      previo = ahora;
      paso(dt);
      dibujar();
      const m = `${Math.floor(reloj / 60)}:${String(Math.floor(reloj % 60)).padStart(2, "0")}`;
      if (m !== ultimoMinuto) { ultimoMinuto = m; onStats?.({ minuto: m }); }
      raf = requestAnimationFrame(bucle);
    };

    if (reducido) {
      for (let k = 0; k < 600; k++) paso(1 / 30);
      dibujar();
    } else {
      raf = requestAnimationFrame(bucle);
    }
    const visibilidad = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reducido) {
        previo = performance.now();
        raf = requestAnimationFrame(bucle);
      }
    };
    document.addEventListener("visibilitychange", visibilidad);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", redimensionar);
      document.removeEventListener("visibilitychange", visibilidad);
    };
  }, [onStats]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}

/** Full-screen static background with atmospheric lighting and stadium mood. */
export function LoginBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#050a14]" aria-hidden="true">
      {/* High-resolution static women's football scouting photo without text */}
      <img
        src="/login-bg.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center scale-105 select-none pointer-events-none"
      />
      {/* Subtle darkening vignette only at the edges to leave the center transparent */}
      <div className="pointer-events-none absolute inset-0 bg-black/25" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(5,10,20,0.65)_100%)]" />
    </div>
  );
}
