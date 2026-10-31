import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/adminGuard";

/**
 * Clubs with a HerScout subscription (organizations) and the leagues each one has contracted
 * (organization_leagues). Leagues come from ingestion_targets: only what the pipeline downloads.
 */

const PLANS = ["trial", "standard", "pro", "enterprise"];
const STATUSES = ["trialing", "active", "suspended", "cancelled"];

function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Validated subscription fields from the request body (only the ones present)
function clubFields(body: any) {
  const fields: Record<string, any> = {};
  if (typeof body.name === "string" && body.name.trim()) fields.name = body.name.trim().slice(0, 150);
  if (typeof body.shortName === "string" && body.shortName.trim()) fields.short_name = body.shortName.trim().slice(0, 60);
  if (PLANS.includes(body.plan)) fields.subscription_plan = body.plan;
  if (STATUSES.includes(body.status)) fields.subscription_status = body.status;
  if (body.seatLimit !== undefined) {
    const seats = Number(body.seatLimit);
    if (!Number.isInteger(seats) || seats < 1 || seats > 500) throw new Error("Seats must be a whole number from 1 to 500");
    fields.seat_limit = seats;
  }
  return fields;
}

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const db = supabaseAdmin as any;
  try {
    const [orgs, members, clubLeagues, targets] = await Promise.all([
      db.from("organizations")
        .select("id, name, short_name, slug, primary_color, secondary_color, accent_color, subscription_plan, subscription_status, seat_limit, created_at")
        .order("name"),
      db.from("organization_members").select("organization_id"),
      db.from("organization_leagues").select("organization_id, competition_id"),
      db.from("ingestion_targets").select("competition_id, competition_name, country"),
    ]);
    for (const r of [orgs, members, clubLeagues, targets]) if (r.error) throw r.error;

    const seatsUsed = new Map<string, number>();
    for (const m of members.data) seatsUsed.set(m.organization_id, (seatsUsed.get(m.organization_id) || 0) + 1);
    const leaguesByClub = new Map<string, string[]>();
    for (const l of clubLeagues.data) {
      leaguesByClub.set(l.organization_id, [...(leaguesByClub.get(l.organization_id) || []), l.competition_id]);
    }
    // One entry per league (ingestion_targets has one row per season)
    const leagues = new Map<string, { competition_id: string; competition_name: string; country: string | null }>();
    for (const t of targets.data) if (!leagues.has(t.competition_id)) leagues.set(t.competition_id, t);

    return NextResponse.json({
      clubs: orgs.data.map((o: any) => ({
        ...o,
        members: seatsUsed.get(o.id) || 0,
        leagues: leaguesByClub.get(o.id) || [],
      })),
      leagues: Array.from(leagues.values()).sort((a, b) => a.competition_name.localeCompare(b.competition_name)),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Could not load clubs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const body = await req.json();
  const db = supabaseAdmin as any;
  const now = new Date().toISOString();

  try {
    if (body.action === "create") {
      const fields = clubFields(body);
      if (!fields.name) return NextResponse.json({ error: "Club name is required" }, { status: 400 });
      const base = slugify(fields.name) || "club";
      const { data: taken } = await db.from("organizations").select("slug").like("slug", `${base}%`);
      const slugs = new Set((taken || []).map((t: any) => t.slug));
      let slug = base;
      for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;
      const { error } = await db.from("organizations").insert({
        short_name: fields.name.slice(0, 60),
        ...fields,
        slug,
      });
      if (error) throw error;
    } else if (body.action === "update") {
      if (!body.id) return NextResponse.json({ error: "Missing club id" }, { status: 400 });
      const { error } = await db.from("organizations").update({ ...clubFields(body), updated_at: now }).eq("id", body.id);
      if (error) throw error;
    } else if (body.action === "setLeagues") {
      if (!body.id || !Array.isArray(body.competitionIds)) {
        return NextResponse.json({ error: "Missing club id or leagues" }, { status: 400 });
      }
      const ids: string[] = Array.from(new Set(body.competitionIds.map(String)));
      const { error: delErr } = await db.from("organization_leagues").delete().eq("organization_id", body.id);
      if (delErr) throw delErr;
      if (ids.length) {
        const { error } = await db.from("organization_leagues")
          .insert(ids.map((competition_id) => ({ organization_id: body.id, competition_id })));
        if (error) throw error;
      }
    } else if (body.action === "delete") {
      // Cascades to members, watchlists, reports and contracted leagues of that club
      if (!body.id) return NextResponse.json({ error: "Missing club id" }, { status: 400 });
      const { error } = await db.from("organizations").delete().eq("id", body.id);
      if (error) throw error;
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Could not save" }, { status: 500 });
  }
}
