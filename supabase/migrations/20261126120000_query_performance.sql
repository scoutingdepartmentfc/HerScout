-- Rendimiento de lectura (auditoría 2026-11-26).
-- radar_data pesa ~9 KB por fila (hasta 23 KB): sacar de él un campo de 14 bytes obligaba a Postgres a
-- descomprimir el JSON entero, y con la paginación por OFFSET las páginas altas de /api/players y
-- /api/builder/metrics pasaban del statement timeout (8 s).

-- 1. Perfil de la jugadora como columna propia (la mantiene Postgres a partir de radar_data)
ALTER TABLE public.player_season_stats
  ADD COLUMN IF NOT EXISTS perfil TEXT GENERATED ALWAYS AS (radar_data->>'perfil') STORED;

-- 2. Lectura de player_season_stats temporada a temporada, paginando por id (sin OFFSET)
CREATE INDEX IF NOT EXISTS idx_pss_season_id ON public.player_season_stats(season_id, id);

-- 3. Tendencias de /api/players: últimas notas por fecha (antes ordenaba 96k filas en cada página)
CREATE INDEX IF NOT EXISTS idx_pm_scores_date ON public.player_match_scores(match_date DESC, id);

-- 4. Medias de las métricas (ficha de jugadora): calculadas en la base de datos en vez de descargar
-- radar_data entero (12,8 MB por llamada, y solo llegaban las 1000 primeras filas por el max-rows de la API).
-- Misma regla que antes: media ponderada por minutos (peso 1 si la fila no tiene minutos), sin las claves `_*`.
CREATE OR REPLACE FUNCTION public.league_metric_averages()
RETURNS TABLE (metric TEXT, avg_value NUMERIC)
LANGUAGE sql STABLE
SET statement_timeout = '30s'
AS $$
  SELECT m.key,
         round((sum((m.value->>0)::numeric * w.w) / sum(w.w))::numeric, 3)
  FROM public.player_season_stats s
  CROSS JOIN LATERAL (SELECT CASE WHEN coalesce(s.minutes_played, 0) > 0 THEN s.minutes_played ELSE 1 END AS w) w
  CROSS JOIN LATERAL jsonb_each(s.radar_data->'metricas') m
  WHERE s.radar_data IS NOT NULL
    AND jsonb_typeof(s.radar_data->'metricas') = 'object'
    AND left(m.key, 1) <> '_'
    AND jsonb_typeof(m.value) = 'array'
    AND jsonb_typeof(m.value->0) = 'number'
  GROUP BY m.key
$$;

REVOKE ALL ON FUNCTION public.league_metric_averages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.league_metric_averages() TO service_role;

-- 5. 11 Builder: nota 0-100 por jugadora de las claves pedidas, media ponderada por minutos (mínimo 1) de
-- todas sus temporadas. `_sub_*`: [nota0_100, nota0_10] → la primera; métricas: [valor, nota0_10] → la
-- segunda × 10. Devuelve { playerId: { clave: nota } }, un solo valor (el max-rows de la API no lo corta).
CREATE OR REPLACE FUNCTION public.builder_metric_notes(keys TEXT[])
RETURNS JSONB
LANGUAGE sql STABLE
SET statement_timeout = '30s'
AS $$
  WITH vals AS (
    SELECT s.player_id,
           k.key,
           greatest(coalesce(s.minutes_played, 0), 1) AS w,
           CASE WHEN k.key LIKE '\_sub\_%' THEN s.radar_data->'metricas'->k.key->0
                ELSE s.radar_data->'metricas'->k.key->1 END AS raw
    FROM public.player_season_stats s
    CROSS JOIN unnest(keys) AS k(key)
    WHERE s.radar_data IS NOT NULL
      AND left(k.key, 5) <> '_cat_'
      AND jsonb_typeof(s.radar_data->'metricas'->k.key) = 'array'
  ), notes AS (
    SELECT player_id, key,
           round(sum(CASE WHEN key LIKE '\_sub\_%' THEN (raw#>>'{}')::numeric
                          ELSE (raw#>>'{}')::numeric * 10 END * w) / sum(w), 1) AS note
    FROM vals
    WHERE jsonb_typeof(raw) = 'number'
    GROUP BY player_id, key
  ), per_player AS (
    SELECT player_id, jsonb_object_agg(key, note) AS notes FROM notes GROUP BY player_id
  )
  SELECT coalesce(jsonb_object_agg(player_id, notes), '{}'::jsonb) FROM per_player
$$;

REVOKE ALL ON FUNCTION public.builder_metric_notes(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.builder_metric_notes(TEXT[]) TO service_role;
