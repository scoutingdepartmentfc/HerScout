import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isRetired } from "@/lib/utils";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
const TREND_FROM_DATE = "2026-08-01";
const PAGE = 1000;

type BaseData = {
  rows: any[];
  leagueCountryByCode: Map<string, string>;
  leagueCountryByName: Map<string, string>;
  trendByPlayer: Map<string, "up" | "neutral" | "down">;
};

type ProcessedSeason = {
  list: any[];
  filters: {
    teams: string[];
    teamsDetailed: any[];
    leagues: string[];
    leaguesDetailed: any[];
    seasons: string[];
  };
};

// In-memory caches: raw DB data + fully processed list per season.
// Each request then only filters/sorts in memory.
let baseCache: { timestamp: number; data: BaseData } | null = null;
let baseInflight: Promise<BaseData> | null = null;
const processedCache = new Map<string, { timestamp: number; value: ProcessedSeason }>();

function computeTrend(ratings: number[]): "up" | "neutral" | "down" {
  const avg = ratings.reduce((acc, curr) => acc + curr, 0) / ratings.length;
  if (ratings.length === 1) {
    return ratings[0] >= 7.3 ? "up" : ratings[0] <= 5.8 ? "down" : "neutral";
  }
  const half = Math.max(1, Math.floor(ratings.length / 2));
  const firstHalf = ratings.slice(0, half);
  const secondHalf = ratings.slice(-half);
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const diff = secondAvg - firstAvg;
  if (diff >= 0.3 || avg >= 7.3) return "up";
  if (diff <= -0.3 || avg <= 5.8) return "down";
  return "neutral";
}

async function fetchTrends(db: any): Promise<Map<string, "up" | "neutral" | "down">> {
  const trendByPlayer = new Map<string, "up" | "neutral" | "down">();
  try {
    const { count, error: countErr } = await db
      .from("player_match_scores")
      .select("player_id", { count: "exact", head: true })
      .gte("match_date", TREND_FROM_DATE);
    if (countErr) throw countErr;

    const total = Math.min(count || 0, 50000);
    const offsets: number[] = [];
    for (let from = 0; from < total; from += PAGE) offsets.push(from);

    // Fetch all pages in parallel (stable order: match_date, then player_id)
    const results = await Promise.all(
      offsets.map((from) =>
        db
          .from("player_match_scores")
          .select("player_id, score_general, match_date")
          .gte("match_date", TREND_FROM_DATE)
          .order("match_date", { ascending: true })
          .order("player_id", { ascending: true })
          .range(from, from + PAGE - 1)
      )
    );

    const playerMatchesMap = new Map<string, Array<{ date: string; score: number }>>();
    for (const res of results as any[]) {
      if (res.error) {
        console.error("[TREND] Error fetching match scores:", res.error);
        continue;
      }
      for (const row of res.data || []) {
        if (row.score_general != null && !isNaN(Number(row.score_general))) {
          const arr = playerMatchesMap.get(row.player_id) || [];
          arr.push({ date: row.match_date, score: Number(row.score_general) });
          playerMatchesMap.set(row.player_id, arr);
        }
      }
    }

    for (const [playerId, matches] of Array.from(playerMatchesMap.entries())) {
      if (matches.length === 0) continue;
      matches.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      trendByPlayer.set(playerId, computeTrend(matches.slice(-8).map((m) => m.score)));
    }
  } catch (trendErr) {
    console.warn("Could not compute player trends:", trendErr);
  }
  return trendByPlayer;
}

async function loadBaseData(db: any): Promise<BaseData> {
  const now = Date.now();
  if (baseCache && now - baseCache.timestamp < CACHE_TTL_MS) return baseCache.data;
  if (baseInflight) return baseInflight;

  baseInflight = (async () => {
    const selectStats = () =>
      db.from("player_season_stats").select(`
        player_id,
        season_id,
        seasons:season_id ( name, is_active, start_date ),
        demarcacion,
        grupo_demarcacion,
        matches_played,
        minutes_played,
        starter_pct,
        nota_global,
        nota_ataque,
        nota_construccion,
        nota_defensa,
        nota_balon_parado,
        nota_disponibilidad,
        score_general,
        players:player_id (
          id,
          name,
          match_name,
          first_name,
          last_name,
          country,
          birth_date,
          photo_url,
          primary_position,
          grupo_demarcacion,
          shirt_number,
          height,
          weight,
          market_value,
          fm_team_name, fm_team_badge_url, current_league_name, current_league_logo_url,
          sd_league_code,
          teams:current_team_id ( id, name, badge_url, league_name, league_logo_url ),
          player_ea_ratings ( pace, physicality )
        )
      `);

    const statsCountPromise = db
      .from("player_season_stats")
      .select("player_id", { count: "exact", head: true });

    // Stats count, sd_leagues and trends all run in parallel
    const [statsCountRes, sdLRes, trendByPlayer] = await Promise.all([
      statsCountPromise,
      db.from("sd_leagues").select("code, name, country"),
      fetchTrends(db),
    ]);

    const totalStats = Math.max(statsCountRes?.count || 0, PAGE);
    const offsets: number[] = [];
    for (let from = 0; from < totalStats; from += PAGE) offsets.push(from);

    const batchResults = await Promise.all(
      offsets.map((from) => selectStats().order("player_id").order("season_id").range(from, from + PAGE - 1))
    );

    const rows: any[] = [];
    for (const res of batchResults as any[]) {
      if (res.error) throw res.error;
      if (res.data) rows.push(...res.data);
    }

    const leagueCountryByCode = new Map<string, string>();
    const leagueCountryByName = new Map<string, string>();
    for (const item of sdLRes?.data || []) {
      if (item.code && item.country) leagueCountryByCode.set(item.code, item.country);
      if (item.name && item.country) leagueCountryByName.set(item.name.toLowerCase(), item.country);
    }

    const data: BaseData = { rows, leagueCountryByCode, leagueCountryByName, trendByPlayer };
    baseCache = { timestamp: Date.now(), data };
    processedCache.clear();
    return data;
  })();

  try {
    return await baseInflight;
  } finally {
    baseInflight = null;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams.get("search") || "";
  const position = url.searchParams.get("position") || "all";
  const team = url.searchParams.get("team") || "all";
  const teamsParam = url.searchParams.get("teams") || "";
  const league = url.searchParams.get("league") || "all";
  const leaguesParam = url.searchParams.get("leagues") || "";
  const minAgeParam = url.searchParams.get("minAge");
  const maxAgeParam = url.searchParams.get("maxAge");
  const minAge = minAgeParam != null && minAgeParam !== "" ? Number(minAgeParam) : null;
  const maxAge = maxAgeParam != null && maxAgeParam !== "" ? Number(maxAgeParam) : null;
  // season: "all" (accumulated by default) | season name e.g. "2026/2027", "2025/2026"
  const season = url.searchParams.get("season") || "all";
  const minRating = url.searchParams.get("minRating") ? Number(url.searchParams.get("minRating")) : null;
  const sortBy = url.searchParams.get("sortBy") || "nota_global";
  const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";

  if (!supabaseAdmin) {
    return NextResponse.json({ players: [], filters: { teams: [], leagues: [], seasons: [] } });
  }

  try {
    const db = supabaseAdmin as any;

    const validScores = [
      "nota_global",
      "nota_ataque",
      "nota_construccion",
      "nota_defensa",
      "nota_balon_parado",
      "nota_disponibilidad",
      "nota_fisico",
    ];

    const now = Date.now();
    const base = await loadBaseData(db);
    const cachedProcessed = processedCache.get(season);
    let processed: ProcessedSeason;
    if (cachedProcessed && cachedProcessed.timestamp === baseCache?.timestamp) {
      processed = cachedProcessed.value;
    } else {
    const { rows, leagueCountryByCode, leagueCountryByName, trendByPlayer } = base;

    // Extract available season names from all rows for the filter dropdown
    const availableSeasons = Array.from(
      new Set(rows.map((r: any) => r.seasons?.name).filter(Boolean))
    ).sort().reverse();

    // Group rows by player
    const rowsByPlayer = new Map<string, any[]>();
    for (const r of rows) {
      if (!r.players || isRetired(r.players)) continue;
      const arr = rowsByPlayer.get(r.player_id) || [];
      arr.push(r);
      rowsByPlayer.set(r.player_id, arr);
    }

    const list: any[] = [];

    if (season === "all") {
      // ACCUMULATED MODE (Default): Weighted average across all seasons
      Array.from(rowsByPlayer.entries()).forEach(([playerId, playerRows]) => {
        const latestRow = [...playerRows].sort((a, b) =>
          String(b.seasons?.start_date || "").localeCompare(String(a.seasons?.start_date || "")) ||
          (b.minutes_played || 0) - (a.minutes_played || 0)
        )[0];
        const p = latestRow.players;

        const ea = Array.isArray(p.player_ea_ratings) ? p.player_ea_ratings[0] : p.player_ea_ratings;
        const notaFisico = (() => {
          if (ea?.pace != null && ea?.physicality != null) {
            return Math.round(Number(ea.pace) * 0.45 + Number(ea.physicality) * 0.55);
          }
          return ea?.pace != null ? Number(ea.pace) : ea?.physicality != null ? Number(ea.physicality) : null;
        })();

        // Calculate weighted averages across all seasons with stats
        let totalMins = 0;
        let totalMatches = 0;
        const sumWeighted: Record<string, { sum: number; mins: number }> = {
          nota_global: { sum: 0, mins: 0 },
          nota_ataque: { sum: 0, mins: 0 },
          nota_construccion: { sum: 0, mins: 0 },
          nota_defensa: { sum: 0, mins: 0 },
          nota_balon_parado: { sum: 0, mins: 0 },
          nota_disponibilidad: { sum: 0, mins: 0 },
        };

        for (const r of playerRows) {
          const m = Number(r.minutes_played) || 0;
          totalMins += m;
          totalMatches += Number(r.matches_played) || 0;
          for (const k of Object.keys(sumWeighted)) {
            if (r[k] != null) {
              sumWeighted[k].sum += Number(r[k]) * m;
              sumWeighted[k].mins += m;
            }
          }
        }

        const getWeightedVal = (k: string) => {
          const item = sumWeighted[k];
          return item.mins > 0 ? item.sum / item.mins : null;
        };

        list.push({
          id: p.id,
          name: p.name,
          matchName: p.match_name || p.name,
          country: p.country,
          birthDate: p.birth_date,
          photoUrl: p.photo_url,
          position: latestRow.demarcacion || p.primary_position || "Centrocampista",
          grupoDemarcacion: latestRow.grupo_demarcacion || p.grupo_demarcacion || "General",
          shirtNumber: p.shirt_number,
          height: p.height,
          weight: p.weight,
          marketValue: p.market_value,
          teamId: p.teams?.id,
          teamName: p.fm_team_name || p.teams?.name || "Unattached",
          badgeUrl: (p.fm_team_name ? p.fm_team_badge_url : null) || p.teams?.badge_url,
          leagueName: p.current_league_name || p.teams?.league_name || "Primera División Femenina",
          leagueLogoUrl: p.current_league_logo_url || p.teams?.league_logo_url,
          leagueCountry: (p.sd_league_code ? leagueCountryByCode.get(p.sd_league_code) : null) ||
            leagueCountryByName.get((p.current_league_name || p.teams?.league_name || "").toLowerCase()) ||
            null,
          seasonName: playerRows.length > 1 ? `All seasons (${playerRows.length})` : playerRows[0]?.seasons?.name || null,
          isAccumulated: playerRows.length > 1,
          minutesPlayed: totalMins,
          matchesPlayed: totalMatches,
          notaGlobal: getWeightedVal("nota_global"),
          notaAtaque: getWeightedVal("nota_ataque"),
          notaConstruccion: getWeightedVal("nota_construccion"),
          notaDefensa: getWeightedVal("nota_defensa"),
          notaBalonParado: getWeightedVal("nota_balon_parado"),
          notaDisponibilidad: getWeightedVal("nota_disponibilidad"),
          notaFisico,
        });
      });
    } else {
      // SPECIFIC SEASON FILTER: Only show stats for the selected season
      Array.from(rowsByPlayer.entries()).forEach(([playerId, playerRows]) => {
        const matchingRow = playerRows.find((r: any) => r.seasons?.name === season);
        if (!matchingRow) return;

        const p = matchingRow.players;
        const ea = Array.isArray(p.player_ea_ratings) ? p.player_ea_ratings[0] : p.player_ea_ratings;
        const notaFisico = (() => {
          if (ea?.pace != null && ea?.physicality != null) {
            return Math.round(Number(ea.pace) * 0.45 + Number(ea.physicality) * 0.55);
          }
          return ea?.pace != null ? Number(ea.pace) : ea?.physicality != null ? Number(ea.physicality) : null;
        })();

        list.push({
          id: p.id,
          name: p.name,
          matchName: p.match_name || p.name,
          country: p.country,
          birthDate: p.birth_date,
          photoUrl: p.photo_url,
          position: matchingRow.demarcacion || p.primary_position || "Centrocampista",
          grupoDemarcacion: matchingRow.grupo_demarcacion || p.grupo_demarcacion || "General",
          shirtNumber: p.shirt_number,
          height: p.height,
          weight: p.weight,
          marketValue: p.market_value,
          teamId: p.teams?.id,
          teamName: p.fm_team_name || p.teams?.name || "Unattached",
          badgeUrl: (p.fm_team_name ? p.fm_team_badge_url : null) || p.teams?.badge_url,
          leagueName: p.current_league_name || p.teams?.league_name || "Primera División Femenina",
          leagueLogoUrl: p.current_league_logo_url || p.teams?.league_logo_url,
          leagueCountry: (p.sd_league_code ? leagueCountryByCode.get(p.sd_league_code) : null) ||
            leagueCountryByName.get((p.current_league_name || p.teams?.league_name || "").toLowerCase()) ||
            null,
          seasonName: matchingRow.seasons?.name || null,
          isAccumulated: false,
          minutesPlayed: matchingRow.minutes_played,
          matchesPlayed: matchingRow.matches_played,
          notaGlobal: matchingRow.nota_global,
          notaAtaque: matchingRow.nota_ataque,
          notaConstruccion: matchingRow.nota_construccion,
          notaDefensa: matchingRow.nota_defensa,
          notaBalonParado: matchingRow.nota_balon_parado,
          notaDisponibilidad: matchingRow.nota_disponibilidad,
          notaFisico,
        });
      });
    }

    // Available filter options extracted from all data
    const teamsMap = new Map<string, { name: string; teamId?: string | null; badgeUrl?: string | null; leagueName?: string }>();
    const leaguesMap = new Map<string, { name: string; logoUrl?: string | null; country?: string | null }>();

    for (const p of list) {
      if (p.teamName && !teamsMap.has(p.teamName)) {
        teamsMap.set(p.teamName, {
          name: p.teamName,
          teamId: p.teamId || null,
          badgeUrl: p.badgeUrl || null,
          leagueName: p.leagueName,
        });
      }
      if (p.leagueName && !leaguesMap.has(p.leagueName)) {
        leaguesMap.set(p.leagueName, {
          name: p.leagueName,
          logoUrl: p.leagueLogoUrl || null,
          country: p.leagueCountry || null,
        });
      }
    }

    const availableTeamsList = Array.from(teamsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    const availableLeaguesList = Array.from(leaguesMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    const availableTeams = availableTeamsList.map((t) => t.name);
    const availableLeagues = availableLeaguesList.map((l) => l.name);

    for (const p of list) {
      p.trend = trendByPlayer.get(p.id) ?? null;
    }

    processed = {
      list,
      filters: {
        teams: availableTeams,
        teamsDetailed: availableTeamsList,
        leagues: availableLeagues,
        leaguesDetailed: availableLeaguesList,
        seasons: availableSeasons,
      },
    };
    processedCache.set(season, { timestamp: baseCache?.timestamp ?? now, value: processed });
    }

    const evaluatedPeriod = "TREND (LAST 3M)";
    let list = processed.list.slice();

    // Filters
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((p: any) =>
        (p.name && p.name.toLowerCase().includes(s)) ||
        (p.matchName && p.matchName.toLowerCase().includes(s))
      );
    }

    if (position !== "all") {
      const pos = position.toLowerCase();
      list = list.filter((p: any) => p.position.toLowerCase().includes(pos) || p.grupoDemarcacion.toLowerCase().includes(pos));
    }

    // Teams filter (support multiple comma-separated or single)
    const selectedTeams = teamsParam
      ? teamsParam.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
      : team !== "all"
      ? [team.trim().toLowerCase()]
      : [];

    if (selectedTeams.length > 0) {
      list = list.filter((p: any) => selectedTeams.includes((p.teamName || "").toLowerCase()));
    }

    // Leagues filter (support multiple comma-separated or single)
    // Also support partial matching so "Primera División" matches "Primera División Femenina"
    const selectedLeagues = leaguesParam
      ? leaguesParam.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean)
      : league !== "all"
      ? [league.trim().toLowerCase()]
      : [];

    if (selectedLeagues.length > 0) {
      list = list.filter((p: any) => {
        const playerLeague = (p.leagueName || "").toLowerCase();
        return selectedLeagues.some((sel) => playerLeague === sel || playerLeague.startsWith(sel) || sel.startsWith(playerLeague));
      });
    }

    // Age filter (based on birthDate)
    if (minAge != null || maxAge != null) {
      list = list.filter((p: any) => {
        if (!p.birthDate) return false;
        const playerAge = Math.floor((now - new Date(p.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000));
        if (minAge != null && playerAge < minAge) return false;
        if (maxAge != null && playerAge > maxAge) return false;
        return true;
      });
    }

    if (minRating != null && !isNaN(minRating)) {
      list = list.filter((p: any) => (p.notaGlobal || 0) >= minRating);
    }

    // Sorting (nulls last)
    const key: Record<string, string> = {
      nota_global: "notaGlobal",
      nota_ataque: "notaAtaque",
      nota_construccion: "notaConstruccion",
      nota_defensa: "notaDefensa",
      nota_balon_parado: "notaBalonParado",
      nota_disponibilidad: "notaDisponibilidad",
      nota_fisico: "notaFisico",
      age: "birthDate",
    };
    const field = key[validScores.includes(sortBy) || sortBy === "nota_fisico" || sortBy === "age" ? sortBy : "nota_global"];
    list.sort((a: any, b: any) => {
      if (sortBy === "age") {
        // Higher birthDate = younger, lower birthDate = older
        const valA = a.birthDate ? new Date(a.birthDate).getTime() : null;
        const valB = b.birthDate ? new Date(b.birthDate).getTime() : null;
        if (valA == null || valB == null) return valA == null ? (valB == null ? 0 : 1) : -1;
        // order 'desc' means highest age (oldest) first -> lowest birthDate
        return order === "desc" ? valA - valB : valB - valA;
      }
      const valA = a[field];
      const valB = b[field];
      if (valA == null || valB == null) return valA == null ? (valB == null ? 0 : 1) : -1;
      return order === "asc" ? valA - valB : valB - valA;
    });

    return NextResponse.json({
      players: list,
      evaluatedPeriod,
      filters: processed.filters,
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=600" },
    });
  } catch (err: any) {
    console.error("[API_PLAYERS_ERROR]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
