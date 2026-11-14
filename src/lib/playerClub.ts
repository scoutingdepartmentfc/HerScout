// Club shown for a player without one: same label whether Soccerdonna says "vereinslos" (translated to
// "Without club" by the pipeline) or no source gives us a club at all.

export const NO_CLUB_DATA = "Without club";

const WITHOUT_CLUB = /^without club$/i;

/**
 * An active Opta squad (current_team_id that is not a Soccerdonna "sd-" team) beats a Soccerdonna "Without club":
 * Soccerdonna profiles are often out of date. Mutates and returns the player row (idempotent).
 */
export function preferOptaClub<T extends Record<string, any>>(p: T): T {
  if (p && WITHOUT_CLUB.test(p.fm_team_name || "")) {
    // Soccerdonna's "vereinslos" badge is dropped so both "no club" cases show the same neutral shield
    (p as any).fm_team_badge_url = null;
    if (p.teams && !String(p.teams.id || p.current_team_id || "").startsWith("sd-")) (p as any).fm_team_name = null;
  }
  return p;
}
