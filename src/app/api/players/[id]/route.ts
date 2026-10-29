import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const playerId = params.id;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    // 1. Player Demographics
    const playerRes = await (supabaseAdmin as any)
      .from("players")
      .select(`
        id,
        name,
        first_name,
        last_name,
        country,
        birth_date,
        photo_url,
        primary_position,
        grupo_demarcacion,
        shirt_number,
        height,
        weight,
        preferred_foot,
        market_value,
        contract_expires,
        teams ( id, name, badge_url )
      `)
      .eq("id", playerId)
      .single();

    if (playerRes.error || !playerRes.data) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const p = playerRes.data;

    // 2. Player Season Stats with raw metric breakdown
    const statsRes = await (supabaseAdmin as any)
      .from("player_season_stats")
      .select(`
        *,
        seasons ( name ),
        competitions ( name ),
        teams ( name, badge_url )
      `)
      .eq("player_id", playerId)
      .order("updated_at", { ascending: false });

    // Extract detailed metric map from stats row / radar_data
    const seasonRow = statsRes.data?.[0] || null;
    let metricasMap: Record<string, [number, number]> = {};

    if (seasonRow) {
      // 1. If radar_data has raw metric breakdown from Opta
      if (seasonRow.radar_data?.metricas) {
        metricasMap = seasonRow.radar_data.metricas;
      } else {
        // Fallback from columns
        Object.keys(seasonRow).forEach((k) => {
          if (
            k.startsWith("of_") ||
            k.startsWith("def_") ||
            k.startsWith("abp_") ||
            k.startsWith("comp_")
          ) {
            const valP90 = Number(seasonRow[k]) || 0;
            const score = Math.min(99, Math.max(45, Math.round(50 + valP90 * 6.5)));
            metricasMap[k] = [valP90, score];
          }
        });
      }
    }

    return NextResponse.json({
      player: {
        id: p.id,
        name: p.name,
        country: p.country,
        birthDate: p.birth_date,
        photoUrl: p.photo_url,
        primaryPosition: p.primary_position || "Field Player",
        grupoDemarcacion: p.grupo_demarcacion,
        shirtNumber: p.shirt_number,
        height: p.height,
        weight: p.weight,
        preferredFoot: p.preferred_foot,
        marketValue: p.market_value,
        contractUntil: p.contract_expires,
        teamId: p.teams?.id,
        teamName: p.teams?.name || "Unattached",
        badgeUrl: p.teams?.badge_url,
      },
      seasonStats: statsRes.data || [],
      metricas: metricasMap,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
