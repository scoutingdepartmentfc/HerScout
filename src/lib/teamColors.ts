import teamsColorsData from "@/data/teams_colors.json";

export interface TeamColorInfo {
  id?: string;
  name?: string;
  league?: string;
  colors: {
    primary: string;
    secondary: string;
    tertiary?: string | null;
  };
  badge?: string;
  jersey?: string;
}

// Fallback universal para jugadoras sin equipo o equipos no catalogados
export const DEFAULT_TEAM_COLORS: TeamColorInfo = {
  colors: {
    primary: "#FFFFFF",
    secondary: "#0F172A",
    tertiary: "#94A3B8",
  },
};

/**
 * Normaliza nombres de clubes para buscar coincidencias robustas:
 * e.g. "FC Barcelona Femení" -> "barcelona"
 */
function normalizeTeamKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes
    .replace(/\b(fc|cf|wfc|cd|ud|sd|rcd|women|femenino|femení|feminas|de|la|el|club|futbol)\b/gi, "")
    .replace(/[^a-z0-9]/gi, "")
    .trim();
}

const colorMap = teamsColorsData as Record<string, TeamColorInfo>;

// Precomputar claves normalizadas para búsqueda instantánea O(1) / O(N pequeño)
const normalizedLookup = new Map<string, TeamColorInfo>();
for (const [rawName, info] of Object.entries(colorMap)) {
  const norm = normalizeTeamKey(rawName);
  if (norm) {
    normalizedLookup.set(norm, info);
  }
}

/**
 * Obtiene los colores oficiales del club dado su nombre.
 * Si no lo encuentra, devuelve el fallback universal.
 */
export function getTeamColors(teamName?: string | null): TeamColorInfo["colors"] {
  if (!teamName || !teamName.trim()) {
    return DEFAULT_TEAM_COLORS.colors;
  }

  // 1. Búsqueda directa exacta
  if (colorMap[teamName]) {
    return colorMap[teamName].colors;
  }

  // 2. Búsqueda por clave normalizada
  const normKey = normalizeTeamKey(teamName);
  if (normalizedLookup.has(normKey)) {
    return normalizedLookup.get(normKey)!.colors;
  }

  // 3. Búsqueda por subcadena
  const entries = Array.from(normalizedLookup.entries());
  for (let i = 0; i < entries.length; i++) {
    const [k, info] = entries[i];
    if (k.length >= 3 && (normKey.includes(k) || k.includes(normKey))) {
      return info.colors;
    }
  }

  // 4. Fallback universal por defecto (camiseta neutra elegante con contorno nítido)
  return DEFAULT_TEAM_COLORS.colors;
}

