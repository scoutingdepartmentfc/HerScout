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
