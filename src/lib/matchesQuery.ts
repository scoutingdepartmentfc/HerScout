import { supabaseAdmin } from "@/lib/supabase";
import { getStoredVenueImages, venueKey } from "@/lib/venueImages";

// Shared by /api/matches and /api/matches/league
export const MATCH_SELECT = `
  id, match_date, status, home_score, away_score, venue_name, time_confirmed, week,
  home_formation:lineups->home->>formation, away_formation:lineups->away->>formation,
  home_team:teams!home_team_id(id, name, badge_url),
  away_team:teams!away_team_id(id, name, badge_url),
  competitions(id, name, country, logo_url),
  seasons(name)
`;

// `lineups` comes with migration 20261113120000_match_live.sql: until it is applied, select without it
const LINEUP_COLS = "home_formation:lineups->home->>formation, away_formation:lineups->away->>formation,";
let lineupsColumn: boolean | null = null;
export async function matchSelect(): Promise<string> {
  if (lineupsColumn === null) {
    const { error } = await (supabaseAdmin as any).from("matches").select("id, lineups").limit(0);
    lineupsColumn = !error;
  }
  return lineupsColumn ? MATCH_SELECT : MATCH_SELECT.replace(LINEUP_COLS, "");
}

/** API shape of match rows, with the stadium photos already stored (unknown venues resolve lazily client-side). */
export async function formatMatches(data: any[]) {
  const venueNames = data.map((m: any) => m.venue_name).filter(Boolean) as string[];
  const venueImages = venueNames.length ? await getStoredVenueImages(venueNames) : new Map<string, string | null>();
  return data.map((m: any) => ({
    id: m.id,
    date: m.match_date,
    status: m.status,
    week: m.week,
    competition: m.competitions?.name,
    competitionId: m.competitions?.id,
    competitionCountry: m.competitions?.country,
    competitionLogoUrl: m.competitions?.logo_url,
    season: m.seasons?.name,
    venue: m.venue_name,
    // string = photo, null = known to have none, undefined = not looked up yet
    venueImage: m.venue_name ? venueImages.get(venueKey(m.venue_name)) : null,
    timeConfirmed: m.time_confirmed !== false,
    // Only a flag here (lineups JSON is fetched on demand by /api/matches/[id]/lineups: less egress)
    hasLineups: !!(m.home_formation || m.away_formation),
    home: { id: m.home_team?.id, name: m.home_team?.name, badgeUrl: m.home_team?.badge_url, score: m.home_score },
    away: { id: m.away_team?.id, name: m.away_team?.name, badgeUrl: m.away_team?.badge_url, score: m.away_score },
  }));
}
