import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/players/[id]/assignments
 * Body: { matchId: string, scoutName: string, mode: "live" | "video" }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const matchId = String(body.matchId || "").trim();
  const scoutName = String(body.scoutName || "").trim();
  const mode = body.mode === "video" ? "video" : "live";
  if (!matchId || !scoutName) {
    return NextResponse.json({ error: "matchId and scoutName are required" }, { status: 400 });
  }

  const orgHeader = req.headers.get("x-user-org-id") || "";
  const orgId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgHeader)
    ? orgHeader
    : null;

  const { data, error } = await db
    .from("scout_assignments")
    .upsert(
      {
        organization_id: orgId,
        player_id: params.id,
        match_id: matchId,
        scout_name: scoutName,
        mode,
        status: "assigned",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_id,match_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ assignment: data });
}

/**
 * DELETE /api/players/[id]/assignments?matchId=...
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const matchId = req.nextUrl.searchParams.get("matchId");
  if (!matchId) {
    return NextResponse.json({ error: "matchId is required" }, { status: 400 });
  }

  const { error } = await db
    .from("scout_assignments")
    .delete()
    .eq("player_id", params.id)
    .eq("match_id", matchId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
