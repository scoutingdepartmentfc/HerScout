import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminGuard";
import { dispatchPipeline } from "@/lib/githubDispatch";

/**
 * Leagues & seasons for the automatic Opta download (pipeline/ingest.py + pipeline/soccerdonna.py).
 * - opta_catalog: every Opta women's competition/season (filled by `python -m pipeline.catalogo`)
 * - ingestion_targets: the seasons the platform admin selected; the weekly GitHub Action reads them
 */

const PAGE = 1000;

// PostgREST returns at most 1000 rows per request: page through the catalog
async function selectAll(table: string, apply: (q: any) => any = (q) => q) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await apply((supabaseAdmin as any).from(table).select("*")).range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const [catalog, targets, runs] = await Promise.all([
      // Retrieve all seasons in the Opta catalog
      selectAll("opta_catalog"),
      selectAll("ingestion_targets"),
      (supabaseAdmin as any)
        .from("ingestion_runs")
        .select("id, started_at, finished_at, status, matches_processed, players_updated")
        .order("started_at", { ascending: false })
        .limit(5),
    ]);
    return NextResponse.json({ catalog, targets, runs: runs.data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Could not load the Opta catalog" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json();
  const db = supabaseAdmin as any;
  const now = new Date().toISOString();

  try {
    if (body.action === "add") {
      // Add seasons from the catalog; the most recent one becomes the active season unless the league has one
      const { data: seasons, error } = await db.from("opta_catalog").select("*").in("season_id", body.seasonIds || []);
      if (error) throw error;
      if (!seasons?.length) return NextResponse.json({ error: "Unknown seasons" }, { status: 400 });
      const { data: current } = await db.from("ingestion_targets").select("competition_id, is_active");
      const withActive = new Set((current || []).filter((t: any) => t.is_active).map((t: any) => t.competition_id));
      const latest = new Map<string, any>();
      for (const s of seasons) {
        const prev = latest.get(s.competition_id);
        if (!prev || (s.start_date || "") > (prev.start_date || "")) latest.set(s.competition_id, s);
      }
      const { error: upErr } = await db.from("ingestion_targets").upsert(
        seasons.map((s: any) => ({
          season_id: s.season_id,
          competition_id: s.competition_id,
          competition_name: s.competition_name,
          country: s.country,
          season_name: s.season_name,
          fuente: s.has_eventing ? "eventing" : "matchstats",
          is_active: !withActive.has(s.competition_id) && latest.get(s.competition_id)?.season_id === s.season_id,
          enabled: true,
          updated_at: now,
        })),
        { onConflict: "season_id" }
      );
      if (upErr) throw upErr;
    } else if (body.action === "update") {
      const changes: Record<string, any> = {};
      if (typeof body.enabled === "boolean") changes.enabled = body.enabled;
      if (body.fotmobId !== undefined) changes.fotmob_id = body.fotmobId ? Number(body.fotmobId) : null;
      if (body.isActive === true) {
        // Only one active (current) season per league: its squads give the current team and shirt numbers
        const { data: target } = await db.from("ingestion_targets").select("competition_id").eq("season_id", body.seasonId).single();
        if (!target) return NextResponse.json({ error: "Unknown season" }, { status: 404 });
        const { error } = await db.from("ingestion_targets").update({ is_active: false }).eq("competition_id", target.competition_id);
        if (error) throw error;
        changes.is_active = true;
      }
      // FotMob league id is per league: keep it the same on every season of that league
      if ("fotmob_id" in changes) {
        const { data: target } = await db.from("ingestion_targets").select("competition_id").eq("season_id", body.seasonId).single();
        if (target) {
          const { error } = await db.from("ingestion_targets")
            .update({ fotmob_id: changes.fotmob_id, updated_at: now })
            .eq("competition_id", target.competition_id);
          if (error) throw error;
        }
      }
      const { error } = await db.from("ingestion_targets").update({ ...changes, updated_at: now }).eq("season_id", body.seasonId);
      if (error) throw error;
    } else if (body.action === "run") {
      // Download now: every enabled league (or one competition): Opta → Soccerdonna → FotMob photos
      const inputs: Record<string, string> = { modo: "jugadoras" };
      if (body.competitionId) inputs.competition_id = String(body.competitionId);
      if (body.limit) inputs.limite = String(Number(body.limit));
      await dispatchPipeline(inputs);
    } else if (body.action === "remove") {
      // Only stops future downloads: players and stats already in the database are kept
      const { error } = await db.from("ingestion_targets").delete().eq("season_id", body.seasonId);
      if (error) throw error;
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Could not save" }, { status: 500 });
  }
}
