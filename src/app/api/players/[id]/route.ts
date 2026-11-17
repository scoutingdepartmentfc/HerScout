import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminGuard";

// Fields that can be edited by hand from the profile (stored in players.manual_overrides)
const EDITABLE: Record<string, "text" | "number" | "date" | "list"> = {
  name: "text",
  matchName: "text",
  country: "text",
  citizenship: "list",
  birthDate: "date",
  placeOfBirth: "text",
  height: "number",
  weight: "number",
  preferredFoot: "text",
  shirtNumber: "number",
  marketValue: "number",
  contractUntil: "date",
  joinedOn: "date",
  photoUrl: "text",
  primaryPosition: "text",
  otherPositions: "list",
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = supabaseAdmin as any;
  const { data: current, error: readError } = await db
    .from("players").select("id, manual_overrides").eq("id", params.id).single();
  if (readError || !current) {
    return NextResponse.json({ error: readError?.message || "Player not found" }, { status: 404 });
  }

  // null / "" / [] removes the override (back to the scraped value)
  const overrides: Record<string, any> = { ...(current.manual_overrides || {}) };
  for (const [key, kind] of Object.entries(EDITABLE)) {
    if (!(key in (body.overrides || {}))) continue;
    const raw = body.overrides[key];
    let value: any = null;
    if (kind === "list") {
      const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
      const clean = Array.from(new Set(arr.map((v: any) => String(v).trim()).filter(Boolean)));
      value = clean.length ? clean : null;
    } else if (kind === "number") {
      const n = raw === "" || raw == null ? NaN : Number(raw);
      value = Number.isFinite(n) ? n : null;
    } else if (kind === "date") {
      value = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
    } else {
      value = typeof raw === "string" && raw.trim() ? raw.trim() : null;
    }
    if (value == null) delete overrides[key];
    else overrides[key] = value;
  }

  const { error } = await db
    .from("players")
    .update({ manual_overrides: overrides, manual_updated_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, overrides });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const playerId = params.id;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    // 1. Player Demographics
    const playerRes = await (supabaseAdmin as any)
      .from("players")
      .select(`
        id,
        name,
        match_name,
        first_name,
        last_name,
        country,
        birth_date,
        photo_url,
        fotmob_photo_url,
        primary_position,
        grupo_demarcacion,
        shirt_number,
        height,
        weight,
        preferred_foot,
        place_of_birth,
        market_value,
        contract_expires,
        joined_on,
        sd_url,
        tm_positions_other,
        tm_position_main,
        citizenship,
        fm_team_name,
        fm_team_badge_url,
        current_league_name,
        current_league_logo_url,
        teams ( id, name, badge_url, league_name, league_logo_url )
      `)
      .eq("id", playerId)
      .single();

    if (playerRes.error || !playerRes.data) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const p = playerRes.data;

    // 2. Player Season Stats with raw metric breakdown
    const statsRes = await (supabaseAdmin as any)
      .from("player_season_stats")
      .select(`
        *,
        seasons ( name, start_date, end_date, is_active ),
        competitions ( name, logo_url, country ),
        teams ( name, badge_url, league_name, league_logo_url )
      `)
      .eq("player_id", playerId)
      .order("updated_at", { ascending: false });

    // 3. Match log: every match played with its 0-9.9 rating, and the Soccerdonna career data
    const db = supabaseAdmin as any;
    const [matchStats, matchScores, marketValues, transfers, nationalTeams, injuries, physical, eaRatings] = await Promise.all([
      db.from("player_match_stats")
        .select(`
          match_id, team_id, competition_id, season_id, match_date, minutes_played, is_starter, goals, assists, demarcacion,
          matches ( home_score, away_score, home_team_id, away_team_id, has_events, has_stats,
            home_team:teams!home_team_id ( id, name, badge_url ),
            away_team:teams!away_team_id ( id, name, badge_url ),
            competitions ( name ) )
        `)
        .eq("player_id", playerId)
        .order("match_date", { ascending: false })
        .limit(1000),
      db.from("player_match_scores")
        .select("match_id, score_general, score_ofensivo, score_defensivo, score_comportamiento, score_abp")
        .eq("player_id", playerId),
      db.from("player_market_values").select("date, market_value, club_name, club_badge_url")
        .eq("player_id", playerId).order("date", { ascending: true }),
      db.from("player_transfers").select("date, season, club_from, club_to, club_from_badge_url, club_to_badge_url, fee_text, loan")
        .eq("player_id", playerId).order("date", { ascending: false }),
      db.from("player_national_teams").select("team_name, debut_date, caps, goals")
        .eq("player_id", playerId).order("caps", { ascending: false }),
      db.from("player_injuries").select("season, from_date, until_date, days, injury")
        .eq("player_id", playerId).order("from_date", { ascending: false }),
      // Football Manager physical attributes (1-20), imported with pipeline/fm_fisico.py
      db.from("player_physical")
        .select("acceleration, agility, balance, jumping_reach, natural_fitness, pace, stamina, strength, fm_name, fm_club, updated_at")
        .eq("player_id", playerId).maybeSingle(),
      // EA SPORTS FC ratings (1-99), imported with pipeline/ea_fc.py
      db.from("player_ea_ratings")
        .select("pace, acceleration, sprint_speed, physicality, jumping, stamina, strength, aggression, edition, ea_club")
        .eq("player_id", playerId).maybeSingle(),
    ]);
    const scoreByMatch = new Map<string, any>((matchScores.data || []).map((r: any) => [r.match_id, r]));

    // Fetch league averages for metrics (cached in memory or queried from player_season_stats)
    const leagueAverages = await getLeagueAverages(db);

    const matchLog = (matchStats.data || []).map((r: any) => {
      const m = r.matches || {};
      const isHome = m.home_team_id === r.team_id;
      const opponent = isHome ? m.away_team : m.home_team;
      const sc = scoreByMatch.get(r.match_id);
      return {
        matchId: r.match_id,
        seasonId: r.season_id,
        competitionId: r.competition_id,
        hasEvents: !!m.has_events,
        hasStats: m.has_stats !== false,
        date: r.match_date,
        competition: m.competitions?.name,
        isHome,
        opponent: { id: opponent?.id, name: opponent?.name, badgeUrl: opponent?.badge_url },
        goalsFor: isHome ? m.home_score : m.away_score,
        goalsAgainst: isHome ? m.away_score : m.home_score,
        minutes: r.minutes_played,
        starter: r.is_starter,
        goals: r.goals,
        assists: r.assists,
        position: r.demarcacion,
        rating: sc?.score_general ?? null,
        ratings: sc
          ? { attack: sc.score_ofensivo, defence: sc.score_defensivo, behaviour: sc.score_comportamiento, setPieces: sc.score_abp }
          : null,
      };
    });

    // Opta data available per (competition, season): matches played, how many with eventing / matchstats, goals and assists
    const coverageKey = (comp: string, season: string) => `${comp}|${season}`;
    const coverage = new Map<string, { matches: number; minutes: number; withEvents: number; withStats: number; goals: number; assists: number }>();
    for (const r of matchStats.data || []) {
      const k = coverageKey(r.competition_id, r.season_id);
      const c = coverage.get(k) || { matches: 0, minutes: 0, withEvents: 0, withStats: 0, goals: 0, assists: 0 };
      c.matches += 1;
      c.minutes += Number(r.minutes_played) || 0;
      c.goals += Number(r.goals) || 0;
      c.assists += Number(r.assists) || 0;
      if (r.matches?.has_events) c.withEvents += 1;
      if (r.matches?.has_stats !== false) c.withStats += 1;
      coverage.set(k, c);
    }

    // One entry per season with Opta data, latest first. Seasons where she played too few minutes for a
    // season rating (pipeline MIN_MINUTOS_TEMPORADA) still appear, without ratings.
    const seasonStats: any[] = (statsRes.data || []).map((s: any) => {
      const cov = coverage.get(coverageKey(s.competition_id, s.season_id)) || null;
      return {
        ...s,
        goals: cov?.goals ?? 0,
        assists: cov?.assists ?? 0,
        coverage: cov,
      };
    });
    const conFila = new Set(seasonStats.map((s) => coverageKey(s.competition_id, s.season_id)));
    const sinFila = Array.from(coverage.entries()).filter(([k]) => !conFila.has(k));
    if (sinFila.length) {
      const seasonIds = sinFila.map(([k]) => k.split("|")[1]);
      const { data: seasonsInfo } = await db
        .from("seasons")
        .select("id, name, start_date, end_date, is_active, competitions ( name, logo_url, country )")
        .in("id", seasonIds);
      const info = new Map<string, any>((seasonsInfo || []).map((r: any) => [r.id, r]));
      for (const [k, c] of sinFila) {
        const [competitionId, seasonId] = k.split("|");
        const si = info.get(seasonId);
        seasonStats.push({
          id: k,
          competition_id: competitionId,
          season_id: seasonId,
          seasons: si ? { name: si.name, start_date: si.start_date, end_date: si.end_date, is_active: si.is_active } : null,
          competitions: si?.competitions || null,
          matches_played: c.matches,
          minutes_played: c.minutes,
          goals: c.goals,
          assists: c.assists,
          coverage: c,
          sinNotas: true,
        });
      }
    }
    seasonStats.sort((a, b) =>
      String(b.seasons?.start_date || "").localeCompare(String(a.seasons?.start_date || "")) ||
      (b.minutes_played || 0) - (a.minutes_played || 0)
    );

    const seasonRow = seasonStats.find((s) => !s.sinNotas) || null;
    // Only real metrics computed by the pipeline (no invented notes when radar_data is missing)
    const metricasMap: Record<string, [number, number]> = seasonRow?.radar_data?.metricas || {};

    // All seasons together (default view): matches, minutes and Opta coverage are summed; ratings, metric
    // values and metric notes are averaged weighted by the minutes of each season that has them.
    const allSeasons = seasonStats.length > 1 ? agregarTemporadas(seasonStats) : null;

    // Calculate played positions from matchLog to know all positions she actually plays
    const posCounts: Record<string, { min: number; pj: number }> = {};
    (matchStats.data || []).forEach((m: any) => {
      const pos = m.demarcacion || p.primary_position;
      if (pos) {
        if (!posCounts[pos]) posCounts[pos] = { min: 0, pj: 0 };
        posCounts[pos].min += Number(m.minutes_played) || 0;
        posCounts[pos].pj += 1;
      }
    });

    // Total minutes across all positions played
    const totalMinutesPlayed = Object.values(posCounts).reduce((acc, curr) => acc + (curr.min || 0), 0);

    // Positions sorted by most minutes played
    const sortedPlayedPositions = Object.entries(posCounts)
      .sort((a, b) => b[1].min - a[1].min)
      .map(([pos]) => pos);

    // Only positions with >= 20% of total minutes played (excluding the primary most used position)
    const qualifyingSecondaryPositions = Object.entries(posCounts)
      .filter(([pos, data]) => {
        if (pos === sortedPlayedPositions[0]) return false;
        if (totalMinutesPlayed <= 0) return false;
        return (data.min / totalMinutesPlayed) >= 0.20;
      })
      .sort((a, b) => b[1].min - a[1].min)
      .map(([pos]) => pos);

    // Separate query so the profile still loads if the manual_overrides migration is not applied yet
    const { data: manual } = await db.from("players").select("manual_overrides").eq("id", playerId).maybeSingle();
    const o: Record<string, any> = manual?.manual_overrides || {};
    const scrapedPrimary = sortedPlayedPositions[0] || p.primary_position || "Midfielder";
    // No current club (no Soccerdonna match and no current_team_id): club of her latest Opta match,
    // only if it was played in the last 3 months (an older one may be a former club)
    const recentLimit = new Date();
    recentLimit.setMonth(recentLimit.getMonth() - 3);
    const lastMatch = (matchStats.data || []).find((m: any) => m.match_date && new Date(m.match_date) >= recentLimit);
    const lastTeam = lastMatch
      ? (lastMatch.matches?.home_team?.id === lastMatch.team_id ? lastMatch.matches?.home_team : lastMatch.matches?.away_team)
      : null;
    const fallbackTeam = !p.fm_team_name && !p.teams ? lastTeam : null;
    const hasClub = !!(p.fm_team_name || p.teams || fallbackTeam);

    const scraped = {
      id: p.id,
      name: p.name,
      matchName: p.match_name || p.name,
      country: p.country,
      birthDate: p.birth_date,
      photoUrl: p.fotmob_photo_url || p.photoUrl || p.photo_url,
      primaryPosition: scrapedPrimary,
      playedPositions: sortedPlayedPositions,
      positionsMap: posCounts,
      grupoDemarcacion: p.grupo_demarcacion,
      shirtNumber: p.shirt_number,
      height: p.height,
      weight: p.weight,
      preferredFoot: p.preferred_foot,
      placeOfBirth: p.place_of_birth,
      marketValue: p.market_value,
      contractUntil: p.contract_expires,
      joinedOn: p.joined_on,
      sdUrl: p.sd_url,
      otherPositions: qualifyingSecondaryPositions,
      sdPosition: p.tm_position_main,
      citizenship: p.citizenship || [],
      teamId: p.teams?.id || fallbackTeam?.id,
      // Club actual y su liga según Soccerdonna; si no, el equipo Opta
      teamName: p.fm_team_name || p.teams?.name || fallbackTeam?.name || "Unattached",
      badgeUrl: (p.fm_team_name ? p.fm_team_badge_url : null) || p.teams?.badge_url || fallbackTeam?.badge_url,
      // Without a current club (and no match in the last 3 months) the league of an old season is not shown either
      leagueName: p.current_league_name || p.teams?.league_name || (hasClub ? seasonRow?.competitions?.name || seasonRow?.teams?.league_name : null),
      leagueLogoUrl: p.current_league_logo_url || p.teams?.league_logo_url || (hasClub ? seasonRow?.competitions?.logo_url || seasonRow?.teams?.league_logo_url : null),
    };

    return NextResponse.json({
      // Manual edits win over scraped data; `scraped` lets the edit form show the original values
      player: { ...scraped, ...o, manualOverrides: o },
      scraped,
      seasonStats,
      allSeasons,
      matchLog,
      marketValues: marketValues.data || [],
      transfers: transfers.data || [],
      nationalTeams: nationalTeams.data || [],
      injuries: injuries.data || [],
      physical: physical.error ? null : physical.data || null,
      eaRatings: eaRatings.error ? null : eaRatings.data || null,
      metricas: metricasMap,
      leagueAverages,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

const NOTAS = ["nota_global", "nota_ataque", "nota_construccion", "nota_defensa", "nota_balon_parado",
  "nota_disponibilidad", "percentile_general"];

function agregarTemporadas(seasons: any[]) {
  const conNotas = seasons.filter((s) => !s.sinNotas);
  const mins = (s: any) => Number(s.minutes_played) || 0;
  const media = (vals: [number, number][]) => {
    const peso = vals.reduce((n, [, w]) => n + w, 0);
    return peso > 0 ? vals.reduce((n, [v, w]) => n + v * w, 0) / peso : null;
  };

  const notas: Record<string, number | null> = {};
  for (const k of NOTAS) {
    notas[k] = media(conNotas.filter((s) => s[k] != null).map((s) => [Number(s[k]), mins(s)]));
  }

  const porMetrica: Record<string, { v: [number, number][]; n: [number, number][] }> = {};
  for (const s of conNotas) {
    for (const [k, par] of Object.entries<any>(s.radar_data?.metricas || {})) {
      if (!Array.isArray(par)) continue;
      const e = (porMetrica[k] ||= { v: [], n: [] });
      if (par[0] != null) e.v.push([Number(par[0]), mins(s)]);
      if (par[1] != null) e.n.push([Number(par[1]), mins(s)]);
    }
  }
  const metricas: Record<string, [number, number]> = {};
  for (const [k, e] of Object.entries(porMetrica)) {
    const v = media(e.v);
    const n = media(e.n);
    if (v != null && n != null) metricas[k] = [Math.round(v * 1000) / 1000, Math.round(n * 100) / 100];
  }

  const coverage = { matches: 0, minutes: 0, withEvents: 0, withStats: 0 };
  for (const s of seasons) {
    if (!s.coverage) continue;
    coverage.matches += s.coverage.matches;
    coverage.minutes += s.coverage.minutes;
    coverage.withEvents += s.coverage.withEvents;
    coverage.withStats += s.coverage.withStats;
  }
  const principal = [...conNotas].sort((a, b) => mins(b) - mins(a))[0];

  return {
    id: "all",
    competition_id: "all",
    season_id: "all",
    esTotal: true,
    sinNotas: conNotas.length === 0,
    competitions: { name: `${new Set(seasons.map((s) => s.competition_id)).size} competitions` },
    seasons: { name: `All seasons (${seasons.length})` },
    grupo_demarcacion: principal?.grupo_demarcacion ?? null,
    matches_played: seasons.reduce((n, s) => n + (Number(s.matches_played) || 0), 0),
    minutes_played: seasons.reduce((n, s) => n + mins(s), 0),
    goals: seasons.reduce((n, s) => n + (Number(s.goals) || 0), 0),
    assists: seasons.reduce((n, s) => n + (Number(s.assists) || 0), 0),
    coverage,
    ...notas,
    radar_data: { metricas },
  };
}

let cachedLeagueAverages: Record<string, number> | null = null;
let lastCacheTime = 0;

async function getLeagueAverages(db: any): Promise<Record<string, number>> {
  const now = Date.now();
  if (cachedLeagueAverages && now - lastCacheTime < 5 * 60 * 1000) {
    return cachedLeagueAverages;
  }

  try {
    const { data } = await db
      .from("player_season_stats")
      .select("minutes_played, radar_data")
      .not("radar_data", "is", null);

    if (!data || data.length === 0) return {};

    const metricSums: Record<string, number> = {};
    const metricMinutes: Record<string, number> = {};

    for (const row of data) {
      const minutes = Number(row.minutes_played) || 0;
      const metrics = row.radar_data?.metricas || {};
      for (const [key, pair] of Object.entries<any>(metrics)) {
        if (!Array.isArray(pair) || pair[0] == null || key.startsWith("_")) continue;
        const val = Number(pair[0]);
        if (isNaN(val)) continue;

        if (minutes > 0) {
          metricSums[key] = (metricSums[key] || 0) + val * minutes;
          metricMinutes[key] = (metricMinutes[key] || 0) + minutes;
        } else {
          metricSums[key] = (metricSums[key] || 0) + val;
          metricMinutes[key] = (metricMinutes[key] || 0) + 1;
        }
      }
    }

    const averages: Record<string, number> = {};
    for (const [key, sum] of Object.entries(metricSums)) {
      const totalMin = metricMinutes[key] || 1;
      averages[key] = Number((sum / totalMin).toFixed(3));
    }

    cachedLeagueAverages = averages;
    lastCacheTime = now;
    return averages;
  } catch (err) {
    console.error("Failed to compute league averages:", err);
    return cachedLeagueAverages || {};
  }
}

