import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { templateFor, statValue, RadarTemplate } from "@/lib/positionRadar";

/**
 * Position radar + rankings for one player-season.
 * GET /api/players/[id]/radar?competition=&season=&position=&compare=<competitionId>
 *
 * Pool: every player-season of the same season (by name, e.g. "2025/2026") across all competitions,
 * in the pipeline position group of the player's template, with at least MIN_MINUTES.
 * - Radar: player value per stat vs. the minutes-weighted average of her league and of the `compare` league.
 * - Ranking by metric: her position in each stat within her league and within the whole pool.
 */

const MIN_MINUTES = 300;
type Row = {
  player_id: string;
  competition_id: string;
  season_id: string;
  minutes_played: number | null;
  metricas: Record<string, [number, number]> | null;
  players?: { name?: string; match_name?: string; photo_url?: string } | null;
  teams?: { name?: string; badge_url?: string } | null;
  competitions?: { name?: string } | null;
};

const poolCache = new Map<string, { at: number; rows: Row[] }>();

async function loadPool(db: any, seasonIds: string[], grupo: string): Promise<Row[]> {
  const key = `${grupo}|${[...seasonIds].sort().join(",")}`;
  const hit = poolCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.rows;
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("player_season_stats")
      .select(
        "player_id, competition_id, season_id, minutes_played, metricas:radar_data->metricas, players ( name, match_name, photo_url ), teams ( name, badge_url ), competitions ( name )"
      )
      .in("season_id", seasonIds)
      .eq("grupo_demarcacion", grupo)
      .not("radar_data", "is", null)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  poolCache.set(key, { at: Date.now(), rows });
  return rows;
}

/** Percentile (0-100) of v within vals (mid-rank for ties) */
function percentile(vals: number[], v: number) {
  if (!vals.length) return null;
  let below = 0, equal = 0;
  for (const x of vals) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return ((below + equal / 2) / vals.length) * 100;
}

/** One row per player (the one with most minutes if she appears twice) */
function perPlayer(rows: Row[]) {
  const best = new Map<string, Row>();
  for (const r of rows) {
    const prev = best.get(r.player_id);
    if (!prev || (Number(r.minutes_played) || 0) > (Number(prev.minutes_played) || 0)) best.set(r.player_id, r);
  }
  return Array.from(best.values());
}

/** Position of v in rows for one stat (1 = highest; ties share the rank) */
function metricRank(rows: Row[], key: string, v: number | null) {
  const vals = rows.map((r) => statValue(r.metricas, key)).filter((x): x is number => x != null);
  if (v == null) return { rank: null, total: vals.length };
  return { rank: 1 + vals.filter((x) => x > v).length, total: vals.length };
}

function weightedAvg(rows: Row[], key: string) {
  let s = 0, w = 0;
  for (const r of rows) {
    const v = statValue(r.metricas, key);
    if (v == null) continue;
    const m = Math.max(1, Number(r.minutes_played) || 0);
    s += v * m;
    w += m;
  }
  return w > 0 ? s / w : null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const q = req.nextUrl.searchParams;
  const playerId = params.id;

  try {
    // 1. The player-season (requested one, or her latest with metrics and most minutes)
    let sel = db
      .from("player_season_stats")
      .select("player_id, competition_id, season_id, minutes_played, grupo_demarcacion, metricas:radar_data->metricas, seasons ( name, start_date ), competitions ( name ), players ( name, match_name, photo_url ), teams ( name, badge_url )")
      .eq("player_id", playerId)
      .not("radar_data", "is", null);
    if (q.get("competition") && q.get("season")) sel = sel.eq("competition_id", q.get("competition")).eq("season_id", q.get("season"));
    const { data: own, error: ownErr } = await sel;
    if (ownErr) throw new Error(ownErr.message);
    const mine = (own || []).sort(
      (a: any, b: any) =>
        String(b.seasons?.start_date || "").localeCompare(String(a.seasons?.start_date || "")) ||
        (Number(b.minutes_played) || 0) - (Number(a.minutes_played) || 0)
    )[0];
    if (!mine) return NextResponse.json({ available: false });

    const tpl = templateFor(q.get("position"), mine.grupo_demarcacion);
    const seasonName: string | null = mine.seasons?.name ?? null;

    // 2. Same season (by name) in every competition
    let seasonIds = [mine.season_id];
    if (seasonName) {
      const { data: ss } = await db.from("seasons").select("id").eq("name", seasonName);
      if (ss?.length) seasonIds = ss.map((s: any) => s.id);
    }

    // 3. Comparison pool (always containing the player herself)
    const all = await loadPool(db, seasonIds, tpl.grupo);
    const pool = all.filter((r) => (Number(r.minutes_played) || 0) >= MIN_MINUTES || r.player_id === playerId);
    const meRow: Row =
      pool.find((r) => r.player_id === playerId && r.competition_id === mine.competition_id) ||
      (mine as Row);
    if (!pool.includes(meRow)) pool.push(meRow);

    const leaguePool = pool.filter((r) => r.competition_id === mine.competition_id);
    const compareId = q.get("compare");
    const comparePool = compareId ? pool.filter((r) => r.competition_id === compareId) : [];

    // Leagues available to compare with (same season and position group)
    const leagues = new Map<string, { id: string; name: string; players: number }>();
    for (const r of pool) {
      const l = leagues.get(r.competition_id) || { id: r.competition_id, name: r.competitions?.name || "—", players: 0 };
      l.players++;
      leagues.set(r.competition_id, l);
    }

    // 4. Radar axes
    const stats = tpl.stats.map((st) => {
      const values = pool.map((r) => statValue(r.metricas, st.key)).filter((v): v is number => v != null).sort((a, b) => a - b);
      const leagueVals = leaguePool.map((r) => statValue(r.metricas, st.key)).filter((v): v is number => v != null);
      const v = statValue(meRow.metricas, st.key);
      // Axis max: 95th percentile of the whole pool, so outliers don't squash the radar (≤100 for % stats)
      const p95 = values.length ? values[Math.min(values.length - 1, Math.floor(values.length * 0.95))] : null;
      const max = Math.max(p95 || 0, 1e-6);
      const lr = metricRank(perPlayer(leaguePool), st.key, v);
      const or = metricRank(perPlayer(pool), st.key, v);
      return {
        ...st,
        value: v,
        leagueRank: lr.rank,
        leagueTotal: lr.total,
        overallRank: or.rank,
        overallTotal: or.total,
        leagueAvg: weightedAvg(leaguePool, st.key),
        compareAvg: compareId ? weightedAvg(comparePool, st.key) : null,
        leaguePercentile: v == null ? null : percentile(leagueVals, v),
        overallPercentile: v == null ? null : percentile(values, v),
        max,
      };
    });

    return NextResponse.json({
      available: true,
      template: { id: tpl.id, name: tpl.name, grupo: tpl.grupo },
      season: seasonName,
      competition: { id: mine.competition_id, name: mine.competitions?.name || null },
      compare: compareId ? { id: compareId, name: leagues.get(compareId)?.name || null, players: comparePool.length } : null,
      minMinutes: MIN_MINUTES,
      leagues: Array.from(leagues.values()).sort((a, b) => a.name.localeCompare(b.name)),
      stats,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
