import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Notas 0-100 de subcategorías (`_sub_<id>`) y métricas (`<key>`) por jugadora, acumuladas en todas las
 * temporadas (media ponderada por minutos, como /api/players con season=all).
 *
 * GET /api/builder/metrics?keys=_sub_finalizacion,of_xG_p90
 *   → { keys: [...], players: { [playerId]: (number|null)[] } }
 *
 * Solo se devuelven las claves pedidas: el 11 Builder las pide cuando el usuario activa un filtro u orden.
 */

const CACHE_TTL_MS = 10 * 60 * 1000;
const PAGE = 1000;

// playerId → clave → nota 0-100
let cache: { timestamp: number; notes: Map<string, Record<string, number>> } | null = null;
let inflight: Promise<Map<string, Record<string, number>>> | null = null;

async function loadNotes(): Promise<Map<string, Record<string, number>>> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) return cache.notes;
  if (inflight) return inflight;

  inflight = (async () => {
    const db = supabaseAdmin as any;
    const { count } = await db.from("player_season_stats").select("player_id", { count: "exact", head: true });
    const offsets: number[] = [];
    for (let from = 0; from < Math.max(count || 0, PAGE); from += PAGE) offsets.push(from);

    const results = await Promise.all(
      offsets.map((from) =>
        db
          .from("player_season_stats")
          .select("player_id, season_id, minutes_played, m:radar_data->metricas")
          .order("player_id")
          .order("season_id")
          .range(from, from + PAGE - 1)
      )
    );

    // Media ponderada por minutos de cada clave en todas las temporadas de la jugadora
    const acc = new Map<string, Record<string, { sum: number; w: number }>>();
    for (const res of results as any[]) {
      if (res.error) throw res.error;
      for (const row of res.data || []) {
        const metricas = row.m as Record<string, [number, number]> | null;
        if (!metricas) continue;
        const w = Math.max(Number(row.minutes_played) || 0, 1);
        const per = acc.get(row.player_id) || {};
        for (const [k, v] of Object.entries(metricas)) {
          if (!Array.isArray(v) || k.startsWith("_cat_")) continue;
          // _sub_*: [nota0_100, nota0_10]; métricas: [valor, nota0_10]
          const note = k.startsWith("_sub_") ? Number(v[0]) : Number(v[1]) * 10;
          if (!Number.isFinite(note)) continue;
          const slot = per[k] || (per[k] = { sum: 0, w: 0 });
          slot.sum += note * w;
          slot.w += w;
        }
        acc.set(row.player_id, per);
      }
    }

    const notes = new Map<string, Record<string, number>>();
    for (const [pid, per] of Array.from(acc.entries())) {
      const out: Record<string, number> = {};
      for (const [k, { sum, w }] of Object.entries(per)) out[k] = Math.round((sum / w) * 10) / 10;
      notes.set(pid, out);
    }
    cache = { timestamp: Date.now(), notes };
    return notes;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ keys: [], players: {} });

  const keys = (new URL(req.url).searchParams.get("keys") || "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => /^[A-Za-z0-9_]{2,80}$/.test(k))
    .slice(0, 60);
  if (keys.length === 0) return NextResponse.json({ keys: [], players: {} });

  try {
    const notes = await loadNotes();
    const players: Record<string, (number | null)[]> = {};
    for (const [pid, per] of Array.from(notes.entries())) {
      const row = keys.map((k) => (per[k] ?? null));
      if (row.some((v) => v != null)) players[pid] = row;
    }
    return NextResponse.json(
      { keys, players },
      { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=600" } }
    );
  } catch (err: any) {
    console.error("[API_BUILDER_METRICS_ERROR]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
