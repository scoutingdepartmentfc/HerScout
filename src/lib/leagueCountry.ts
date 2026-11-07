/** País de una liga a partir de su nombre, cuando la API no lo trae (para mostrar su bandera). */
export function guessLeagueCountry(leagueName?: string | null): string | null {
  if (!leagueName) return null;
  const lower = leagueName.toLowerCase();
  if (lower.includes("liga f") || lower.includes("primera división") || lower.includes("copa de la reina") || lower.includes("spain") || lower.includes("españa")) return "Spain";
  if (lower.includes("super league") || lower.includes("wsl") || lower.includes("england") || lower.includes("inglaterra") || lower.includes("championship")) return "England";
  if (lower.includes("bundesliga") || lower.includes("germany") || lower.includes("alemania") || lower.includes("dfb")) return "Germany";
  if (lower.includes("première ligue") || lower.includes("premiere ligue") || lower.includes("division 1") || lower.includes("france") || lower.includes("francia")) return "France";
  if (lower.includes("serie a") || lower.includes("italy") || lower.includes("italia") || lower.includes("coppa italia")) return "Italy";
  if (lower.includes("liga mx") || lower.includes("mexico") || lower.includes("méxico")) return "Mexico";
  if (lower.includes("nwsl") || lower.includes("usa") || lower.includes("united states") || lower.includes("estados unidos") || lower.includes("usl")) return "USA";
  if (lower.includes("a-league") || lower.includes("australia")) return "Australia";
  if (lower.includes("swpl") || lower.includes("scotland") || lower.includes("escocia")) return "Scotland";
  if (lower.includes("damallsvenskan") || lower.includes("sweden") || lower.includes("suecia")) return "Sweden";
  if (lower.includes("toppserien") || lower.includes("norway") || lower.includes("noruega")) return "Norway";
  if (lower.includes("eredivisie") || lower.includes("netherlands") || lower.includes("holanda") || lower.includes("holland")) return "Netherlands";
  if (lower.includes("northern super league") || lower.includes("canada") || lower.includes("canadá")) return "Canada";
  if (lower.includes("brasileir") || lower.includes("brazil") || lower.includes("brasil")) return "Brazil";
  if (lower.includes("we league") || lower.includes("nadeshiko") || lower.includes("japan") || lower.includes("japón")) return "Japan";
  if (lower.includes("superliga") || lower.includes("portugal")) return "Portugal";
  return null;
}
