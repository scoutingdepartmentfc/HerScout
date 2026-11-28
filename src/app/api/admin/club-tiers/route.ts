import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminGuard";

const TIERS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7"];

// Administration → Club Tiers (SPEC §6.7): list clubs with their tier, set a club's tier.
export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const db = supabaseAdmin as any;
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const onlyUnset = req.nextUrl.searchParams.get("unset") === "1";
  let query = db.from("teams").select("id, name, country, badge_url, tier, tier_updated_at").order("name").limit(200);
  if (q) query = query.ilike("name", `%${q}%`);
  if (onlyUnset) query = query.is("tier", null);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ teams: data || [] });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const db = supabaseAdmin as any;
  const body = await req.json().catch(() => ({}));
  const teamId = String(body.teamId || "");
  const tier = body.tier == null || body.tier === "" ? null : String(body.tier);
  if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  if (tier !== null && !TIERS.includes(tier)) return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  const { data, error } = await db
    .from("teams")
    .update({ tier, tier_updated_by: "Administrator", tier_updated_at: new Date().toISOString() })
    .eq("id", teamId)
    .select("id, name, tier, tier_updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ team: data });
}
