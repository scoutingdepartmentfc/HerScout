/**
 * League filter ids. Different countries can share a league name ("Women's Super League" is
 * both England and Switzerland), so a domestic league is identified by name + country.
 * International competitions (Champions League...) keep the bare name as their id.
 */
const SEP = "::";

export const normLeague = (s: string) =>
  s.toLowerCase().replace(/[‘’´`]/g, "'").replace(/\s+/g, " ").trim();

export function leagueId(name: string, country?: string | null): string {
  return country ? `${name}${SEP}${country}` : name;
}

export function parseLeagueId(id: string): { name: string; country: string | null } {
  const i = id.lastIndexOf(SEP);
  if (i < 0) return { name: id, country: null };
  return { name: id.slice(0, i), country: id.slice(i + SEP.length) };
}

/** Does a league (name + country) match a selected id? An id without country matches by name. */
export function leagueMatches(id: string, name?: string | null, country?: string | null): boolean {
  if (!name) return false;
  const sel = parseLeagueId(id);
  if (normLeague(sel.name) !== normLeague(name)) return false;
  return !sel.country || !country || sel.country.toLowerCase() === country.toLowerCase();
}

/** Player in any selected league: her current league, or an international competition she played. */
export function playerInLeagues(
  ids: string[],
  leagueName?: string | null,
  leagueCountry?: string | null,
  competitions?: string[] | null
): boolean {
  return ids.some(
    (id) =>
      leagueMatches(id, leagueName, leagueCountry) ||
      (competitions || []).some((c) => leagueMatches(id, c, null))
  );
}
