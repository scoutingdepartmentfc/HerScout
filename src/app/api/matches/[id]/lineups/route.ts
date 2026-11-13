import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { buildLineups, fetchMatchstats, resultUpdate } from "@/lib/matchLineups";

// Lineups of one match + photos of the players we know. Only requested when the user opens a match.
// Normally filled by the `match-live` Edge Function; if a match has none yet (played before the automation,
// or the function hasn't run), they are fetched from Opta here once and stored, so it never repeats.
// Also stores result/status, so a match opened after it ends is fixed even if the automation missed it.
const FINAL_NO_LINEUPS = ["Postponed", "Cancelled"];
const FINAL = ["Played", "Postponed", "Cancelled", "Awarded", "Abandoned"];
const HOUR = 60 * 60 * 1000;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin as any;
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  const { data: match, error } = await db
    .from("matches")
    .select("id, status, match_date, lineups, live_checked_at")
    .eq("id", params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  let lineups = match.lineups;
  let status: string = match.status;
  const kickoff = new Date(match.match_date).getTime();
  // Fetch from Opta when: no lineups yet (XI published ~1 h before), or the match has kicked off but isn't
  // final here (pre-match XI stored, or the automation missed it) → also brings result and status
  const notFinal = !FINAL.includes(match.status);
  const needsOpta = (!lineups && !FINAL_NO_LINEUPS.includes(match.status)) || (notFinal && kickoff < Date.now());
  if (needsOpta) {
    const startsSoon = kickoff - Date.now() < 2 * HOUR;
    // Don't ask Opta again for a match it had nothing for in the last 10 minutes
    const recentlyChecked = match.live_checked_at && Date.now() - new Date(match.live_checked_at).getTime() < 10 * 60 * 1000;
    if (startsSoon && !recentlyChecked) {
      const data = await fetchMatchstats(match.id);
      lineups = (data ? buildLineups(data) : null) ?? lineups;
      const update: Record<string, unknown> = { live_checked_at: new Date().toISOString(), ...resultUpdate(data) };
      if (lineups) update.lineups = lineups;
      await db.from("matches").update(update).eq("id", match.id);
      if (update.status) status = update.status as string;
    }
  }
  if (!lineups) return NextResponse.json({ lineups: null, status });

  const ids = new Set<string>();
  for (const side of ["home", "away"]) {
    for (const p of [...(lineups[side]?.starters || []), ...(lineups[side]?.subs || [])]) if (p.id) ids.add(p.id);
  }
  const photos: Record<string, string> = {};
  const known: string[] = []; // players with a profile in the Player Database (clickable)
  if (ids.size) {
    const { data: players } = await db.from("players").select("id, photo_url").in("id", Array.from(ids));
    for (const p of players || []) {
      known.push(p.id);
      if (p.photo_url) photos[p.id] = p.photo_url;
    }
  }

  return NextResponse.json({ lineups, photos, known, status }, { headers: { "Cache-Control": "private, max-age=300" } });
}
