import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { orgFromHeader, UUID_RE } from "@/lib/matchReportServer";

/**
 * POST /api/matches/[id]/attendance  { scoutId, mode }
 * Recorded when a scout opens the match report (SPEC §5.1), even if no player is rated.
 * The first opening is kept; a later call only updates the mode.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  const scoutId = String(body.scoutId || "");
  const mode = body.mode === "video" ? "video" : "live";
  if (!UUID_RE.test(scoutId)) return NextResponse.json({ error: "scoutId is required" }, { status: 400 });

  const { data: existing } = await db
    .from("scout_attendance")
    .select("id, mode, opened_at")
    .eq("match_id", params.id)
    .eq("scout_id", scoutId)
    .maybeSingle();
  if (existing) {
    if (existing.mode !== mode) await db.from("scout_attendance").update({ mode }).eq("id", existing.id);
    return NextResponse.json({ attendance: { ...existing, mode } });
  }
  const { data, error } = await db
    .from("scout_attendance")
    .insert({ match_id: params.id, scout_id: scoutId, mode, organization_id: orgFromHeader(req.headers.get("x-user-org-id")) })
    .select("id, mode, opened_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ attendance: data });
}
