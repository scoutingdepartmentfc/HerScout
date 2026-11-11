/** País de una liga a partir de su nombre, cuando la API no lo trae (para mostrar su bandera). */
export function guessLeagueCountry(leagueName?: string | null): string | null {
  if (!leagueName) return null;
  const lower = leagueName.toLowerCase();
  if (lower.includes("liga f") || lower.includes("primera división") || lower.includes("primera division") || lower.includes("copa de la reina") || lower.includes("spain") || lower.includes("españa") || lower.includes("segunda federación") || lower.includes("primera federación")) return "Spain";
  if (lower.includes("super league") || lower.includes("wsl") || lower.includes("england") || lower.includes("inglaterra") || lower.includes("championship")) return "England";
  if (lower.includes("bundesliga") || lower.includes("germany") || lower.includes("alemania") || lower.includes("dfb") || lower.includes("regionalliga")) return "Germany";
  if (lower.includes("première ligue") || lower.includes("premiere ligue") || lower.includes("division 1") || lower.includes("france") || lower.includes("francia") || lower.includes("coupe lffp")) return "France";
  if (lower.includes("serie a") || lower.includes("italy") || lower.includes("italia") || lower.includes("coppa italia")) return "Italy";
  if (lower.includes("nwsl") || lower.includes("national women’s soccer league") || lower.includes("national women's soccer league") || lower.includes("usa") || lower.includes("united states") || lower.includes("estados unidos") || lower.includes("usl")) return "USA";
  if (lower.includes("liga mx") || lower.includes("mexico") || lower.includes("méxico")) return "Mexico";
  if (lower.includes("a-league") || lower.includes("australia")) return "Australia";
  if (lower.includes("swpl") || lower.includes("scotland") || lower.includes("escocia")) return "Scotland";
  if (lower.includes("damallsvenskan") || lower.includes("sweden") || lower.includes("suecia")) return "Sweden";
  if (lower.includes("toppserien") || lower.includes("norway") || lower.includes("noruega")) return "Norway";
  if (lower.includes("eredivisie") || lower.includes("netherlands") || lower.includes("holanda") || lower.includes("holland")) return "Netherlands";
  if (lower.includes("northern super league") || lower.includes("canada") || lower.includes("canadá")) return "Canada";
  if (lower.includes("brasileir") || lower.includes("brazil") || lower.includes("brasil")) return "Brazil";
  if (lower.includes("we league") || lower.includes("nadeshiko") || lower.includes("japan") || lower.includes("japón")) return "Japan";
  if (lower.includes("superliga") || lower.includes("portugal") || lower.includes("campeonato nacional")) return "Portugal";
  if (lower.includes("a-liga") || lower.includes("kvindepokalen") || lower.includes("b-liga") || lower.includes("denmark") || lower.includes("dinamarca")) return "Denmark";
  return null;
}

/**
 * Orden de importancia de países para fútbol femenino internacional.
 * Prioriza las grandes ligas europeas y globales (España, Inglaterra, Alemania, Francia, USA, Italia, etc.)
 */
export const COUNTRY_IMPORTANCE_ORDER: string[] = [
  "Spain",
  "England",
  "Germany",
  "France",
  "USA",
  "Italy",
  "Portugal",
  "Netherlands",
  "Sweden",
  "Norway",
  "Denmark",
  "Mexico",
  "Brazil",
  "Australia",
  "Japan",
  "Canada",
  "Scotland",
  "Belgium",
  "Austria",
  "Switzerland",
  "Finland",
  "China",
];

export function getCountryPriority(country?: string | null): number {
  if (!country) return 999;
  if (country === "Internacional") return -1; // Champions League, Libertadores... always first
  const idx = COUNTRY_IMPORTANCE_ORDER.indexOf(country);
  return idx >= 0 ? idx : 500;
}

/**
 * Prioridad de liga dentro de su país: primera división / liga principal primero,
 * luego copas, luego segundas divisiones.
 */
export function getLeagueSubPriority(leagueName: string): number {
  const l = leagueName.toLowerCase();
  // 1ª división principal
  if (l.includes("liga f") || l.includes("primera división femenina") || l.includes("women’s super league") || l.includes("women's super league") || (l.includes("bundesliga") && !l.includes("2.")) || (l.includes("première ligue") || l.includes("premiere ligue")) || (l.includes("serie a") && !l.includes("cup")) || l.includes("nwsl") || l.includes("a-liga") || l.includes("campeonato nacional") || l.includes("damallsvenskan") || l.includes("toppserien") || l.includes("eredivisie") || l.includes("swpl 1") || l.includes("liga mx")) {
    return 1;
  }
  // Copas de primera
  if (l.includes("copa") || l.includes("cup") || l.includes("coupe") || l.includes("pokal")) {
    return 2;
  }
  // 2ª división / filiales
  if (l.includes("2. bundesliga") || l.includes("super league 2") || l.includes("championship") || l.includes("primera federación") || l.includes("segunda federación") || l.includes("division 2") || l.includes("b-liga") || l.includes("regionalliga")) {
    return 3;
  }
  return 4;
}

export function sortLeaguesByCountryAndTier<T extends { name: string; country?: string | null }>(leagues: T[]): T[] {
  return [...leagues].sort((a, b) => {
    const cA = a.country || guessLeagueCountry(a.name) || "Other";
    const cB = b.country || guessLeagueCountry(b.name) || "Other";

    const prioA = getCountryPriority(cA);
    const prioB = getCountryPriority(cB);

    if (prioA !== prioB) return prioA - prioB;
    if (cA !== cB) return cA.localeCompare(cB);

    // Mismo país: ordenar por importancia de liga
    const subA = getLeagueSubPriority(a.name);
    const subB = getLeagueSubPriority(b.name);
    if (subA !== subB) return subA - subB;

    return a.name.localeCompare(b.name);
  });
}

