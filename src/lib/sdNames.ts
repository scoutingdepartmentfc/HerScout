import { supabaseAdmin } from "@/lib/supabase";

/**
 * Nombres de Soccerdonna para lo que viene de Opta: liga de cada competición Opta (sd_leagues) y club de cada
 * equipo Opta (teams.sd_name, lo rellena pipeline/sd_ligas.py vincular_equipos). Sin vínculo, el de Opta.
 */
export type SdLeague = { name: string; country: string | null; logoUrl: string | null };

// Varias ligas de Soccerdonna pueden apuntar a la misma competición Opta (Apertura y Clausura, SWPL 1 y 2...):
// gana la activa en /admin y, entre ellas, la de nivel más alto ("Tier 1" antes que "Tier 2" y que las copas)
const rank = (l: any) => `${l.enabled ? 0 : 1}${(l.level || "").startsWith("Tier") ? l.level : "Z"}`;

let cache: { at: number; map: Map<string, SdLeague> } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function getSdLeagues(): Promise<Map<string, SdLeague>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const { data, error } = await (supabaseAdmin as any)
    .from("sd_leagues")
    .select("name, country, level, enabled, logo_url, opta_competition_id")
    .not("opta_competition_id", "is", null);
  if (error) return cache?.map ?? new Map();
  const best = new Map<string, any>();
  for (const l of data || []) {
    const prev = best.get(l.opta_competition_id);
    if (!prev || rank(l) < rank(prev)) best.set(l.opta_competition_id, l);
  }
  const map = new Map<string, SdLeague>();
  for (const [id, l] of Array.from(best.entries())) map.set(id, { name: l.name, country: l.country, logoUrl: l.logo_url });
  cache = { at: Date.now(), map };
  return map;
}

// teams.sd_name llega con la migración 20261119180000_team_sd_link.sql: hasta aplicarla se pide sin ella
let sdNameColumn: boolean | null = null;
export async function hasSdNameColumn(): Promise<boolean> {
  if (sdNameColumn === null) {
    const { error } = await (supabaseAdmin as any).from("teams").select("id, sd_name").limit(0);
    sdNameColumn = !error;
  }
  return sdNameColumn;
}

/** Nombre a mostrar de un equipo: el de su club de Soccerdonna si está vinculado. */
export const teamName = (t: any): string | undefined => t?.sd_name || t?.name;
