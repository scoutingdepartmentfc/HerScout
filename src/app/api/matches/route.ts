import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { formatMatches, matchSelect } from "@/lib/matchesQuery";

const LIMIT = 50;

// tab = today | calendar | upcoming | results
export async function GET(req: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") || "today";
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");
  const idsParam = url.searchParams.get("ids"); // comma separated list of match ids
  const searchParam = url.searchParams.get("search"); // match team search query
  const playerIdParam = url.searchParams.get("playerId"); // filter matches where player participated or team matches
  const clubParam = url.searchParams.get("club"); // filter matches involving club

  // Filter matches specifically played by this player (or involving her club)
  if (playerIdParam || clubParam) {
    let matchIds: string[] = [];

    if (playerIdParam) {
      const { data: pStats } = await (supabaseAdmin as any)
        .from("player_match_stats")
        .select("match_id")
        .eq("player_id", playerIdParam)
        .order("match_date", { ascending: false })
        .limit(100);

      if (pStats && pStats.length > 0) {
        matchIds = pStats.map((r: any) => r.match_id).filter(Boolean);
      }
    }

    if (matchIds.length > 0) {
      const { data, error } = await (supabaseAdmin as any)
        .from("matches")
        .select(await matchSelect())
        .in("id", matchIds)
        .order("match_date", { ascending: false })
        .limit(50);

      if (!error && data && data.length > 0) {
        let formatted = await formatMatches(data);
        if (searchParam) {
          const q = searchParam.toLowerCase().trim();
          formatted = formatted.filter((m) =>
            m.home.name?.toLowerCase().includes(q) ||
            m.away.name?.toLowerCase().includes(q) ||
            m.competition?.toLowerCase().includes(q)
          );
        }
        return NextResponse.json({ matches: formatted });
      }
    }

    // Fallback or complement: query matches for the player's club
    if (clubParam) {
      const { data: allClubMatches, error: clubErr } = await (supabaseAdmin as any)
        .from("matches")
        .select(await matchSelect())
        .order("match_date", { ascending: false })
        .limit(200);

      if (!clubErr && allClubMatches) {
        // Strip common prefixes/suffixes like "FC", "CF", "WFC", "CD", etc. for fuzzy club matching
        const cleanClubName = (name: string) =>
          name
            .toLowerCase()
            .replace(/\b(fc|cf|wfc|cd|ud|sd|ff|de|femenino|femení|women)\b/gi, "")
            .replace(/[^a-z0-9]/gi, " ")
            .trim();

        const cClean = cleanClubName(clubParam);
        const cLower = clubParam.toLowerCase().trim();

        let formatted = await formatMatches(allClubMatches);
        formatted = formatted.filter((m) => {
          const h = (m.home.name || "").toLowerCase();
          const a = (m.away.name || "").toLowerCase();
          const hClean = cleanClubName(m.home.name || "");
          const aClean = cleanClubName(m.away.name || "");

          return (
            h.includes(cLower) ||
            a.includes(cLower) ||
            (cClean.length > 2 && (hClean.includes(cClean) || aClean.includes(cClean))) ||
            (hClean.length > 2 && cClean.includes(hClean)) ||
            (aClean.length > 2 && cClean.includes(aClean))
          );
        });

        if (searchParam) {
          const q = searchParam.toLowerCase().trim();
          formatted = formatted.filter((m) =>
            m.home.name?.toLowerCase().includes(q) ||
            m.away.name?.toLowerCase().includes(q) ||
            m.competition?.toLowerCase().includes(q)
          );
        }

        return NextResponse.json({ matches: formatted.slice(0, 30) });
      }
    }

    return NextResponse.json({ matches: [] });
  }

  if (searchParam) {
    const { data, error } = await (supabaseAdmin as any)
      .from("matches")
      .select(await matchSelect())
      .order("match_date", { ascending: false })
      .limit(80);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const formatted = await formatMatches(data || []);
    const q = searchParam.toLowerCase().trim();
    const filtered = formatted.filter((m) =>
      m.home.name?.toLowerCase().includes(q) ||
      m.away.name?.toLowerCase().includes(q) ||
      m.competition?.toLowerCase().includes(q)
    );
    return NextResponse.json({ matches: filtered.slice(0, 30) });
  }

  let query = (supabaseAdmin as any).from("matches").select(await matchSelect());

  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ matches: [] });
    }
    const { data, error } = await (supabaseAdmin as any)
      .from("matches")
      .select(await matchSelect())
      .in("id", ids)
      .order("match_date", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ matches: await formatMatches(data || []) });
  }

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  if (tab === "today") {
    query = query
      .gte("match_date", startOfDay.toISOString())
      .lt("match_date", endOfDay.toISOString())
      .order("match_date", { ascending: true });
  } else if (tab === "calendar") {
    // Range query for month/week navigation
    const start = startParam || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end = endParam || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    query = query
      .gte("match_date", start)
      .lte("match_date", end)
      .order("match_date", { ascending: true })
      .limit(500); // Allow full month fixtures

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ matches: await formatMatches(data || []) });
  } else if (tab === "upcoming") {
    // Next fixtures from right now (today's later kick-offs included)
    query = query
      .neq("status", "Played")
      .gte("match_date", now.toISOString())
      .order("match_date", { ascending: true })
      .limit(LIMIT);
  } else {
    query = query
      .eq("status", "Played")
      .order("match_date", { ascending: false })
      .limit(LIMIT);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ matches: await formatMatches(data || []) });
}
