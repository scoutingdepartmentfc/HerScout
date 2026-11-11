import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminGuard";
import { checkAdminPassword } from "@/lib/adminPassword";
import { dispatchPipeline } from "@/lib/githubDispatch";
import { INTERNATIONAL_COMPETITIONS, INTERNATIONAL_IDS } from "@/lib/internationalCompetitions";

export const runtime = "nodejs";

/** International club competitions (Champions League...): seasons to download and their data in the DB.
 *  Seasons are picked with /api/admin/ingestion (add/remove), like any other Opta competition. */

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const db = supabaseAdmin as any;
  const ids = Array.from(INTERNATIONAL_IDS);
  const [catalog, targets, matches] = await Promise.all([
    db.from("opta_catalog")
      .select("season_id, competition_id, season_name, start_date, has_eventing, played_matches, data_level")
      .in("competition_id", ids)
      .limit(2000),
    db.from("ingestion_targets").select("season_id, competition_id, enabled").in("competition_id", ids),
    db.from("matches").select("competition_id").in("competition_id", ids).eq("status", "Played").limit(100000),
  ]);
  if (catalog.error) return NextResponse.json({ error: catalog.error.message }, { status: 500 });
  const played: Record<string, number> = {};
  for (const m of matches.data || []) played[m.competition_id] = (played[m.competition_id] || 0) + 1;
  const competitions = INTERNATIONAL_COMPETITIONS.map((c) => ({
    ...c,
    seasons: (catalog.data || [])
      .filter((s: any) => s.competition_id === c.id && (s.data_level || "").startsWith("jugadora"))
      .sort((a: any, b: any) => (b.start_date || "").localeCompare(a.start_date || "")),
    matchesInDb: played[c.id] || 0,
  }));
  return NextResponse.json({
    competitions,
    selectedSeasons: (targets.data || []).filter((t: any) => t.enabled).map((t: any) => t.season_id),
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json();
  const db = supabaseAdmin as any;
  const id = String(body.competitionId || "");
  if (!INTERNATIONAL_IDS.has(id)) return NextResponse.json({ error: "Unknown competition" }, { status: 400 });

  if (body.action === "run") {
    // "Actualizar": only new matches. "De 0" (rebuild): reprocess every played match of the selected seasons.
    // Photos are skipped: the players already come from their leagues. Club and current team are never touched.
    try {
      await dispatchPipeline({
        modo: "clasico",
        competition_id: id,
        extra_args: body.rebuild ? "--rebuild --skip-photos" : "--skip-photos",
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "deleteData") {
    // Deletes only this competition's matches, stats and seasons (ON DELETE CASCADE). Players and clubs are kept:
    // they belong to their leagues.
    if (!checkAdminPassword(body.password)) {
      await new Promise((r) => setTimeout(r, 800));
      return NextResponse.json({ error: "Wrong password" }, { status: 401 });
    }
    try {
      const { data: seasons } = await db.from("seasons").select("id").eq("competition_id", id);
      // Processed-matches cache: without deleting it the next download would skip those matches
      if (seasons?.length) {
        await db.storage.from("pipeline-cache").remove(seasons.map((s: any) => `metricas_partidos/${s.id}.parquet`));
      }
      const { error } = await db.from("competitions").delete().eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Could not delete" }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
