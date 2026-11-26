import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const DEFAULT_WATCHLIST_NAME = "Club Shortlist";

async function resolveOrgAndWatchlist(db: any, orgHeader: string) {
  let orgId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgHeader)
    ? orgHeader
    : null;

  if (!orgId) {
    const { data: firstOrg } = await db.from("organizations").select("id").limit(1).maybeSingle();
    if (firstOrg?.id) orgId = firstOrg.id;
  }
  if (!orgId) return { orgId: null, watchlistId: null };

  const { data: existing } = await db
    .from("watchlists")
    .select("id")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return { orgId, watchlistId: existing.id };

  const { data: created } = await db
    .from("watchlists")
    .insert({
      organization_id: orgId,
      created_by: "00000000-0000-0000-0000-000000000000",
      name: DEFAULT_WATCHLIST_NAME,
      description: "Primary player shortlist",
    })
    .select("id")
    .single();

  return { orgId, watchlistId: created?.id || null };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const orgHeader = req.headers.get("x-user-org-id") || "";
  const { orgId, watchlistId } = await resolveOrgAndWatchlist(db, orgHeader);
  if (!orgId || !watchlistId) {
    return NextResponse.json({ error: "No organization watchlist configured" }, { status: 400 });
  }

  const { error } = await db
    .from("watchlist_players")
    .upsert(
      {
        watchlist_id: watchlistId,
        organization_id: orgId,
        player_id: params.id,
        priority_tier: "tier-a",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "watchlist_id,player_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inWatchlist: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const orgHeader = req.headers.get("x-user-org-id") || "";
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgHeader);

  let q = db.from("watchlist_players").delete().eq("player_id", params.id);
  if (isUuid) q = q.eq("organization_id", orgHeader);

  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inWatchlist: false });
}
