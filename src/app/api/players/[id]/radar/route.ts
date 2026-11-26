import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { statValue } from "@/lib/positionRadar";
import { positionalConfigFor } from "@/lib/positionalStatsConfig";
import { computeRatingTrend } from "@/lib/ratingTrend";
import { getPositionBadge } from "@/lib/positions";

/**
 * Positional Stats (Block 3), Similar Players (Block 4), and Positional Radar (Block 5)
 * GET /api/players/[id]/radar?competition=&season=&seasonName=&position=&comparePlayerId=
 *
 * SPEC §6.6: Percentile pool = same position group, same league, season, min. 450 minutes.
 * SPEC §2.4: Similar players = cosine similarity of percentile vectors of block 3 metrics,
 *            same position group, min. 600 minutes.
 */

const MIN_PERCENTILE_MINUTES = 450;
const FALLBACK_PERCENTILE_MINUTES = 200;
const MIN_SIMILAR_MINUTES = 600;
const FALLBACK_SIMILAR_MINUTES = 300;

type Row = {
  player_id: string;
  competition_id: string;
  season_id: string;
  minutes_played: number | null;
  demarcacion?: string | null;
  metricas: Record<string, [number, number]> | null;
  players?: {
    id?: string;
    name?: string;
    match_name?: string;
    photo_url?: string;
    fotmob_photo_url?: string;
    country?: string;
    birth_date?: string;
    primary_position?: string;
  } | null;
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
        "player_id, competition_id, season_id, minutes_played, demarcacion, metricas:radar_data->metricas, players ( id, name, match_name, photo_url, fotmob_photo_url, country, birth_date, primary_position ), teams ( name, badge_url ), competitions ( name )"
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

/** Percentile (0-100) of v within vals (mid-rank for ties; invert=true when lower is better) */
function percentile(vals: number[], v: number, invert = false): number | null {
  if (!vals.length) return null;
  let better = 0;
  let equal = 0;
  for (const x of vals) {
    if (invert ? x > v : x < v) better++;
    else if (x === v) equal++;
  }
  return ((better + equal / 2) / vals.length) * 100;
}

/** One row per player (the one with most minutes if she appears in multiple competitions) */
function perPlayer(rows: Row[]): Row[] {
  const best = new Map<string, Row>();
  for (const r of rows) {
    const prev = best.get(r.player_id);
    if (!prev || (Number(r.minutes_played) || 0) > (Number(prev.minutes_played) || 0)) {
      best.set(r.player_id, r);
    }
  }
  return Array.from(best.values());
}

/** Position of v in rows for one stat (1 = best; ties share the rank) */
function metricRank(rows: Row[], key: string, v: number | null, invert = false) {
  const vals = rows.map((r) => statValue(r.metricas, key)).filter((x): x is number => x != null);
  if (v == null) return { rank: null, total: vals.length };
  return { rank: 1 + vals.filter((x) => (invert ? x < v : x > v)).length, total: vals.length };
}

function weightedAvg(rows: Row[], key: string): number | null {
  let s = 0;
  let w = 0;
  for (const r of rows) {
    const v = statValue(r.metricas, key);
    if (v == null) continue;
    const m = Math.max(1, Number(r.minutes_played) || 0);
    s += v * m;
    w += m;
  }
  return w > 0 ? s / w : null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return (dot / (Math.sqrt(na) * Math.sqrt(nb))) * 100;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const q = req.nextUrl.searchParams;
  const playerId = params.id;

  try {
    // 1. Fetch all player-season rows with radar_data for this player
    const { data: own, error: ownErr } = await db
      .from("player_season_stats")
      .select(
        "player_id, competition_id, season_id, minutes_played, grupo_demarcacion, metricas:radar_data->metricas, seasons ( name, start_date ), competitions ( name ), players ( name, match_name, photo_url, fotmob_photo_url ), teams ( name, badge_url )"
      )
      .eq("player_id", playerId)
      .not("radar_data", "is", null);

    if (ownErr) throw new Error(ownErr.message);
    const allOwn: any[] = (own || []).sort(
      (a: any, b: any) =>
        String(b.seasons?.start_date || "").localeCompare(String(a.seasons?.start_date || "")) ||
        (Number(b.minutes_played) || 0) - (Number(a.minutes_played) || 0)
    );
    if (!allOwn.length) return NextResponse.json({ available: false });

    const reqComp = q.get("competition");
    const reqSeason = q.get("season");
    const reqSeasonName = q.get("seasonName");

    let mine: any = null;
    if (reqComp && reqComp !== "all" && reqSeason && reqSeason !== "all") {
      mine = allOwn.find((r) => r.competition_id === reqComp && r.season_id === reqSeason);
    }
    if (!mine && reqComp && reqComp !== "all" && reqSeasonName) {
      mine = allOwn.find((r) => r.competition_id === reqComp && r.seasons?.name === reqSeasonName);
    }
    if (!mine && reqSeasonName && reqSeasonName !== "all") {
      mine = allOwn.find((r) => r.seasons?.name === reqSeasonName);
    }
    if (!mine && reqComp && reqComp !== "all") {
      mine = allOwn.find((r) => r.competition_id === reqComp);
    }
    if (!mine) mine = allOwn[0];

    const cfg = positionalConfigFor(q.get("position"), mine.grupo_demarcacion);
    const seasonName: string | null = mine.seasons?.name ?? null;

    // 2. Same season (by name) in every competition
    let seasonIds = [mine.season_id];
    if (seasonName) {
      const { data: ss } = await db.from("seasons").select("id").eq("name", seasonName);
      if (ss?.length) seasonIds = ss.map((s: any) => s.id);
    }

    // 3. Load position pool for this season
    const all = await loadPool(db, seasonIds, cfg.grupo);
    const league450 = all.filter(
      (r) => r.competition_id === mine.competition_id && (Number(r.minutes_played) || 0) >= MIN_PERCENTILE_MINUTES
    );
    const effectiveMinMinutes = league450.length >= 6 ? MIN_PERCENTILE_MINUTES : FALLBACK_PERCENTILE_MINUTES;
    const pool = all.filter((r) => (Number(r.minutes_played) || 0) >= effectiveMinMinutes || r.player_id === playerId);

    const meRow: Row =
      pool.find((r) => r.player_id === playerId && r.competition_id === mine.competition_id) ||
      (mine as Row);
    if (!pool.includes(meRow)) pool.push(meRow);

    const leaguePool = perPlayer(pool.filter((r) => r.competition_id === mine.competition_id));
    const overallPool = perPlayer(pool);

    // 4. Block 3 & Block 5 stats (with league percentile, league avg percentile, rank, and distribution)
    const stats = cfg.metrics.map((st) => {
      const allVals = overallPool
        .map((r) => statValue(r.metricas, st.key))
        .filter((v): v is number => v != null)
        .sort((a, b) => a - b);
      const leagueEntries = leaguePool
        .map((r) => {
          const val = statValue(r.metricas, st.key);
          return val == null
            ? null
            : {
                playerId: r.player_id,
                name: r.players?.match_name || r.players?.name || "Player",
                teamName: r.teams?.name || "",
                value: val,
              };
        })
        .filter((x): x is { playerId: string; name: string; teamName: string; value: number } => x !== null);

      const leagueVals = leagueEntries.map((e) => e.value).sort((a, b) => a - b);
      const v = statValue(meRow.metricas, st.key);
      const leagueAvg = weightedAvg(leaguePool, st.key);
      const lr = metricRank(leaguePool, st.key, v, st.invert);
      const or = metricRank(overallPool, st.key, v, st.invert);

      const leaguePct = v == null ? null : percentile(leagueVals, v, st.invert);
      const leagueAvgPct = leagueAvg == null ? 50 : percentile(leagueVals, leagueAvg, st.invert) ?? 50;

      // Distribution sorted best->worst for the click-row modal
      const distribution = leagueEntries
        .map((e) => ({
          ...e,
          percentile: Math.round(percentile(leagueVals, e.value, st.invert) ?? 0),
        }))
        .sort((a, b) => (st.invert ? a.value - b.value : b.value - a.value));

      return {
        ...st,
        value: v,
        playerMinutes: Number(meRow.minutes_played) || 0,
        leagueRank: lr.rank,
        leagueTotal: lr.total,
        overallRank: or.rank,
        overallTotal: or.total,
        leagueAvg,
        leagueAvgPercentile: Math.round(leagueAvgPct),
        leaguePercentile: leaguePct != null ? Math.round(leaguePct) : null,
        overallPercentile: v == null ? null : Math.round(percentile(allVals, v, st.invert) ?? 0),
        distribution,
      };
    });

    // 5. Block 4: Similar players (cosine similarity of 8-metric percentile vectors, min. 600 min)
    const allSortedByMetric = cfg.metrics.map((st) => ({
      key: st.key,
      invert: !!st.invert,
      vals: overallPool
        .map((r) => statValue(r.metricas, st.key))
        .filter((v): v is number => v != null)
        .sort((a, b) => a - b),
    }));

    const simPool600 = overallPool.filter(
      (r) => r.player_id !== playerId && (Number(r.minutes_played) || 0) >= MIN_SIMILAR_MINUTES
    );
    const simPool =
      simPool600.length >= 6
        ? simPool600
        : overallPool.filter(
            (r) => r.player_id !== playerId && (Number(r.minutes_played) || 0) >= FALLBACK_SIMILAR_MINUTES
          );

    const vectorFor = (r: Row): number[] =>
      allSortedByMetric.map(({ key, invert, vals }) => {
        const val = statValue(r.metricas, key);
        if (val == null || !vals.length) return 50;
        return percentile(vals, val, invert) ?? 50;
      });

    const targetVec = vectorFor(meRow);
    const scoredSimilar = simPool
      .map((r) => {
        const sim = cosineSimilarity(targetVec, vectorFor(r));
        const posBadge = getPositionBadge(r.demarcacion || r.players?.primary_position);
        const dob = r.players?.birth_date;
        const age = dob
          ? Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))
          : null;
        return {
          id: r.player_id,
          name: r.players?.match_name || r.players?.name || "Player",
          photoUrl: r.players?.fotmob_photo_url || r.players?.photo_url || null,
          country: r.players?.country || null,
          teamName: r.teams?.name || "",
          badgeUrl: r.teams?.badge_url || null,
          age,
          position: posBadge.code,
          similarity: Math.round(sim),
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 15);

    // Fetch 3-month form for those top 15 similar players
    const formMap = new Map<string, "up" | "neutral" | "down">();
    if (scoredSimilar.length > 0) {
      const simIds = scoredSimilar.map((s) => s.id);
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const { data: simScores } = await db
        .from("player_match_scores")
        .select("player_id, score_general, match_date")
        .in("player_id", simIds)
        .gte("match_date", threeMonthsAgo.toISOString().slice(0, 10))
        .order("match_date", { ascending: true });

      const grouped = new Map<string, number[]>();
      for (const sc of simScores || []) {
        if (sc.score_general == null) continue;
        const arr = grouped.get(sc.player_id) || [];
        arr.push(Number(sc.score_general));
        grouped.set(sc.player_id, arr);
      }
      for (const [pid, arr] of Array.from(grouped.entries())) {
        const t = computeRatingTrend(arr);
        if (t) formMap.set(pid, t);
      }
    }

    const similarPlayers = scoredSimilar.map((s) => ({
      ...s,
      form: formMap.get(s.id) || null,
    }));

    // 6. Optional comparison player overlay for Block 5
    const comparePlayerId = q.get("comparePlayerId");
    let comparePlayer: {
      id: string;
      name: string;
      percentiles: (number | null)[];
    } | null = null;
    if (comparePlayerId) {
      const cmpRow = overallPool.find((r) => r.player_id === comparePlayerId);
      if (cmpRow) {
        comparePlayer = {
          id: cmpRow.player_id,
          name: cmpRow.players?.match_name || cmpRow.players?.name || "Player",
          percentiles: cfg.metrics.map((st, idx) => {
            const val = statValue(cmpRow.metricas, st.key);
            const vals = allSortedByMetric[idx].vals;
            return val == null ? null : Math.round(percentile(vals, val, st.invert) ?? 0);
          }),
        };
      }
    }

    // Pool player options for the "Compare with…" selector in Block 5
    const compareCandidates = overallPool
      .filter((r) => r.player_id !== playerId && (Number(r.minutes_played) || 0) >= effectiveMinMinutes)
      .map((r) => ({
        id: r.player_id,
        name: r.players?.match_name || r.players?.name || "Player",
        teamName: r.teams?.name || "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 120);

    return NextResponse.json({
      available: true,
      template: {
        id: cfg.id,
        shortCode: cfg.shortCode,
        name: cfg.name,
        grupo: cfg.grupo,
      },
      season: seasonName,
      competition: { id: mine.competition_id, name: mine.competitions?.name || null },
      minMinutes: effectiveMinMinutes,
      playerMinutes: Number(meRow.minutes_played) || 0,
      stats,
      similarPlayers,
      comparePlayer,
      compareCandidates,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
