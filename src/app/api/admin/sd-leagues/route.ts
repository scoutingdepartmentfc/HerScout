import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminGuard";
import { checkAdminPassword } from "@/lib/adminPassword";
import { dispatchPipeline, pipelineRunsUrl } from "@/lib/githubDispatch";

export const runtime = "nodejs";

/** Soccerdonna leagues (sd_leagues): which ones to download, their Opta ID/seasons and the status of each part
 *  (Soccerdonna, Opta, FotMob photos). Downloads run in GitHub Actions (.github/workflows/pipeline.yml). */

const PARTS = ["soccerdonna", "opta", "fotmob"] as const;
const PAGE = 1000;

/** PostgREST returns at most 1000 rows per request: read every page. */
async function selectAll(build: (from: number, to: number) => any) {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

/** "todo" or a comma list of soccerdonna/opta/fotmob; also "catalogo". Anything else → null. */
function parsePasos(raw: unknown): string | null {
  const value = String(raw || "todo").replace(/\s/g, "");
  if (value === "todo" || value === "catalogo") return value;
  const parts = value.split(",").filter(Boolean);
  if (!parts.length || parts.some((p) => !(PARTS as readonly string[]).includes(p))) return null;
  // Same order as the pipeline; the three together = the full standard flow
  const ordered = PARTS.filter((p) => parts.includes(p));
  return ordered.length === PARTS.length ? "todo" : ordered.join(",");
}

/** https://www.soccerdonna.de/de/super-league/startseite/wettbewerb_SLV.html → { code: "SLV", url: "/en/super-league/..." } */
function parseLeagueUrl(raw: string): { code: string; url: string } | null {
  const m = String(raw || "").trim().match(/soccerdonna\.de\/(?:de|en)\/([^/\s]+)\/[a-z]+\/wettbewerb_([A-Za-z0-9]+)\.html/i);
  if (!m) return null;
  const code = m[2].toUpperCase();
  return { code, url: `/en/${m[1]}/startseite/wettbewerb_${code}.html` };
}

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const db = supabaseAdmin as any;
  try {
    const [leagues, catalog, players, teams] = await Promise.all([
      db.from("sd_leagues").select("*").order("country").order("code"),
      selectAll((a, b) =>
        db.from("opta_catalog")
          .select("season_id, competition_id, competition_name, country, season_name, start_date, has_eventing, played_matches")
          .like("data_level", "jugadora%")
          .range(a, b)
      ),
      selectAll((a, b) =>
        db.from("players").select("id, sd_league_code, photo_url").not("sd_league_code", "is", null).range(a, b)
      ),
      selectAll((a, b) => db.from("teams").select("id, sd_league_code").not("sd_league_code", "is", null).range(a, b)),
    ]);
    if (leagues.error) throw leagues.error;
    // Seasons with per-player stats of each Opta competition, newest first; one entry per competition (latest)
    const optaSeasons: Record<string, any[]> = {};
    for (const c of catalog) (optaSeasons[c.competition_id] ||= []).push(c);
    for (const k in optaSeasons) optaSeasons[k].sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""));
    const optaCompetitions = Object.values(optaSeasons).map((s) => s[0]);
    // Status per league: players (Soccerdonna), with photo, linked to Opta (row id is the Opta id, not "sd-")
    const stats: Record<string, { players: number; photos: number; opta: number; teams: number }> = {};
    const row = (code: string) => (stats[code] ||= { players: 0, photos: 0, opta: 0, teams: 0 });
    for (const p of players) {
      const s = row(p.sd_league_code);
      s.players++;
      if (p.photo_url) s.photos++;
      if (!String(p.id).startsWith("sd-")) s.opta++;
    }
    for (const t of teams) if (String(t.id).startsWith("sd-")) row(t.sd_league_code).teams++;
    return NextResponse.json({ leagues: leagues.data, optaCompetitions, optaSeasons, stats, runsUrl: pipelineRunsUrl() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Could not load leagues" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json();
  const db = supabaseAdmin as any;
  if (body.action === "update") {
    const changes: Record<string, any> = { updated_at: new Date().toISOString() };
    if (typeof body.enabled === "boolean") changes.enabled = body.enabled;
    if (Array.isArray(body.optaSeasonIds)) changes.opta_season_ids = body.optaSeasonIds.map(String);
    const { data: before } = await db.from("sd_leagues")
      .select("enabled, last_download_at, opta_competition_id").eq("code", body.code).single();
    if (!before) return NextResponse.json({ error: "Unknown league" }, { status: 404 });
    if (body.optaCompetitionId !== undefined) {
      const id = String(body.optaCompetitionId || "").trim();
      if (id && !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
        return NextResponse.json({ error: "Opta ID: only letters, digits, - and _" }, { status: 400 });
      }
      changes.opta_competition_id = id || null;
      // Seasons belong to the previous competition
      if ((before.opta_competition_id || "") !== id) changes.opta_season_ids = [];
    }
    const { error } = await db.from("sd_leagues").update(changes).eq("code", body.code);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Activating does not download anything: downloads start only from the /admin buttons
    return NextResponse.json({ ok: true });
  }
  if (body.action === "addUrl") {
    // League pasted from soccerdonna.de: enable it (adding it to the catalog if it was not there)
    const parsed = parseLeagueUrl(body.url);
    if (!parsed) return NextResponse.json({ error: "Not a Soccerdonna league URL (…/wettbewerb_XXX.html)" }, { status: 400 });
    const { data: existing } = await db.from("sd_leagues").select("code").eq("code", parsed.code).maybeSingle();
    const now = new Date().toISOString();
    const { error } = existing
      ? await db.from("sd_leagues").update({ enabled: true, updated_at: now }).eq("code", parsed.code)
      // Name unknown until the pipeline reads the page (<h1>): the code meanwhile
      : await db.from("sd_leagues").insert({ code: parsed.code, name: parsed.code, url: parsed.url, enabled: true, updated_at: now });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, code: parsed.code, added: !existing });
  }
  if (body.action === "run") {
    const pasos = parsePasos(body.pasos);
    if (!pasos) return NextResponse.json({ error: "Unknown download part" }, { status: 400 });
    const inputs: Record<string, string> = { pasos };
    if (body.code) {
      const { data: league } = await db.from("sd_leagues").select("code").eq("code", String(body.code)).maybeSingle();
      if (!league) return NextResponse.json({ error: "Unknown league" }, { status: 404 });
      inputs.liga = league.code;
    }
    if (body.allSeasons) inputs.todas_temporadas = "true";
    try {
      await dispatchPipeline(inputs);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, runsUrl: pipelineRunsUrl() });
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
      await db.from("sd_leagues").update({ last_download_at: null, last_opta_at: null, last_fotmob_at: null }).eq("code", league.code);
      return NextResponse.json({ ok: true, players: list.length, teams: teamIds.length });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Could not delete" }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
