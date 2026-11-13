// Supabase Edge Function: match-live
// Called every 10 min by pg_cron (migration 20261113120000_match_live.sql). Keeps it cheap:
//  - reads only matches inside two small time windows (indexed on match_date, a few rows)
//  - asks Opta matchstats only for those
//  - writes result + lineups (writes are ingress, not egress)
//
// Windows:
//  A) finished?  kicked off 100 min – 7 days ago and not final yet → result, status, lineups, goals, cards, subs
//                (7 days so a missed run / late Opta update / outage still gets fixed; only non-final rows: few)
//  B) lineups?   kicks off within the next 75 min and no lineups yet → starting XI as soon as Opta has it
//
// Stats/ratings are still computed by the Tuesday pipeline (it uses its own cache, so it still processes these).

import { createClient } from "jsr:@supabase/supabase-js@2";

const OPTA_BASE = "https://api.performfeeds.com/soccerdata";
const OUTLET = Deno.env.get("SDAPI_OUTLET_KEY") ?? "ft1tiv1inq7v1sk3y9tv12yh5";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const FINAL = ["Played", "Postponed", "Cancelled", "Awarded", "Abandoned"];
const MAX_MATCHES = 40;
const PARALLEL = 4;

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

type Side = "home" | "away";

async function matchstats(matchId: string): Promise<any | null> {
  const url =
    `${OPTA_BASE}/matchstats/${OUTLET}/${matchId}` +
    `?_fmt=jsonp&_rt=c&_lcl=en&sps=widgets&_clbk=callback&detailed=yes`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Referer: "https://www.scoresway.com/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const text = await res.text();
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start === -1 || end === -1) return null;
        const data = JSON.parse(text.slice(start, end + 1));
        return data?.errorCode ? null : data;
      }
      if (![429, 500, 502, 503, 504].includes(res.status)) return null;
    } catch (_) {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  return null;
}

/** Compact lineups payload stored in matches.lineups (only what the pitch view needs). */
function buildLineups(data: any) {
  const live = data?.liveData ?? {};
  const contestants: any[] = data?.matchInfo?.contestant ?? [];
  const sideOf = (cid: string): Side | null =>
    (contestants.find((c) => c.id === cid)?.position as Side) ?? null;

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
    team: sideOf(g.contestantId),
    min: g.timeMin,
    playerId: g.scorerId,
    name: g.scorerName,
    type: g.type, // G, PG (penalty), OG (own goal)
  }));
  const cards = (live.card ?? []).map((c: any) => ({
    team: sideOf(c.contestantId),
    min: c.timeMin,
    playerId: c.playerId,
    name: c.playerName,
    type: c.type, // YC, Y2C, RC
  }));
  const substitutions = (live.substitute ?? []).map((s: any) => ({
    team: sideOf(s.contestantId),
    min: s.timeMin,
    onId: s.playerOnId,
    onName: s.playerOnName,
    offId: s.playerOffId,
    offName: s.playerOffName,
  }));

  return { home: teams.home ?? null, away: teams.away ?? null, goals, cards, substitutions, updatedAt: new Date().toISOString() };
}

async function processMatch(m: { id: string; status: string; lineups: unknown }) {
  const data = await matchstats(m.id);
  const now = new Date().toISOString();
  if (!data) {
    await db.from("matches").update({ live_checked_at: now }).eq("id", m.id);
    return { id: m.id, result: "no-data" };
  }
  const details = data?.liveData?.matchDetails ?? {};
  const status: string = details.matchStatus || m.status;
  const lineups = buildLineups(data);
  const update: Record<string, unknown> = { live_checked_at: now };
  if (lineups) update.lineups = lineups;

  if (FINAL.includes(status) || status === "Playing") {
    update.status = status;
    const total = details.scores?.total ?? details.scores?.ft;
    if (total && (status === "Played" || status === "Playing" || status === "Awarded")) {
      update.home_score = total.home ?? null;
      update.away_score = total.away ?? null;
    }
  }
  if (status === "Played") update.updated_at = now;

  const { error } = await db.from("matches").update(update).eq("id", m.id);
  return { id: m.id, result: error ? `error: ${error.message}` : status, lineups: !!lineups };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const now = Date.now();
  const iso = (ms: number) => new Date(now + ms).toISOString();
  const MIN = 60 * 1000;

  // A) probably finished, not final yet
  const finished = await db
    .from("matches")
    .select("id, status, lineups")
    .gte("match_date", iso(-7 * 24 * 60 * MIN))
    .lte("match_date", iso(-100 * MIN))
    .not("status", "in", `(${FINAL.join(",")})`)
    .order("match_date", { ascending: true })
    .limit(MAX_MATCHES);

  // B) about to start, no lineups yet (Opta publishes the XI ~1 h before kick-off)
  const upcoming = await db
    .from("matches")
    .select("id, status, lineups")
    .gte("match_date", iso(0))
    .lte("match_date", iso(75 * MIN))
    .is("lineups", null)
    .limit(MAX_MATCHES);

  if (finished.error || upcoming.error) {
    return Response.json({ error: finished.error?.message ?? upcoming.error?.message }, { status: 500 });
  }
  const todo = [...(finished.data ?? []), ...(upcoming.data ?? [])];
  const results = todo.length ? await pool(todo, PARALLEL, processMatch) : [];
  return Response.json({ checked: todo.length, results });
});
