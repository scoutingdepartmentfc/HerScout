// Lineups from Opta matchstats, in the compact format stored in matches.lineups.
// Same logic as supabase/functions/match-live/index.ts (buildLineups): keep both in sync.
// Used to fill a match on demand when someone opens it and the Edge Function didn't cover it
// (e.g. matches played before the automation existed).

const OPTA_BASE = "https://api.performfeeds.com/soccerdata";
const OUTLET = process.env.SDAPI_OUTLET_KEY || "ft1tiv1inq7v1sk3y9tv12yh5";

type Side = "home" | "away";

export async function fetchMatchstats(matchId: string): Promise<any | null> {
  const url =
    `${OPTA_BASE}/matchstats/${OUTLET}/${encodeURIComponent(matchId)}` +
    `?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback&detailed=yes`;
  try {
    const res = await fetch(url, {
      headers: {
        Referer: "https://www.scoresway.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const data = JSON.parse(text.slice(start, end + 1));
    return data?.errorCode ? null : data;
  } catch {
    return null;
  }
}

export function buildLineups(data: any) {
  const live = data?.liveData ?? {};
  const contestants: any[] = data?.matchInfo?.contestant ?? [];
  const sideOf = (cid: string): Side | null => (contestants.find((c) => c.id === cid)?.position as Side) ?? null;

  const teams: Record<string, any> = {};
  for (const t of live.lineUp ?? []) {
    const side = sideOf(t.contestantId);
    if (!side) continue;
    const players = (t.player ?? []).map((p: any) => ({
      id: p.playerId,
      name: p.matchName || p.knownName || `${p.shortFirstName ?? ""} ${p.shortLastName ?? ""}`.trim(),
      shirt: p.shirtNumber ?? null,
      pos: p.position,
      side: p.positionSide ?? null,
      place: p.formationPlace ? Number(p.formationPlace) : null,
      captain: p.captain === "yes" || p.captain === true || undefined,
    }));
    teams[side] = {
      formation: t.formationUsed ?? null,
      starters: players.filter((p: any) => p.pos !== "Substitute"),
      subs: players.filter((p: any) => p.pos === "Substitute"),
    };
  }
  if (!teams.home && !teams.away) return null;

  const goals = (live.goal ?? []).map((g: any) => ({
    team: sideOf(g.contestantId), min: g.timeMin, playerId: g.scorerId, name: g.scorerName, type: g.type,
  }));
  const cards = (live.card ?? []).map((c: any) => ({
    team: sideOf(c.contestantId), min: c.timeMin, playerId: c.playerId, name: c.playerName, type: c.type,
  }));
  const substitutions = (live.substitute ?? []).map((s: any) => ({
    team: sideOf(s.contestantId), min: s.timeMin,
    onId: s.playerOnId, onName: s.playerOnName, offId: s.playerOffId, offName: s.playerOffName,
  }));

  return { home: teams.home ?? null, away: teams.away ?? null, goals, cards, substitutions, updatedAt: new Date().toISOString() };
}

const FINAL = ["Played", "Postponed", "Cancelled", "Awarded", "Abandoned"];

/** Status + score columns from matchstats (same rules as the Edge Function's processMatch). */
export function resultUpdate(data: any): Record<string, unknown> {
  const details = data?.liveData?.matchDetails ?? {};
  const status: string | undefined = details.matchStatus;
  if (!status || !(FINAL.includes(status) || status === "Playing")) return {};
  const out: Record<string, unknown> = { status };
  const total = details.scores?.total ?? details.scores?.ft;
  if (total && (status === "Played" || status === "Playing" || status === "Awarded")) {
    out.home_score = total.home ?? null;
    out.away_score = total.away ?? null;
  }
  if (status === "Played") out.updated_at = new Date().toISOString();
  return out;
}
