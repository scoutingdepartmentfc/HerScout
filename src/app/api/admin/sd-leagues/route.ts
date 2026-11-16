import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminGuard";
import { checkAdminPassword } from "@/lib/adminPassword";
import { dispatchPipeline } from "@/lib/githubDispatch";

export const runtime = "nodejs";

/** Soccerdonna leagues (sd_leagues): which ones to download and their Opta competition for metrics. */

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const db = supabaseAdmin as any;
  const [leagues, opta, players, lastRun] = await Promise.all([
    db.from("sd_leagues").select("*").order("country").order("code"),
    db.from("opta_catalog")
      .select("season_id, competition_id, competition_name, country, season_name, start_date, has_eventing, played_matches")
      .like("data_level", "jugadora%")
      .limit(5000),
    db.from("players").select("sd_league_code").not("sd_league_code", "is", null).limit(100000),
    db.from("ingestion_runs").select("status, error_message").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (leagues.error) return NextResponse.json({ error: leagues.error.message }, { status: 500 });
  // One entry per Opta competition with its latest season that has per-player stats
  const competitions = new Map<string, any>();
  for (const c of opta.data || []) {
    const prev = competitions.get(c.competition_id);
    if (!prev || (c.start_date || "") > (prev.start_date || "")) competitions.set(c.competition_id, c);
  }
  const downloaded: Record<string, number> = {};
  for (const p of players.data || []) downloaded[p.sd_league_code] = (downloaded[p.sd_league_code] || 0) + 1;
  // Seasons with per-player stats of each Opta competition, newest first
  const optaSeasons: Record<string, any[]> = {};
  for (const c of opta.data || []) (optaSeasons[c.competition_id] ||= []).push(c);
  for (const k in optaSeasons) optaSeasons[k].sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""));
  return NextResponse.json({
    leagues: leagues.data,
    optaCompetitions: Array.from(competitions.values()),
    optaSeasons,
    selectedSeasons: [],
    downloaded,
    lastRunError: lastRun?.data?.status === "failed" ? lastRun.data.error_message : null,
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json();
  const db = supabaseAdmin as any;
  if (body.action === "update") {
    const changes: Record<string, any> = { updated_at: new Date().toISOString() };
    if (typeof body.enabled === "boolean") changes.enabled = body.enabled;
    if (body.optaCompetitionId !== undefined) changes.opta_competition_id = body.optaCompetitionId || null;
    if (Array.isArray(body.optaSeasonIds)) changes.opta_season_ids = body.optaSeasonIds;
    const { data: before } = await db.from("sd_leagues").select("enabled, last_download_at").eq("code", body.code).single();
    const { error } = await db.from("sd_leagues").update(changes).eq("code", body.code);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // League just activated and never downloaded: start Soccerdonna + Opta (all its seasons) right away.
    // The "opta" run picks up every enabled league without last_download_at, so several activations in a row
    // are all covered even if GitHub replaces a pending run.
    if (body.enabled === true && before && !before.enabled && !before.last_download_at) {
      try {
        await dispatchPipeline({ competition_id: String(body.code || "") });
        return NextResponse.json({ ok: true, started: true });
      } catch (err: any) {
        return NextResponse.json({ ok: true, started: false, warning: err.message });
      }
    }
    return NextResponse.json({ ok: true });
  }
  if (body.action === "run") {
    const inputs: Record<string, string> = {};
    if (body.code) inputs.competition_id = String(body.code);
    try {
      await dispatchPipeline(inputs);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
  if (body.action === "deleteData") {
    // Borra todo lo descargado de la liga: jugadoras y clubes de Soccerdonna y los datos Opta de su competición
    if (!checkAdminPassword(body.password)) {
      await new Promise((r) => setTimeout(r, 800));
      return NextResponse.json({ error: "Wrong password" }, { status: 401 });
    }
    try {
      const { data: league } = await db.from("sd_leagues").select("code, opta_competition_id").eq("code", body.code).single();
      if (!league) return NextResponse.json({ error: "Unknown league" }, { status: 404 });
      const comp = league.opta_competition_id;
      const ids = async (table: string, col: string, filter: (q: any) => any) => {
        const { data, error } = await filter(db.from(table).select(col)).limit(100000);
        if (error) throw error;
        return (data || []).map((r: any) => r[col]);
      };
      const teamIds = [
        ...(await ids("teams", "id", (q) => q.eq("sd_league_code", league.code))),
        ...(comp ? await ids("teams", "id", (q) => q.eq("competition_id", comp)) : []),
      ];
      const playerIds = new Set<string>(await ids("players", "id", (q) => q.eq("sd_league_code", league.code)));
      if (teamIds.length) {
        for (const id of await ids("players", "id", (q) => q.in("current_team_id", teamIds))) playerIds.add(id);
      }
      if (comp) {
        for (const id of await ids("squad_members", "player_id", (q) => q.eq("competition_id", comp))) playerIds.add(id);
        const seasons = await ids("seasons", "id", (q) => q.eq("competition_id", comp));
        // Caché de partidos procesados: sin borrarla, la próxima descarga se saltaría esos partidos
        if (seasons.length) await db.storage.from("pipeline-cache").remove(seasons.map((s: string) => `metricas_partidos/${s}.parquet`));
        // Partidos, estadísticas y temporadas cuelgan de la competición (ON DELETE CASCADE)
        const { error } = await db.from("competitions").delete().eq("id", comp);
        if (error) throw error;
      }
      // Valores, traspasos, lesiones y selección cuelgan de la jugadora (ON DELETE CASCADE)
      const list = Array.from(playerIds);
      for (let i = 0; i < list.length; i += 200) {
        const { error } = await db.from("players").delete().in("id", list.slice(i, i + 200));
        if (error) throw error;
      }
      if (teamIds.length) {
        const { error } = await db.from("teams").delete().in("id", teamIds);
        if (error) throw error;
      }
      await db.from("sd_leagues").update({ last_download_at: null }).eq("code", league.code);
      return NextResponse.json({ ok: true, players: list.length, teams: teamIds.length });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Could not delete" }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
