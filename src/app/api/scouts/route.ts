import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { orgFromHeader } from "@/lib/matchReportServer";

// Scouts of the club (simple identity used by the "Viewing as" selector until per-scout login exists).
export async function GET(req: NextRequest) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const orgId = orgFromHeader(req.headers.get("x-user-org-id"));
  let q = db.from("scouts").select("id, name, active, organization_id").eq("active", true).order("name");
  q = orgId ? q.or(`organization_id.eq.${orgId},organization_id.is.null`) : q;
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scouts: data || [] });
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const orgId = orgFromHeader(req.headers.get("x-user-org-id"));

  // Same name in the same club → reuse
  let q = db.from("scouts").select("id, name, active, organization_id").ilike("name", name);
  q = orgId ? q.eq("organization_id", orgId) : q.is("organization_id", null);
  const { data: existing } = await q.limit(1);
  if (existing?.[0]) return NextResponse.json({ scout: existing[0] });

  const { data, error } = await db.from("scouts").insert({ name, organization_id: orgId }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scout: data });
}
