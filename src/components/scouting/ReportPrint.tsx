"use client";

import React from "react";
import { ScoutingReport } from "@/lib/reports";
import { POS_VERTICAL } from "@/components/scouting/PosicionesVertical";

/**
 * Scouting report for PDF export, laid out like a Football Manager player overview:
 * A4 landscape, dark panels, English only. Print-only (hidden on screen).
 * `player` is the /api/players/[id] payload (season stats, match log, positions); optional.
 */

const C = {
  bg: "#1c0a2c",
  panel: "#2c1043",
  panel2: "#381556",
  line: "rgba(255,255,255,0.09)",
  text: "#f5f0fa",
  muted: "#b9a6cc",
  accent: "#ff2d55",
  green: "#22c55e",
  red: "#ef233c",
  amber: "#f59e0b",
  lime: "#a3e635",
};

const LABELS: Record<string, string> = {
  technical: "Technical", tactical: "Tactical", physical: "Physical", psychological: "Mental",
  low: "Low", medium: "Medium", high: "High", definitive: "Definitive",
  sign_tier_a: "Sign – Tier A", monitor_tier_b: "Monitor – Tier B", depth_tier_c: "Squad depth – Tier C", pass: "Pass",
  full_scouting: "Full scouting", match_observation: "Match observation", live_scouting: "Live scouting",
  opposition_analysis: "Opposition analysis", follow_up: "Follow-up",
};

// Pipeline / Opta positions are stored in Spanish: English name + short code
const POS_EN: Record<string, [string, string]> = {
  Portero: ["Goalkeeper", "GK"], "Lateral Derecho": ["Right-Back", "RB"], "Central Derecho": ["Centre-Back (R)", "CB"],
  "Central Izquierdo": ["Centre-Back (L)", "CB"], "Lateral Izquierdo": ["Left-Back", "LB"],
  "Mediocentro Defensivo": ["Defensive Midfielder", "DM"], Mediocentro: ["Central Midfielder", "CM"],
  Centrocampista: ["Central Midfielder", "CM"], Mediapunta: ["Attacking Midfielder", "AM"],
  "Extremo Derecho": ["Right Winger", "RW"], "Extremo Izquierdo": ["Left Winger", "LW"],
  Delantero: ["Striker", "ST"], Delantera: ["Striker", "ST"],
  Defensa: ["Defender", "D"], Centrocampistas: ["Midfielder", "M"], Portera: ["Goalkeeper", "GK"],
};
const posName = (p?: string | null) => (p ? POS_EN[p]?.[0] ?? p : "—");
const posCode = (p: string) => POS_EN[p]?.[1] ?? p.slice(0, 3).toUpperCase();

// Scout position picks ("Right Winger (RW)") → pitch coordinates key
const SCOUT_POS_KEY: Record<string, string> = { GK: "GK", RB: "RB", LB: "LB", CB: "CB", DMF: "CDM", CM: "CM", CAM: "CAM", RW: "RW", LW: "LW", "ST/CF": "ST" };
const scoutPosKey = (label: string) => SCOUT_POS_KEY[label.match(/\(([^)]+)\)/)?.[1] ?? ""] ?? null;
const scoutPosCode = (label: string) => label.match(/\(([^)]+)\)/)?.[1]?.replace("ST/CF", "ST") ?? label;

const t = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—"
    : LABELS[String(v)] ?? String(v).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const date = (v?: string | null, short = false) => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v
    : d.toLocaleDateString("en-GB", short ? { day: "2-digit", month: "short", year: "2-digit" } : { day: "2-digit", month: "short", year: "numeric" });
};
const ageFrom = (birth?: string | null) => {
  if (!birth) return null;
  const b = new Date(birth);
  if (isNaN(b.getTime())) return null;
  const n = new Date();
  return n.getFullYear() - b.getFullYear() - (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
};
const money = (v?: number | null) =>
  v == null || !Number.isFinite(Number(v)) ? "—"
    : Number(v) >= 1e6 ? `€${(Number(v) / 1e6).toFixed(Number(v) >= 1e7 ? 0 : 1)}M`
    : Number(v) >= 1e3 ? `€${Math.round(Number(v) / 1e3)}K` : `€${v}`;
const foot = (v?: string | null) => {
  if (!v) return "—";
  const s = v.toLowerCase();
  if (s.startsWith("der") || s.startsWith("right")) return "Right";
  if (s.startsWith("izq") || s.startsWith("left")) return "Left";
  if (s.startsWith("amb") || s.startsWith("both")) return "Both";
  return t(v);
};

/** Colour for a 0–10 rating */
const tone = (v: number | null | undefined) =>
  v == null ? C.muted : v >= 8 ? C.green : v >= 6.5 ? C.lime : v >= 5 ? C.amber : C.red;

function Panel({ title, children, style, headColor }: { title?: string; children: React.ReactNode; style?: React.CSSProperties; headColor?: string }) {
  return (
    <div className="fmr-panel" style={style}>
      {title && (
        <div className="fmr-head" style={headColor ? { background: headColor, color: "#fff", margin: "-8px -10px 8px", padding: "6px 10px", borderRadius: "4px 4px 0 0" } : undefined}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="fmr-row">
      <span style={{ color: C.muted }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{v}</span>
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <svg key={i} width="14" height="14" viewBox="0 0 24 24">
            <defs>
              <linearGradient id={`st${i}`}>
                <stop offset={`${fill * 100}%`} stopColor="#facc15" />
                <stop offset={`${fill * 100}%`} stopColor="rgba(255,255,255,0.18)" />
              </linearGradient>
            </defs>
            <path fill={`url(#st${i})`} d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.6 7L12 17.5 5.8 21.2l1.6-7L2 9.5l7.1-.6z" />
          </svg>
        );
      })}
    </span>
  );
}

/** FM-style attribute polygon for the four scout categories (0–10) */
function Radar({ ratings }: { ratings: [string, number | null][] }) {
  const n = ratings.length;
  const cx = 90, cy = 64, R = 42;
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const ring = (f: number) => ratings.map((_, i) => pt(i, R * f).join(",")).join(" ");
  const shape = ratings.map(([, v], i) => pt(i, R * ((v ?? 0) / 10)).join(",")).join(" ");
  return (
    <svg viewBox="0 0 180 128" style={{ width: "100%", height: 128 }}>
      {[1, 0.75, 0.5, 0.25].map((f, i) => (
        <polygon key={f} points={ring(f)} fill={["#15803d", "#65a30d", "#d97706", "#dc2626"][i]} opacity={0.85} />
      ))}
      <polygon points={shape} fill="rgba(255,255,255,0.18)" stroke="#fff" strokeWidth={1.2} />
      {ratings.map(([k, v], i) => {
        const [x, y] = pt(i, R + 5);
        const anchor = Math.abs(x - cx) < 1 ? "middle" : x > cx ? "start" : "end";
        const dy = y < cy - 1 ? -2 : y > cy + 1 ? 8 : 3;
        return (
          <text key={k} x={x} y={y + dy} textAnchor={anchor} fontSize={8} fill={C.text} fontWeight={700}>
            {t(k)} <tspan fill={tone(v)}>{v != null ? v.toFixed(1) : "N/A"}</tspan>
          </text>
        );
      })}
    </svg>
  );
}

/** Horizontal FM-style pitch: scout's best (ringed green), secondary (green), only played (orange); label shows % of minutes played */
function Pitch({ played, best, secondary }: { played: Record<string, { min: number }>; best: string[]; secondary: string[] }) {
  const total = Object.values(played).reduce((a, b) => a + (b.min || 0), 0) || 1;
  // vertical (x 0-68, y 0-105, attack at top) → horizontal, attacking right
  type Spot = { x: number; y: number; code: string; pct: number; scout: 0 | 1 | 2 };
  const spots = new Map<string, Spot>();
  const spot = (key: string, code: string) => {
    const p = POS_VERTICAL[key];
    if (!p) return null;
    const id = `${p[0]},${p[1]}`;
    if (!spots.has(id)) spots.set(id, { x: 105 - p[1], y: p[0], code, pct: 0, scout: 0 });
    return spots.get(id)!;
  };
  for (const [k, { min }] of Object.entries(played)) {
    const sp = spot(k, posCode(k));
    if (sp) sp.pct += Math.round((min / total) * 100);
  }
  for (const [list, lvl] of [[secondary, 1], [best, 2]] as const) {
    for (const label of list) {
      const key = scoutPosKey(label);
      const sp = key ? spot(key, scoutPosCode(label)) : null;
      if (sp) { sp.scout = Math.max(sp.scout, lvl) as 1 | 2; sp.code = scoutPosCode(label); }
    }
  }
  const shown = Array.from(spots.values()).filter((sp) => sp.scout || sp.pct >= 3);
  return (
    <svg viewBox="0 0 105 68" style={{ width: "100%", display: "block", background: "#241036", borderRadius: 4 }}>
      <g fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={0.5}>
        <rect x="2" y="2" width="101" height="64" />
        <line x1="52.5" y1="2" x2="52.5" y2="66" />
        <circle cx="52.5" cy="34" r="9.15" />
        <rect x="2" y="13.84" width="16.5" height="40.32" />
        <rect x="86.5" y="13.84" width="16.5" height="40.32" />
        <rect x="2" y="24.84" width="5.5" height="18.32" />
        <rect x="97.5" y="24.84" width="5.5" height="18.32" />
      </g>
      {shown.map((sp) => (
        <g key={`${sp.x},${sp.y}`}>
          {sp.scout === 2 && <circle cx={sp.x} cy={sp.y} r={5} fill="none" stroke="#fff" strokeWidth={0.8} />}
          <circle cx={sp.x} cy={sp.y} r={3.4} fill={sp.scout ? C.green : C.amber} stroke="rgba(0,0,0,0.4)" strokeWidth={0.4} />
          <text x={sp.x} y={sp.y - 6} textAnchor="middle" fontSize={3.6} fill="#fff" fontWeight={800}>{sp.code}</text>
          {sp.pct > 0 && <text x={sp.x} y={sp.y + 8.2} textAnchor="middle" fontSize={3.2} fill={C.muted} fontWeight={700}>{sp.pct}%</text>}
        </g>
      ))}
      {shown.length === 0 && <text x="52.5" y="35" textAnchor="middle" fontSize={4} fill={C.muted}>No position data</text>}
    </svg>
  );
}

function Chips({ items, color }: { items: string[]; color: string }) {
  if (!items.length) return <div style={{ color: C.muted }}>—</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {items.map((i, n) => (
        <span key={n} style={{ border: `1px solid ${color}`, color: "#fff", background: `${color}33`, borderRadius: 999, padding: "1px 7px", fontSize: 9, fontWeight: 600 }}>
          {i}
        </span>
      ))}
    </div>
  );
}

export function ReportPrint({ report: r, clubName, player: data }: { report: ScoutingReport; clubName?: string; player?: any }) {
  const s = r.spondaData || {};
  const p = data?.player || {};
  const ratings = (["technical", "tactical", "physical", "psychological"] as const).map(
    (k) => [k, r.ratings?.[k] ?? null] as [string, number | null]
  );
  const age = r.playerAge ?? ageFrom(p.birthDate || r.playerBirthDate);
  const stars = s.ratingStars ?? (r.overallRating != null ? Math.round(r.overallRating) / 2 : null);
  const photo = r.playerPhotoUrl || p.photoUrl;
  const badge = r.playerClubBadgeUrl || p.badgeUrl;
  const club = r.playerClub || p.teamName;
  const mainPos = posName(r.primaryPosition || p.primaryPosition);
  const otherPos = [...(s.bestPosition || []), ...(s.secondaryPositions || [])].map(scoutPosCode);

  // Latest season (all competitions of it), latest first from the API
  const seasons: any[] = (data?.seasonStats || []).filter((x: any) => !x.esTotal);
  const lastName = seasons[0]?.seasons?.name;
  const lastSeason = lastName ? seasons.filter((x) => x.seasons?.name === lastName) : [];
  const sum = (k: string) => lastSeason.reduce((n, x) => n + (Number(x[k]) || 0), 0);
  const weighted = (k: string) => {
    const rows = lastSeason.filter((x) => x[k] != null && !x.sinNotas);
    const w = rows.reduce((n, x) => n + (Number(x.minutes_played) || 0), 0);
    return w > 0 ? rows.reduce((n, x) => n + Number(x[k]) * (Number(x.minutes_played) || 0), 0) / w : null;
  };
  const note = (v: any) => (v == null ? "—" : Math.round(Number(v)));
  const per90 = (v: number, mins: number) => (mins > 0 ? ((v / mins) * 90).toFixed(2) : "—");

  const matches: any[] = (data?.matchLog || []).slice(0, 7);
  const pros = [...(r.strengths || []), ...(s.specialities || []), ...(s.tecTacTags || [])];
  const cons = [...(r.weaknesses || []), ...(s.debilities || [])];

  const statCols = ["Apps", "Mins", "Gls", "Ast", "G+A/90", "Rating", "Attack", "Build-up", "Defence", "Set pieces"];

  return (
    <div className="fmr hidden print:block">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4 landscape; margin: 7mm; }
          html, body { background: ${C.bg} !important; color: ${C.text} !important; }
        }
        .fmr { background: ${C.bg}; color: ${C.text}; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 10px; line-height: 1.35; }
        .fmr * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .fmr-panel { background: ${C.panel}; border-radius: 4px; padding: 8px 10px; break-inside: avoid; page-break-inside: avoid; }
        .fmr-head { font-size: 9.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: ${C.text}; margin-bottom: 6px; }
        .fmr-row { display: flex; justify-content: space-between; gap: 8px; padding: 2.5px 0; border-bottom: 1px solid ${C.line}; }
        .fmr-row:last-child { border-bottom: 0; }
        .fmr-tbl { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
        .fmr-tbl th { font-size: 8px; font-weight: 700; color: ${C.muted}; text-transform: uppercase; letter-spacing: .04em; text-align: right; padding: 2px 4px; white-space: nowrap; }
        .fmr-tbl td { text-align: right; padding: 3px 4px; border-top: 1px solid ${C.line}; }
        .fmr-tbl th:first-child, .fmr-tbl td:first-child { text-align: left; }
        .fmr-tbl tbody tr:nth-child(odd) td { background: rgba(255,255,255,0.03); }
        .fmr-label { font-size: 8.5px; text-transform: uppercase; letter-spacing: .06em; color: ${C.muted}; font-weight: 700; margin-bottom: 2px; }
      ` }} />

      {/* Title bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.panel2, borderRadius: 4, padding: "8px 12px", marginBottom: 8 }}>
        {badge && <img src={badge} alt="" style={{ height: 34, width: 34, objectFit: "contain" }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: ".02em", textTransform: "uppercase" }}>
            {p.shirtNumber ? `${p.shirtNumber}. ` : ""}{r.playerName}
          </div>
          <div style={{ color: C.muted, fontSize: 10.5 }}>
            {mainPos}{otherPos.length ? ` / ${Array.from(new Set(otherPos)).join(", ")}` : ""} — {t(club)}
            {p.leagueName ? ` · ${p.leagueName}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 9.5, color: C.muted }}>
          <div style={{ fontWeight: 800, color: C.text, letterSpacing: ".1em" }}>SCOUTING REPORT{clubName ? ` · ${clubName.toUpperCase()}` : ""}</div>
          <div>{t(r.reportType)} · Observed {date(r.observationDate)}</div>
          <div>Scout: {t(r.scoutName || s.scoutName || r.authorName)}</div>
        </div>
        <div style={{ background: C.accent, color: "#fff", fontWeight: 800, borderRadius: 4, padding: "8px 12px", textTransform: "uppercase", fontSize: 11, letterSpacing: ".05em", textAlign: "center" }}>
          {s.scoutDecision || t(r.recommendation)}
        </div>
      </div>

      {/* Row 1: info · photo · scout rating · pros · cons */}
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr 1.15fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <Panel>
          <Row k="Nationality" v={t(r.playerCountry || p.country)} />
          <Row k="Age" v={`${date(r.playerBirthDate || p.birthDate)}${age != null ? ` (${age})` : ""}`} />
          <Row k="Height / Weight" v={`${p.height ? `${p.height} cm` : "—"} / ${p.weight ? `${p.weight} kg` : "—"}`} />
          <Row k="Preferred foot" v={foot(p.preferredFoot)} />
          <Row k="Market value" v={money(p.marketValue)} />
          <Row k="Contract until" v={date(p.contractUntil)} />
          <Row k="Club status" v={t(s.clubsStatus)} />
          <Row k="Transfer risk" v={t(s.transferRisk)} />
        </Panel>

        <div className="fmr-panel" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, position: "relative", background: "linear-gradient(180deg,#43195f,#2c1043)", minHeight: 120 }}>
            {badge && <img src={badge} alt="" style={{ position: "absolute", left: 8, top: 8, height: 30, width: 30, objectFit: "contain" }} />}
            {photo && <img src={photo} alt="" style={{ position: "absolute", inset: 0, margin: "auto", height: "100%", width: "100%", objectFit: "contain", objectPosition: "bottom" }} />}
          </div>
          <div style={{ background: C.accent, color: "#fff", textAlign: "center", fontWeight: 800, fontSize: 11, padding: "6px 4px", textTransform: "uppercase" }}>
            {r.playerName}
          </div>
        </div>

        <Panel title="Scout rating">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: tone(r.overallRating), lineHeight: 1 }}>
              {r.overallRating != null ? r.overallRating.toFixed(1) : "—"}
              <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}> /10</span>
            </div>
            <div>
              {stars != null && <Stars value={stars} />}
              <div style={{ color: C.muted, fontSize: 9 }}>Confidence: {t(r.confidence)}</div>
            </div>
          </div>
          <Radar ratings={ratings} />
        </Panel>

        <Panel title="Pros" headColor={C.green}>
          <Chips items={pros.slice(0, 12)} color={C.green} />
          {s.pros && <p style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{s.pros}</p>}
        </Panel>

        <Panel title="Cons" headColor={C.red}>
          <Chips items={cons.slice(0, 12)} color={C.red} />
          {s.cons && <p style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{s.cons}</p>}
        </Panel>
      </div>

      {/* Row 2: positions · profile · season stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr 2.85fr", gap: 8, marginBottom: 8 }}>
        <Panel title="Positions">
          <Pitch played={p.positionsMap || {}} best={s.bestPosition || []} secondary={s.secondaryPositions || []} />
          <div style={{ display: "flex", gap: 10, marginTop: 5, fontSize: 8.5, color: C.muted }}>
            <span><b style={{ color: C.green }}>●</b> Scout pick</span>
            <span><b style={{ color: C.amber }}>●</b> Played (% mins)</span>
          </div>
        </Panel>

        <Panel title="Profile">
          <Row k="Role" v={t(s.role)} />
          <Row k="Player type" v={t(s.typeOfPlayer)} />
          <Row k="Positional profile" v={t(s.positionalProfile)} />
          <Row k="Reputation" v={`${t(s.reputation)} → ${t(s.reputationPotential)}`} />
          <Row k="Potential" v={t(s.developmentPotential)} />
          <Row k="Scouting status" v={t(s.scoutingStatus)} />
          <Row k="Recommendation" v={t(r.recommendation)} />
        </Panel>

        <Panel title={`Season stats${lastName ? ` · ${lastName}` : ""}`}>
          {lastSeason.length ? (
            <table className="fmr-tbl">
              <thead>
                <tr><th>Competition</th>{statCols.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {lastSeason.map((x) => {
                  const mins = Number(x.minutes_played) || 0;
                  return (
                    <tr key={x.id}>
                      <td>{x.competitions?.name || "—"}</td>
                      <td>{x.matches_played ?? 0}</td>
                      <td>{mins}</td>
                      <td>{x.goals ?? 0}</td>
                      <td>{x.assists ?? 0}</td>
                      <td>{per90((Number(x.goals) || 0) + (Number(x.assists) || 0), mins)}</td>
                      <td style={{ fontWeight: 800, color: tone(x.nota_global != null ? x.nota_global / 10 : null) }}>{note(x.nota_global)}</td>
                      <td>{note(x.nota_ataque)}</td>
                      <td>{note(x.nota_construccion)}</td>
                      <td>{note(x.nota_defensa)}</td>
                      <td>{note(x.nota_balon_parado)}</td>
                    </tr>
                  );
                })}
                {lastSeason.length > 1 && (
                  <tr style={{ fontWeight: 800 }}>
                    <td>Overall</td>
                    <td>{sum("matches_played")}</td>
                    <td>{sum("minutes_played")}</td>
                    <td>{sum("goals")}</td>
                    <td>{sum("assists")}</td>
                    <td>{per90(sum("goals") + sum("assists"), sum("minutes_played"))}</td>
                    <td style={{ color: tone(weighted("nota_global") != null ? weighted("nota_global")! / 10 : null) }}>{note(weighted("nota_global"))}</td>
                    <td>{note(weighted("nota_ataque"))}</td>
                    <td>{note(weighted("nota_construccion"))}</td>
                    <td>{note(weighted("nota_defensa"))}</td>
                    <td>{note(weighted("nota_balon_parado"))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <div style={{ color: C.muted, padding: "18px 0", textAlign: "center" }}>No season data available</div>
          )}
          <div style={{ marginTop: 4, fontSize: 8, color: C.muted }}>Ratings on a 0–100 scale (Opta data model).</div>
        </Panel>
      </div>

      {/* Row 3: last matches · scout assessment */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Panel title="Last matches">
          {matches.length ? (
            <table className="fmr-tbl">
              <thead>
                <tr><th>Date</th><th style={{ textAlign: "left" }}>Opponent</th><th style={{ textAlign: "left" }}>Comp</th><th>Result</th><th>Pos</th><th>Min</th><th>G</th><th>A</th><th>Rating</th></tr>
              </thead>
              <tbody>
                {matches.map((m) => {
                  const res = m.goalsFor == null || m.goalsAgainst == null ? null : m.goalsFor > m.goalsAgainst ? "W" : m.goalsFor < m.goalsAgainst ? "L" : "D";
                  return (
                    <tr key={m.matchId}>
                      <td>{date(m.date, true)}</td>
                      <td style={{ textAlign: "left" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {m.opponent?.badgeUrl && <img src={m.opponent.badgeUrl} alt="" style={{ height: 11, width: 11, objectFit: "contain" }} />}
                          {m.opponent?.name || "—"} <span style={{ color: C.muted }}>({m.isHome ? "H" : "A"})</span>
                        </span>
                      </td>
                      <td style={{ textAlign: "left", color: C.muted, maxWidth: 90, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{m.competition || "—"}</td>
                      <td>
                        {res && <b style={{ color: res === "W" ? C.green : res === "L" ? C.red : C.amber }}>{res} </b>}
                        {m.goalsFor ?? "-"}–{m.goalsAgainst ?? "-"}
                      </td>
                      <td>{m.position ? posCode(m.position) : "—"}</td>
                      <td>{m.minutes ?? 0}{m.starter === false ? "*" : ""}</td>
                      <td>{m.goals || 0}</td>
                      <td>{m.assists || 0}</td>
                      <td style={{ fontWeight: 800, color: tone(m.rating) }}>{m.rating != null ? Number(m.rating).toFixed(1) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ color: C.muted, padding: "18px 0", textAlign: "center" }}>None available</div>
          )}
          <div style={{ marginTop: 4, fontSize: 8, color: C.muted }}>* came off the bench · match rating 0–10</div>
        </Panel>

        <Panel title="Scout assessment">
          <div className="fmr-label">Observation</div>
          <p style={{ marginBottom: 6 }}>
            {[r.matchFixture, r.competition].filter(Boolean).join(" · ") || "—"}
            {r.tacticalContext ? ` — ${r.tacticalContext}` : ""}
          </p>
          <div className="fmr-label">Scout opinion</div>
          <p style={{ whiteSpace: "pre-wrap", marginBottom: 6 }}>{s.scoutOpinion?.trim() || r.freeTextNotes?.trim() || "—"}</p>
          {(r.developmentAreas?.length ?? 0) > 0 && (
            <>
              <div className="fmr-label">Development areas</div>
              <p style={{ marginBottom: 6 }}>{r.developmentAreas.join(" · ")}</p>
            </>
          )}
          {s.scoutOpinion?.trim() && r.freeTextNotes?.trim() && (
            <>
              <div className="fmr-label">Additional notes</div>
              <p style={{ whiteSpace: "pre-wrap" }}>{r.freeTextNotes}</p>
            </>
          )}
        </Panel>
      </div>

      <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 8, color: C.muted }}>
        <span>SPONDA{clubName ? ` · ${clubName}` : ""} · Confidential</span>
        <span>Generated {date(new Date().toISOString())}</span>
      </div>
    </div>
  );
}
