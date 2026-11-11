import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isRetired } from "@/lib/utils";
import { INTERNATIONAL_IDS, INTERNATIONAL_REGIONS } from "@/lib/internationalCompetitions";
import { computeRatingTrend, PlayerTrend } from "@/lib/ratingTrend";

/** Country shown for international competitions in the league filter (grouped apart from countries) */
const INTERNATIONAL_COUNTRY = "Internacional";
const isInternational = (id?: string | null, country?: string | null) =>
  Boolean((id && INTERNATIONAL_IDS.has(id)) || (country && INTERNATIONAL_REGIONS.has(country)));
// Lowercase, typographic apostrophes → straight, collapsed spaces ("Women’s" == "Women's")
const normLeague = (s: string) => s.toLowerCase().replace(/[\u2018\u2019\u00b4`]/g, "'").replace(/\s+/g, " ").trim();

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache
const TREND_FROM_DATE = "2026-08-01";
const PAGE = 1000;

type BaseData = {
  rows: any[];
  leagueCountryByCode: Map<string, string>;
  leagueCountryByName: Map<string, string>;
  trendByPlayer: Map<string, "up" | "neutral" | "down">;
  // Every player (stats or not): the ones without season stats are listed without ratings
  allPlayers: any[];
  // Players without a current club: club of their latest match, only if played in the last 3 months
  recentTeamByPlayer: Map<string, { id: string; name: string; badge_url: string | null }>;
};

const RECENT_CLUB_MONTHS = 3;

async function fetchRecentTeams(db: any, playerIds: string[]) {
  const out = new Map<string, { id: string; name: string; badge_url: string | null }>();
  if (!playerIds.length) return out;
  const since = new Date();
  since.setMonth(since.getMonth() - RECENT_CLUB_MONTHS);
  const chunks: string[][] = [];
  for (let i = 0; i < playerIds.length; i += 100) chunks.push(playerIds.slice(i, i + 100));
  const res = await Promise.all(
    chunks.map((ids) =>
      db.from("player_match_stats")
        .select("player_id, match_date, teams:team_id ( id, name, badge_url )")
        .in("player_id", ids)
        .gte("match_date", since.toISOString())
        .order("match_date", { ascending: false })
    )
  );
  for (const r of res as any[]) {
    if (r.error) { console.warn("[RECENT_TEAMS]", r.error.message); continue; }
    // Rows come latest first: keep the first club seen per player
    for (const row of r.data || []) if (row.teams && !out.has(row.player_id)) out.set(row.player_id, row.teams);
  }
  return out;
}

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

async function fetchTrends(db: any): Promise<Map<string, "up" | "neutral" | "down">> {
  const trendByPlayer = new Map<string, "up" | "neutral" | "down">();
  try {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    const trendFromDate = d.toISOString().split("T")[0];

    const { count, error: countErr } = await db
      .from("player_match_scores")
      .select("player_id", { count: "exact", head: true })
      .gte("match_date", trendFromDate);
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
          .gte("match_date", trendFromDate)
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
      const trend = computeRatingTrend(matches.map((m) => m.score));
      if (trend) trendByPlayer.set(playerId, trend);
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
        competition_id,
        seasons:season_id ( name, is_active, start_date ),
        competitions:competition_id ( name, country, logo_url ),
        demarcacion,
        grupo_demarcacion,
        matches_played,
        minutes_played,
        goals_p90,
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
          preferred_foot,
          market_value,
          contract_expires,
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
    const PLAYER_FIELDS = `id, name, match_name, country, birth_date, photo_url, primary_position, grupo_demarcacion,
      shirt_number, height, weight, preferred_foot, market_value, contract_expires,
      fm_team_name, fm_team_badge_url, current_league_name, current_league_logo_url, sd_league_code,
      teams:current_team_id ( id, name, badge_url, league_name, league_logo_url ),
      player_ea_ratings ( pace, physicality )`;
    const fetchAllPlayers = async () => {
      const { count } = await db.from("players").select("id", { count: "exact", head: true });
      const offs: number[] = [];
      for (let from = 0; from < (count || 0); from += PAGE) offs.push(from);
      const res = await Promise.all(
        offs.map((from) => db.from("players").select(PLAYER_FIELDS).order("id").range(from, from + PAGE - 1))
      );
      const out: any[] = [];
      for (const r of res as any[]) {
        if (r.error) throw r.error;
        if (r.data) out.push(...r.data);
      }
      return out;
    };

    const [statsCountRes, sdLRes, trendByPlayer, allPlayers] = await Promise.all([
      statsCountPromise,
      db.from("sd_leagues").select("code, name, country"),
      fetchTrends(db),
      fetchAllPlayers(),
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

    const recentTeamByPlayer = await fetchRecentTeams(
      db,
      allPlayers.filter((p: any) => !p.fm_team_name && !p.teams).map((p: any) => p.id)
    );

    const data: BaseData = { rows, leagueCountryByCode, leagueCountryByName, trendByPlayer, allPlayers, recentTeamByPlayer };
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
  // ratings: "all" | "rated" | "unrated"
  const ratings = url.searchParams.get("ratings") || "all";
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
    const { rows, leagueCountryByCode, leagueCountryByName, trendByPlayer, allPlayers, recentTeamByPlayer } = base;

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

    const intlComps = new Map<string, { name: string; logoUrl: string | null }>();
    {
      // Weighted average (by minutes) of every row in scope: all seasons, or every competition of one season
      // (league + Champions League + cups add up)
      Array.from(rowsByPlayer.entries()).forEach(([playerId, allRows]) => {
        const playerRows = season === "all" ? allRows : allRows.filter((r: any) => r.seasons?.name === season);
        if (!playerRows.length) return;
        // International club competitions she played (filterable as their own "league")
        const competitions = Array.from(
          new Set<string>(
            playerRows
              .filter((r: any) => isInternational(r.competition_id, r.competitions?.country))
              .map((r: any) => r.competitions?.name)
              .filter(Boolean)
          )
        );
        for (const r of playerRows) {
          if (r.competitions?.name && isInternational(r.competition_id, r.competitions?.country) && !intlComps.has(r.competitions.name))
            intlComps.set(r.competitions.name, { name: r.competitions.name, logoUrl: r.competitions.logo_url || null });
        }
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

        // Most recent season in scope (all its competitions added up): matches, minutes and goals
        const recentSeason = latestRow.seasons?.name || null;
        const recentRows = playerRows.filter((r: any) => (r.seasons?.name || null) === recentSeason);
        const recentSum = (k: string) => recentRows.reduce((n: number, r: any) => n + (Number(r[k]) || 0), 0);

        const getWeightedVal = (k: string) => {
          const item = sumWeighted[k];
          return item.mins > 0 ? item.sum / item.mins : null;
        };

        // No current club (Soccerdonna / current_team_id): club of her latest match, only if within the last 3 months
        const fallbackTeam = !p.fm_team_name && !p.teams ? recentTeamByPlayer.get(p.id) || null : null;
        const teamName = p.fm_team_name || p.teams?.name || fallbackTeam?.name || "Unattached";
        const hasClub = !!(p.fm_team_name || p.teams || fallbackTeam);
        const leagueName = p.current_league_name || p.teams?.league_name || (hasClub ? latestRow.competitions?.name : null) || null;
        const leagueCountry =
          (p.sd_league_code ? leagueCountryByCode.get(p.sd_league_code) : null) ||
          (p.current_league_name ? leagueCountryByName.get(p.current_league_name.toLowerCase()) : null) ||
          (p.teams?.league_name ? leagueCountryByName.get(p.teams.league_name.toLowerCase()) : null) ||
          p.teams?.country ||
          null;

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
          preferredFoot: p.preferred_foot,
          marketValue: p.market_value,
          contractUntil: p.contract_expires,
          recentSeason,
          recentMatches: recentSum("matches_played"),
          recentMinutes: recentSum("minutes_played"),
          // player_season_stats only stores goals per 90: goals = goals_p90 * minutes / 90 (exact after rounding)
          recentGoals: recentRows.reduce(
            (n: number, r: any) => n + Math.round(((Number(r.goals_p90) || 0) * (Number(r.minutes_played) || 0)) / 90),
            0
          ),
          teamId: p.teams?.id || fallbackTeam?.id,
          teamName,
          badgeUrl: (p.fm_team_name ? p.fm_team_badge_url : null) || p.teams?.badge_url || fallbackTeam?.badge_url,
          leagueName,
          leagueLogoUrl: p.current_league_logo_url || p.teams?.league_logo_url || (leagueName === latestRow.competitions?.name ? latestRow.competitions?.logo_url : null),
          leagueCountry,
          seasonName: season !== "all" ? season : playerRows.length > 1 ? `All seasons (${playerRows.length})` : playerRows[0]?.seasons?.name || null,
          competitions,
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
          hasRatings: true,
        });
      });
    }

    // Players without season stats (e.g. leagues where Opta has no player data): listed without ratings
    for (const p of allPlayers) {
      if (rowsByPlayer.has(p.id) || isRetired(p)) continue;
      const ea = Array.isArray(p.player_ea_ratings) ? p.player_ea_ratings[0] : p.player_ea_ratings;
      const notaFisico =
        ea?.pace != null && ea?.physicality != null
          ? Math.round(Number(ea.pace) * 0.45 + Number(ea.physicality) * 0.55)
          : ea?.pace != null ? Number(ea.pace) : ea?.physicality != null ? Number(ea.physicality) : null;
      const teamName = p.fm_team_name || p.teams?.name || "Unattached";
      const leagueName = p.current_league_name || p.teams?.league_name || null;
      const leagueCountry =
        (p.sd_league_code ? leagueCountryByCode.get(p.sd_league_code) : null) ||
        (p.current_league_name ? leagueCountryByName.get(p.current_league_name.toLowerCase()) : null) ||
        (p.teams?.league_name ? leagueCountryByName.get(p.teams.league_name.toLowerCase()) : null) ||
        p.teams?.country ||
        null;

      list.push({
        id: p.id,
        name: p.name,
        matchName: p.match_name || p.name,
        country: p.country,
        birthDate: p.birth_date,
        photoUrl: p.photo_url,
        position: p.primary_position || "Centrocampista",
        grupoDemarcacion: p.grupo_demarcacion || "General",
        shirtNumber: p.shirt_number,
        height: p.height,
        weight: p.weight,
        preferredFoot: p.preferred_foot,
        marketValue: p.market_value,
        contractUntil: p.contract_expires,
        recentSeason: null,
        recentMatches: null,
        recentMinutes: null,
        recentGoals: null,
        teamId: p.teams?.id,
        teamName,
        badgeUrl: (p.fm_team_name ? p.fm_team_badge_url : null) || p.teams?.badge_url,
        leagueName,
        leagueLogoUrl: p.current_league_logo_url || p.teams?.league_logo_url,
        leagueCountry,
        seasonName: null,
        competitions: [],
        isAccumulated: false,
        minutesPlayed: 0,
        matchesPlayed: 0,
        notaGlobal: null,
        notaAtaque: null,
        notaConstruccion: null,
        notaDefensa: null,
        notaBalonParado: null,
        notaDisponibilidad: null,
        notaFisico,
        hasRatings: false,
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

    for (const c of Array.from(intlComps.values())) {
      if (!leaguesMap.has(c.name)) leaguesMap.set(c.name, { name: c.name, logoUrl: c.logoUrl, country: INTERNATIONAL_COUNTRY });
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

    // Leagues filter (multiple comma-separated or single): her current league, or an international
    // competition she played (Champions League...)
    const selectedLeagues = (leaguesParam ? leaguesParam.split(",") : league !== "all" ? [league] : [])
      .map(normLeague)
      .filter(Boolean);

    if (selectedLeagues.length > 0) {
      list = list.filter((p: any) => {
        const own = [p.leagueName, ...(p.competitions || [])].filter(Boolean).map(normLeague);
        return own.some((l: string) => selectedLeagues.includes(l));
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

    if (ratings === "rated") list = list.filter((p: any) => p.hasRatings);
    else if (ratings === "unrated") list = list.filter((p: any) => !p.hasRatings);

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
      market_value: "marketValue",
      contract: "contractDays",
      recent_matches: "recentMatches",
      recent_minutes: "recentMinutes",
      recent_goals: "recentGoals",
    };
    for (const p of list) p.contractDays = p.contractUntil ? Date.parse(p.contractUntil) : null;
    const field = key[key[sortBy] ? sortBy : "nota_global"];
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
