"use client";

import React, { useEffect, useState } from "react";
import { Trophy, Crown, Info } from "lucide-react";

interface Stat {
  key: string;
  label: string;
  ref: string;
  weight: number;
  isPct?: boolean;
  value: number | null;
  leagueAvg: number | null;
  compareAvg: number | null;
  leaguePercentile: number | null;
  overallPercentile: number | null;
  leagueRank: number | null;
  leagueTotal: number;
  overallRank: number | null;
  overallTotal: number;
  max: number;
}
interface RadarData {
  available: boolean;
  template: { id: string; name: string };
  season: string | null;
  competition: { id: string; name: string | null };
  compare: { id: string; name: string | null; players: number } | null;
  minMinutes: number;
  leagues: { id: string; name: string; players: number }[];
  stats: Stat[];
}

const COLORS = { player: "#38bdf8", league: "#e2e8f0", compare: "#c084fc", gold: "#F2C230" };

const fmt = (v: number | null | undefined, pct?: boolean) =>
  v == null ? "—" : pct ? `${v.toFixed(0)}%` : v >= 10 ? v.toFixed(1) : v.toFixed(2);

function RadarChart({ stats, showCompare }: { stats: Stat[]; showCompare: boolean }) {
  const n = stats.length;
  const W = 500, H = 360, cx = W / 2, cy = H / 2 + 6, R = 122;
  const pt = (i: number, f: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + R * f * Math.cos(a), cy + R * f * Math.sin(a)];
  };
  const frac = (v: number | null, max: number) => (v == null ? 0 : Math.max(0, Math.min(1, v / (max || 1))));
  const poly = (get: (s: Stat) => number | null) => stats.map((s, i) => pt(i, frac(get(s), s.max)).join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[560px] mx-auto select-none">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={stats.map((_, i) => pt(i, f).join(",")).join(" ")} fill={f === 1 ? "rgba(255,255,255,0.025)" : "none"}
          stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
      ))}
      {stats.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" />;
      })}

      {showCompare && (
        <polygon points={poly((s) => s.compareAvg)} fill="rgba(192,132,252,0.10)" stroke={COLORS.compare} strokeWidth={1.5} strokeDasharray="2 3" />
      )}
      <polygon points={poly((s) => s.leagueAvg)} fill="rgba(226,232,240,0.06)" stroke={COLORS.league} strokeWidth={1.4} strokeDasharray="5 3" />
      <polygon points={poly((s) => s.value)} fill="rgba(56,189,248,0.22)" stroke={COLORS.player} strokeWidth={2} />
      {stats.map((s, i) => {
        const [x, y] = pt(i, frac(s.value, s.max));
        return <circle key={s.key} cx={x} cy={y} r={3} fill={COLORS.player} stroke="#0b1329" strokeWidth={1} />;
      })}

      {stats.map((s, i) => {
        const [x, y] = pt(i, 1.17);
        const anchor = Math.abs(x - cx) < 8 ? "middle" : x > cx ? "start" : "end";
        const pc = s.leaguePercentile;
        return (
          <g key={s.key}>
            <text x={x} y={y - 2} textAnchor={anchor} fontSize={12} fontWeight={700} fill="#e2e8f0">{s.label}</text>
            <text x={x} y={y + 12} textAnchor={anchor} fontSize={11.5} fontWeight={800} fill={COLORS.player}>
              {fmt(s.value, s.isPct)}
              {pc != null && <tspan fill="#94a3b8" fontWeight={600}>{`  P${Math.round(pc)}`}</tspan>}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function RankCell({ rank, total }: { rank: number | null; total: number }) {
  if (rank == null) return <td className="text-right text-slate-600">—</td>;
  const top = rank <= 10;
  return (
    <td className="text-right py-1">
      <span
        className={`inline-flex items-baseline gap-0.5 rounded px-1.5 py-0.5 tabular-nums ${
          top ? "bg-[#F2C230] text-[#0E1A2B] font-black" : "text-white font-bold"
        }`}
      >
        #{rank}
        <span className={`text-[9px] font-semibold ${top ? "text-[#0E1A2B]/70" : "text-slate-500"}`}>/{total}</span>
      </span>
    </td>
  );
}

/** Every position metric: weight, player value, league averages and her position in her league and in all leagues */
function MetricsTable({
  stats, league, compare, season,
}: { stats: Stat[]; league: string | null; compare: string | null; season: string | null }) {
  const tops = stats.filter((s) => (s.leagueRank ?? 99) <= 10 || (s.overallRank ?? 99) <= 10).length;
  return (
    <div className={`h-full flex flex-col rounded-xl border p-4 ${tops ? "border-[#F2C230]/50 bg-[#F2C230]/[0.03]" : "border-white/10 bg-white/[0.02]"}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-[#F2C230]" /> Metrics &amp; ranking
          </div>
          <div className="text-[11px] text-slate-500">Position among players of her position · {season}</div>
        </div>
        {tops > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F2C230] text-[#0E1A2B] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider shrink-0">
            <Crown className="w-3 h-3" /> Top 10 in {tops}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-x-auto">
        <table className="w-full h-full text-xs tabular-nums">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="text-left font-semibold pb-2">Metric</th>
              <th className="text-right font-semibold pb-2">Weight</th>
              <th className="text-right font-semibold pb-2" style={{ color: COLORS.player }}>Player</th>
              <th className="text-right font-semibold pb-2" title={league || undefined}>League avg</th>
              {compare && <th className="text-right font-semibold pb-2 max-w-[90px] truncate" style={{ color: COLORS.compare }} title={compare}>{compare.split(" ").slice(0, 2).join(" ")}</th>}
              <th className="text-right font-semibold pb-2 pl-3">League</th>
              <th className="text-right font-semibold pb-2">All leagues</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const top = (s.leagueRank ?? 99) <= 10 || (s.overallRank ?? 99) <= 10;
              return (
                <tr key={s.key} className={`border-t border-white/5 ${top ? "bg-[#F2C230]/[0.06]" : ""}`}>
                  <td className={`py-2 pr-2 ${top ? "text-white font-bold" : "text-slate-300"}`}>
                    <span title={s.ref !== s.label ? `Department stat: ${s.ref}` : undefined}>{s.label}</span>
                  </td>
                  <td className="text-right text-slate-500">{Math.round(s.weight * 100)}%</td>
                  <td className="text-right font-black" style={{ color: COLORS.player }}>{fmt(s.value, s.isPct)}</td>
                  <td className="text-right text-slate-400">{fmt(s.leagueAvg, s.isPct)}</td>
                  {compare && <td className="text-right text-slate-400">{fmt(s.compareAvg, s.isPct)}</td>}
                  <RankCell rank={s.leagueRank} total={s.leagueTotal} />
                  <RankCell rank={s.overallRank} total={s.overallTotal} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PositionRadar({
  playerId,
  competitionId,
  seasonId,
  position,
}: {
  playerId: string;
  competitionId?: string | null;
  seasonId?: string | null;
  position?: string | null;
}) {
  const [compare, setCompare] = useState<string>("");
  const [data, setData] = useState<RadarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (competitionId && seasonId) {
      qs.set("competition", competitionId);
      qs.set("season", seasonId);
    }
    if (position) qs.set("position", position);
    if (compare) qs.set("compare", compare);
    let cancel = false;
    setLoading(true);
    setError(null);
    fetch(`/api/players/${playerId}/radar?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (j.error) setError(j.error);
        else setData(j);
      })
      .catch((e) => !cancel && setError(String(e)))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [playerId, competitionId, seasonId, position, compare]);

  // Compare league is per season: reset it when the season changes
  useEffect(() => setCompare(""), [competitionId, seasonId]);

  if (!data && loading) {
    return <div className="rounded-xl border border-border/60 bg-[#0b1329] p-6 text-xs text-muted-foreground animate-pulse">Loading position radar…</div>;
  }
  if (error) return <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-xs text-red-300">Position radar unavailable: {error}</div>;
  if (!data?.available) return null;

  const showCompare = !!data.compare && data.compare.id !== data.competition.id;
  const others = data.leagues.filter((l) => l.id !== data.competition.id);

  return (
    <div className={`rounded-xl border border-border/60 bg-[#0b1329] shadow-xl overflow-hidden ${loading ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-border/40">
        <div>
          <div className="text-sm font-bold text-white uppercase tracking-wide">Position Radar · {data.template.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {data.competition.name} {data.season} · key metrics for the position vs. league average
          </div>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-slate-400">
          Compare with
          <select
            value={compare}
            onChange={(e) => setCompare(e.target.value)}
            className="bg-[#070e1e] border border-white/15 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-sky-400"
          >
            <option value="">— another league —</option>
            {others.map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.players})</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 p-4 items-stretch">
        <div className="flex flex-col justify-center rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <RadarChart stats={data.stats} showCompare={showCompare} />
          <div className="flex flex-wrap justify-center gap-4 text-[11px] mt-1">
            <span className="flex items-center gap-1.5 text-slate-300"><i className="w-4 h-0.5" style={{ background: COLORS.player }} /> Player</span>
            <span className="flex items-center gap-1.5 text-slate-300"><i className="w-4 border-t border-dashed" style={{ borderColor: COLORS.league }} /> {data.competition.name} avg</span>
            {showCompare && (
              <span className="flex items-center gap-1.5 text-slate-300"><i className="w-4 border-t border-dashed" style={{ borderColor: COLORS.compare }} /> {data.compare!.name} avg</span>
            )}
          </div>
        </div>
        <MetricsTable
          stats={data.stats}
          league={data.competition.name}
          compare={showCompare ? data.compare!.name : null}
          season={data.season}
        />
        <p className="lg:col-span-2 flex items-start gap-1.5 text-[10px] text-slate-500">
          <Info className="w-3 h-3 mt-px shrink-0" />
          Players in the same position group with ≥{data.minMinutes}&apos; this season. P = percentile in her league. Hover a metric for the
          department stat it stands for (Opta equivalent where the exact stat isn&apos;t available).
        </p>
      </div>
    </div>
  );
}
