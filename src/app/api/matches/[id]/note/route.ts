import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { UUID_RE } from "@/lib/matchReportServer";

/** PUT /api/matches/[id]/note { scoutId, text } — one shared note per match per scout (SPEC §5.3). */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  const scoutId = String(body.scoutId || "");
  if (!UUID_RE.test(scoutId)) return NextResponse.json({ error: "scoutId is required" }, { status: 400 });
  const text = String(body.text ?? "").slice(0, 4000);
  const { error } = await db
    .from("match_notes")
    .upsert({ match_id: params.id, scout_id: scoutId, text, updated_at: new Date().toISOString() }, { onConflict: "match_id,scout_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
