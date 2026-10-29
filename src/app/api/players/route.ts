import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams.get("search") || "";
  const position = url.searchParams.get("position") || "all";

  if (!supabaseAdmin) {
    return NextResponse.json({ players: [] });
  }

  try {
    let query = (supabaseAdmin as any)
      .from("players")
      .select(`
        id,
        name,
        country,
        birth_date,
        photo_url,
        primary_position,
        grupo_demarcacion,
        shirt_number,
        height,
        weight,
        market_value,
        teams ( id, name, badge_url )
      `)
      .order("name", { ascending: true })
      .limit(50);

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const res = await query;
    if (res.error) throw res.error;

    const formatted = (res.data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      country: p.country,
      birthDate: p.birth_date,
      photoUrl: p.photo_url,
      position: p.primary_position || "Field Player",
      grupoDemarcacion: p.grupo_demarcacion || "General",
      shirtNumber: p.shirt_number,
      height: p.height,
      weight: p.weight,
      marketValue: p.market_value,
      teamId: p.teams?.id,
      teamName: p.teams?.name || "Unattached",
      badgeUrl: p.teams?.badge_url,
    }));

    return NextResponse.json({ players: formatted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

