const PAGE = 1000; // max-rows de la API de Supabase
const CONCURRENCY = 6;

/**
 * Todas las filas de player_season_stats, leídas temporada a temporada y paginando por id (keyset).
 * Con OFFSET cada página volvía a recorrer las anteriores y las altas pasaban del statement timeout;
 * así cada consulta cuesta lo mismo y van varias a la vez.
 *
 * `select` debe incluir `id`; `refine` añade filtros extra a cada consulta (p. ej. sobre la tabla enlazada).
 */
export async function fetchSeasonStatsRows(
  db: any,
  select: string,
  refine: (q: any) => any = (q) => q
): Promise<any[]> {
  const { data: seasons, error } = await db.from("seasons").select("id");
  if (error) throw error;
  const ids: string[] = (seasons || []).map((s: any) => s.id);

  const out: any[] = [];
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const seasonId = ids[next++];
      let lastId: string | null = null;
      for (;;) {
        let q = refine(db.from("player_season_stats").select(select)).eq("season_id", seasonId);
        if (lastId) q = q.gt("id", lastId);
        const { data, error: err } = await q.order("id").limit(PAGE);
        if (err) throw err;
        out.push(...(data || []));
        if (!data || data.length < PAGE) break;
        lastId = data[data.length - 1].id;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}

let perfilColumn: boolean | null = null;
/** La columna `perfil` llega con la migración 20261126120000_query_performance.sql; hasta entonces, del JSON. */
export async function perfilSelect(db: any): Promise<string> {
  if (perfilColumn === null) {
    const { error } = await db.from("player_season_stats").select("perfil").limit(0);
    perfilColumn = !error;
  }
  return perfilColumn ? "perfil" : "perfil:radar_data->perfil";
}
