-- Medias de métricas (ficha) y notas del 11 Builder precalculadas.
-- league_metric_averages() y builder_metric_notes() recorrían radar_data entero (~110 MB) en cada llamada
-- (17 s y 5 s): ahora leen vistas materializadas, que pg_cron refresca solo cuando cambian las estadísticas.

-- 1. Medias de cada métrica: ponderadas por minutos (peso 1 sin minutos), sin las claves `_*`
CREATE MATERIALIZED VIEW IF NOT EXISTS public.league_metric_averages_mv AS
  SELECT m.key AS metric,
         round((sum((m.value->>0)::numeric * w.w) / sum(w.w))::numeric, 3) AS avg_value
  FROM public.player_season_stats s
  CROSS JOIN LATERAL (SELECT CASE WHEN coalesce(s.minutes_played, 0) > 0 THEN s.minutes_played ELSE 1 END AS w) w
  CROSS JOIN LATERAL jsonb_each(s.radar_data->'metricas') m
  WHERE s.radar_data IS NOT NULL
    AND jsonb_typeof(s.radar_data->'metricas') = 'object'
    AND left(m.key, 1) <> '_'
    AND jsonb_typeof(m.value) = 'array'
    AND jsonb_typeof(m.value->0) = 'number'
  GROUP BY m.key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_league_metric_averages_mv ON public.league_metric_averages_mv(metric);

-- 2. Notas 0-100 del Builder, una fila por jugadora con todas sus claves: { clave: nota }.
-- Media ponderada por minutos (mínimo 1) de todas sus temporadas. `_sub_*`: [nota0_100, nota0_10] → la
-- primera; métricas: [valor, nota0_10] → la segunda × 10. Sin `_cat_*`.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.player_metric_notes_mv AS
  WITH vals AS (
    SELECT s.player_id,
           m.key,
           greatest(coalesce(s.minutes_played, 0), 1) AS w,
           CASE WHEN m.key LIKE '\_sub\_%' THEN m.value->0 ELSE m.value->1 END AS raw
    FROM public.player_season_stats s
    CROSS JOIN LATERAL jsonb_each(s.radar_data->'metricas') m
    WHERE s.radar_data IS NOT NULL
      AND jsonb_typeof(s.radar_data->'metricas') = 'object'
      AND left(m.key, 5) <> '_cat_'
      AND jsonb_typeof(m.value) = 'array'
  ), notes AS (
    SELECT player_id, key,
           round(sum(CASE WHEN key LIKE '\_sub\_%' THEN (raw#>>'{}')::numeric
                          ELSE (raw#>>'{}')::numeric * 10 END * w) / sum(w), 1) AS note
    FROM vals
    WHERE jsonb_typeof(raw) = 'number'
    GROUP BY player_id, key
  )
  SELECT player_id, jsonb_object_agg(key, note) AS notes FROM notes GROUP BY player_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_metric_notes_mv ON public.player_metric_notes_mv(player_id);

-- Solo la API (service role) las lee
REVOKE ALL ON public.league_metric_averages_mv, public.player_metric_notes_mv FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.league_metric_averages_mv, public.player_metric_notes_mv TO service_role;

-- 3. Las funciones que ya llama la API, ahora sobre las vistas (misma firma y mismo resultado)
CREATE OR REPLACE FUNCTION public.league_metric_averages()
RETURNS TABLE (metric TEXT, avg_value NUMERIC)
LANGUAGE sql STABLE
AS $$
  SELECT metric, avg_value FROM public.league_metric_averages_mv
$$;

CREATE OR REPLACE FUNCTION public.builder_metric_notes(keys TEXT[])
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(jsonb_object_agg(player_id, sub), '{}'::jsonb)
  FROM (
    SELECT player_id,
           (SELECT jsonb_object_agg(k, notes->k) FROM unnest(keys) AS k WHERE notes ? k) AS sub
    FROM public.player_metric_notes_mv
  ) x
  WHERE sub IS NOT NULL
$$;

-- 4. Refresco: solo si player_season_stats cambió desde el último (pipeline, importación Wyscout...)
CREATE TABLE IF NOT EXISTS public.metric_views_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  source_updated_at TIMESTAMPTZ,
  refreshed_at TIMESTAMPTZ
);
ALTER TABLE public.metric_views_state ENABLE ROW LEVEL SECURITY;
INSERT INTO public.metric_views_state (id, source_updated_at, refreshed_at)
  SELECT 1, max(updated_at), now() FROM public.player_season_stats
  ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.refresh_metric_views(force BOOLEAN DEFAULT false)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  src TIMESTAMPTZ := (SELECT max(updated_at) FROM public.player_season_stats);
  prev TIMESTAMPTZ := (SELECT source_updated_at FROM public.metric_views_state WHERE id = 1);
BEGIN
  IF NOT force AND src IS NOT DISTINCT FROM prev THEN
    RETURN false;
  END IF;
  -- CONCURRENTLY: la web sigue leyendo las vistas mientras se recalculan
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.league_metric_averages_mv;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.player_metric_notes_mv;
  INSERT INTO public.metric_views_state (id, source_updated_at, refreshed_at) VALUES (1, src, now())
    ON CONFLICT (id) DO UPDATE SET source_updated_at = EXCLUDED.source_updated_at, refreshed_at = EXCLUDED.refreshed_at;
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION public.refresh_metric_views(BOOLEAN) FROM PUBLIC, anon, authenticated;

-- pg_cron corre dentro de la base de datos, sin el statement timeout de la API
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('refresh-metric-views', '*/15 * * * *', $$SELECT public.refresh_metric_views()$$);
