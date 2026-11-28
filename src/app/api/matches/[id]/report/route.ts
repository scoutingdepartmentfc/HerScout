import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { buildMatchContext, orgFromHeader, snapshotFor, UUID_RE, type Participant } from "@/lib/matchReportServer";
import { clampStars, isOptaConsistent, snapMatchRating } from "@/lib/matchReportLogic";

/**
 * GET /api/matches/[id]/report?scoutId=…
 * Match Report v2 (SPEC §5): participants with everything auto-filled + this scout's reports and match note.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const scoutId = req.nextUrl.searchParams.get("scoutId");
  try {
    const ctx = await buildMatchContext(
      db,
      params.id,
      scoutId && UUID_RE.test(scoutId) ? scoutId : null,
      orgFromHeader(req.headers.get("x-user-org-id"))
    );
    if (!ctx) return NextResponse.json({ error: "Match not found" }, { status: 404 });
    return NextResponse.json(ctx);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to load match report" }, { status: 500 });
  }
}

interface IncomingReport {
  playerId: string;
  matchRating: number;
  ratingNow?: number | null;
  ratingPotential?: number | null;
  positionStart?: string | null;
  positionEnd?: string | null;
  systemStart?: string | null;
  systemEnd?: string | null;
  vsLast?: Record<string, number> | null;
  watchFor?: { item: string; result: string }[] | null;
  pillarFlash?: Record<string, number> | null;
  tagsSeen?: string[];
  playerNote?: string | null;
  consistencyNote?: string | null;
}

const VS_KEYS = ["overall", "technical", "physical", "decision", "tactical", "mentality"];
const PILLARS = ["technique", "game_vision", "decision_making", "pace", "strength"];
const WATCH_RESULTS = ["better", "same", "worse", "not_seen"];

const cleanTri = (obj: any, keys: string[]) => {
  if (!obj || typeof obj !== "object") return null;
  const out: Record<string, number> = {};
  for (const k of keys) if ([-1, 0, 1].includes(obj[k])) out[k] = obj[k];
  return Object.keys(out).length ? out : null;
};
const short = (v: any, n: number) => (v == null ? null : String(v).trim().slice(0, n) || null);
const starOrNull = (v: any) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : clampStars(Number(v)));

/**
 * POST /api/matches/[id]/report
 * { scoutId, mode: live|video, publish: boolean, reports: IncomingReport[] }
 * Saves (draft) or publishes the scout's match reports. Auto fields are snapshotted server-side.
 * Stars go to PlayerStarRating and to the scout's full-report draft (SPEC §6.9).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const scoutId = String(body.scoutId || "");
  if (!UUID_RE.test(scoutId)) return NextResponse.json({ error: "Select who you are (scout) first" }, { status: 400 });
  const mode = body.mode === "video" ? "video" : "live";
  const publish = !!body.publish;
  const incoming: IncomingReport[] = Array.isArray(body.reports) ? body.reports : [];
  if (!incoming.length) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });

  const orgId = orgFromHeader(req.headers.get("x-user-org-id"));
  const [{ data: scout }, ctx] = await Promise.all([
    db.from("scouts").select("id, name").eq("id", scoutId).maybeSingle(),
    buildMatchContext(db, params.id, scoutId, orgId),
  ]);
  if (!scout) return NextResponse.json({ error: "Unknown scout" }, { status: 400 });
  if (!ctx) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  const byId = new Map<string, Participant>(ctx.players.map((p) => [p.id, p]));

  // Validate everything first, so a publish never half-applies
  const problems: { playerId: string; error: string }[] = [];
  const rows: any[] = [];
  for (const r of incoming) {
    const p = byId.get(String(r.playerId));
    if (!p) {
      problems.push({ playerId: r.playerId, error: "Player did not play in this match" });
      continue;
    }
    if (!p.inDatabase) {
      problems.push({ playerId: p.id, error: `${p.name} is not in the Player Database` });
      continue;
    }
    const raw = Number(r.matchRating);
    if (!Number.isFinite(raw) || raw < 0 || raw > 10) {
      problems.push({ playerId: p.id, error: `${p.name}: match rating is required (0–10)` });
      continue;
    }
    const rating = snapMatchRating(raw);
    const consistencyNote = short(r.consistencyNote, 500);
    if (publish && !isOptaConsistent(rating, p.optaRating) && !consistencyNote) {
      problems.push({ playerId: p.id, error: `${p.name}: rating differs from Opta by more than 1.5 — add a note` });
      continue;
    }
    const existing = p.report;
    const status = publish || existing?.status === "published" ? "published" : "draft";
    const watchFor = Array.isArray(r.watchFor)
      ? r.watchFor
          .filter((w) => w && w.item && WATCH_RESULTS.includes(w.result))
          .map((w) => ({ item: String(w.item).slice(0, 120), result: w.result }))
      : null;

    rows.push({
      match_id: params.id,
      player_id: p.id,
      scout_id: scoutId,
      organization_id: orgId,
      status,
      mode,
      match_date: ctx.match.date,
      position_start: short(r.positionStart, 10) ?? p.positionStart,
      position_end: short(r.positionEnd, 10) ?? short(r.positionStart, 10) ?? p.positionEnd,
      system_start: short(r.systemStart, 12) ?? p.systemStart,
      system_end: short(r.systemEnd, 12) ?? short(r.systemStart, 12) ?? p.systemEnd,
      ...snapshotFor(p, rating),
      match_rating: rating,
      rating_now: starOrNull(r.ratingNow),
      rating_potential: starOrNull(r.ratingPotential),
      vs_last: p.history.seenBefore ? cleanTri(r.vsLast, VS_KEYS) : null,
      watch_for: p.history.seenBefore && watchFor?.length ? watchFor : null,
      pillar_flash: p.history.seenBefore ? null : cleanTri(r.pillarFlash, PILLARS),
      tags_seen: Array.isArray(r.tagsSeen) ? Array.from(new Set(r.tagsSeen.map((t) => String(t).trim().slice(0, 60)).filter(Boolean))).slice(0, 20) : [],
      player_note: short(r.playerNote, 1000),
      consistency_note: consistencyNote,
      updated_at: new Date().toISOString(),
      published_at: status === "published" ? existing?.published_at || new Date().toISOString() : null,
      _player: p,
    });
  }
  if (problems.length) return NextResponse.json({ error: problems[0].error, problems }, { status: 400 });

  const { data: saved, error } = await db
    .from("match_reports")
    .upsert(
      rows.map(({ _player, ...row }) => row),
      { onConflict: "match_id,player_id,scout_id" }
    )
    .select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const savedBy = new Map<string, any>((saved || []).map((s: any) => [s.player_id, s]));
  const fixture = `${ctx.match.home.name} – ${ctx.match.away.name}`;

  // Stars → PlayerStarRating + full-report draft; assignment → done
  await Promise.all(
    rows.map(async (row) => {
      const rep = savedBy.get(row.player_id);
      if (!rep) return;
      const tasks: Promise<any>[] = [];
      if (row.rating_now != null || row.rating_potential != null) {
        tasks.push(
          db.from("player_star_ratings").upsert(
            {
              player_id: row.player_id,
              scout_id: scoutId,
              organization_id: orgId,
              source: "match_report",
              source_id: rep.id,
              rating_now: row.rating_now,
              rating_potential: row.rating_potential,
              created_at: new Date().toISOString(),
            },
            { onConflict: "source,source_id" }
          ),
          upsertStarsDraft(db, {
            orgId,
            scoutId,
            scoutName: scout.name,
            player: row._player,
            ratingNow: row.rating_now,
            ratingPotential: row.rating_potential,
            matchId: params.id,
            fixture,
            competition: ctx.match.competition,
          })
        );
      }
      tasks.push(
        db
          .from("scout_assignments")
          .update({ status: "done", match_report_id: rep.id, updated_at: new Date().toISOString() })
          .eq("match_id", params.id)
          .eq("player_id", row.player_id)
      );
      await Promise.all(tasks);
    })
  );

  return NextResponse.json({ reports: saved || [] });
}

/**
 * Stars set in a match report update that scout's full-report draft for the player,
 * or create one marked "draft — stars only" (SPEC §6.9).
 */
async function upsertStarsDraft(
  db: any,
  a: {
    orgId: string | null;
    scoutId: string;
    scoutName: string;
    player: Participant;
    ratingNow: number | null;
    ratingPotential: number | null;
    matchId: string;
    fixture: string;
    competition: string | null;
  }
) {
  const { data: drafts } = await db
    .from("scouting_reports")
    .select("id, sponda_data")
    .eq("player_id", a.player.id)
    .eq("scout_id", a.scoutId)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(1);
  const draft = drafts?.[0];
  if (draft) {
    const sd = { ...(draft.sponda_data || {}) };
    if (a.ratingNow != null) sd.ratingStars = a.ratingNow;
    if (a.ratingPotential != null) sd.potentialStars = a.ratingPotential;
    return db
      .from("scouting_reports")
      .update({ sponda_data: sd, rating: (sd.ratingStars ?? a.ratingNow ?? 3.5) * 2, updated_at: new Date().toISOString() })
      .eq("id", draft.id);
  }
  let orgId = a.orgId;
  if (!orgId) {
    const { data: firstOrg } = await db.from("organizations").select("id").limit(1).maybeSingle();
    orgId = firstOrg?.id || "00000000-0000-0000-0000-000000000000";
  }
  return db.from("scouting_reports").insert({
    organization_id: orgId,
    author_id: a.scoutId,
    scout_id: a.scoutId,
    player_id: a.player.id,
    player_name: a.player.name,
    primary_position: a.player.positionStart || "Unspecified",
    match_id: a.matchId,
    match_fixture: a.fixture,
    competition: a.competition || "",
    observation_date: new Date().toISOString().slice(0, 10),
    report_type: "full_scouting",
    status: "draft",
    visibility: "club_private",
    scout_name: a.scoutName,
    rating: (a.ratingNow ?? 3.5) * 2,
    recommendation: "monitor_tier_b",
    tactical_notes: "",
    strengths: [],
    weaknesses: [],
    sponda_data: {
      starsOnly: true,
      scoutName: a.scoutName,
      ratingStars: a.ratingNow ?? undefined,
      potentialStars: a.ratingPotential ?? undefined,
    },
    version_history: [
      {
        version: 1,
        timestamp: new Date().toISOString(),
        authorName: a.scoutName,
        summary: "Draft — stars only (from a match report).",
        changes: "Created from match report stars.",
      },
    ],
  });
}
