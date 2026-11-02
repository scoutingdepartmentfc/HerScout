export interface PositionInfo {
  code: string;
  en: string;
  es: string;
  category: "GK" | "DEF" | "MID" | "ATT";
}

export const POSITION_MAP: Record<string, PositionInfo> = {
  // Goalkeeper
  portero: { code: "GK", en: "Goalkeeper", es: "Portero", category: "GK" },
  goalkeeper: { code: "GK", en: "Goalkeeper", es: "Portero", category: "GK" },
  gk: { code: "GK", en: "Goalkeeper", es: "Portero", category: "GK" },

  // Center Backs
  central: { code: "CB", en: "Centre-Back", es: "Central", category: "DEF" },
  "central derecho": { code: "RCB", en: "Right Centre-Back", es: "Central Derecho", category: "DEF" },
  "central izquierdo": { code: "LCB", en: "Left Centre-Back", es: "Central Izquierdo", category: "DEF" },
  rcb: { code: "RCB", en: "Right Centre-Back", es: "Central Derecho", category: "DEF" },
  lcb: { code: "LCB", en: "Left Centre-Back", es: "Central Izquierdo", category: "DEF" },
  cb: { code: "CB", en: "Centre-Back", es: "Central", category: "DEF" },

  // Full Backs
  lateral: { code: "FB", en: "Full-Back", es: "Lateral", category: "DEF" },
  "lateral derecho": { code: "RB", en: "Right-Back", es: "Lateral Derecho", category: "DEF" },
  "lateral izquierdo": { code: "LB", en: "Left-Back", es: "Lateral Izquierdo", category: "DEF" },
  rb: { code: "RB", en: "Right-Back", es: "Lateral Derecho", category: "DEF" },
  lb: { code: "LB", en: "Left-Back", es: "Lateral Izquierdo", category: "DEF" },
  rwb: { code: "RWB", en: "Right Wing-Back", es: "Carrilero Derecho", category: "DEF" },
  lwb: { code: "LWB", en: "Left Wing-Back", es: "Carrilero Izquierdo", category: "DEF" },

  // Midfielders
  mediocentro: { code: "CM", en: "Central Midfielder", es: "Mediocentro", category: "MID" },
  "mediocentro defensivo": { code: "CDM", en: "Defensive Midfielder", es: "Mediocentro Defensivo", category: "MID" },
  pivote: { code: "CDM", en: "Defensive Midfielder", es: "Pivote", category: "MID" },
  cdm: { code: "CDM", en: "Defensive Midfielder", es: "Pivote", category: "MID" },
  cm: { code: "CM", en: "Central Midfielder", es: "Mediocentro", category: "MID" },
  interior: { code: "CM", en: "Central Midfielder", es: "Interior", category: "MID" },

  // Attacking Midfielders
  mediapunta: { code: "CAM", en: "Attacking Midfielder", es: "Mediapunta", category: "MID" },
  cam: { code: "CAM", en: "Attacking Midfielder", es: "Mediapunta", category: "MID" },
  amf: { code: "CAM", en: "Attacking Midfielder", es: "Mediapunta", category: "MID" },

  // Wingers
  extremo: { code: "W", en: "Winger", es: "Extremo", category: "ATT" },
  "extremo derecho": { code: "RW", en: "Right Winger", es: "Extremo Derecho", category: "ATT" },
  "extremo izquierdo": { code: "LW", en: "Left Winger", es: "Extremo Izquierdo", category: "ATT" },
  rw: { code: "RW", en: "Right Winger", es: "Extremo Derecho", category: "ATT" },
  lw: { code: "LW", en: "Left Winger", es: "Extremo Izquierdo", category: "ATT" },

  // Forwards
  delantero: { code: "ST", en: "Centre-Forward", es: "Delantero", category: "ATT" },
  delantera: { code: "ST", en: "Centre-Forward", es: "Delantera", category: "ATT" },
  "delantero centro": { code: "ST", en: "Centre-Forward", es: "Delantero Centro", category: "ATT" },
  st: { code: "ST", en: "Centre-Forward", es: "Delantero", category: "ATT" },
  cf: { code: "CF", en: "Second Striker", es: "Segundo Delantero", category: "ATT" },
};

export function getPositionBadge(pos?: string | null): { code: string; fullEn: string; category: string } {
  if (!pos) return { code: "—", fullEn: "Unknown", category: "MID" };
  const clean = pos.toLowerCase().trim();
  const found = POSITION_MAP[clean];
  if (found) {
    return { code: found.code, fullEn: found.en, category: found.category };
  }

  // Fallbacks
  if (clean.includes("porter") || clean.includes("keeper")) return { code: "GK", fullEn: "Goalkeeper", category: "GK" };
  if (clean.includes("central") && clean.includes("derech")) return { code: "RCB", fullEn: "Right Centre-Back", category: "DEF" };
  if (clean.includes("central") && clean.includes("izqu")) return { code: "LCB", fullEn: "Left Centre-Back", category: "DEF" };
  if (clean.includes("central")) return { code: "CB", fullEn: "Centre-Back", category: "DEF" };
  if (clean.includes("lateral") && clean.includes("derech")) return { code: "RB", fullEn: "Right-Back", category: "DEF" };
  if (clean.includes("lateral") && clean.includes("izqu")) return { code: "LB", fullEn: "Left-Back", category: "DEF" };
  if (clean.includes("defensivo") || clean.includes("cdm")) return { code: "CDM", fullEn: "Defensive Midfielder", category: "MID" };
  if (clean.includes("mediapunta") || clean.includes("cam")) return { code: "CAM", fullEn: "Attacking Midfielder", category: "MID" };
  if (clean.includes("mediocentro") || clean.includes("medio")) return { code: "CM", fullEn: "Central Midfielder", category: "MID" };
  if (clean.includes("extremo") && clean.includes("derech")) return { code: "RW", fullEn: "Right Winger", category: "ATT" };
  if (clean.includes("extremo") && clean.includes("izqu")) return { code: "LW", fullEn: "Left Winger", category: "ATT" };
  if (clean.includes("delanter") || clean.includes("st")) return { code: "ST", fullEn: "Centre-Forward", category: "ATT" };

  return { code: pos.slice(0, 3).toUpperCase(), fullEn: pos, category: "MID" };
}

