-- =========================================================================
-- HERSCOUT: BORRAR TODOS LOS DATOS (clubes, jugadoras, partidos, estadísticas...)
-- Ejecutar a mano en el SQL Editor de Supabase. NO es una migración: no se puede deshacer.
--
-- Se conservan:
--  - opta_catalog (catálogo de ligas Opta del panel /admin)
--  - ingestion_targets (ligas y temporadas elegidas para descargar)
--  - las fotos y escudos de Storage (se reutilizan al volver a descargar)
-- Después, "Download now" en /admin (o el Action de los martes) vuelve a descargar todo con datos reales.
-- =========================================================================

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        -- Clubes (en cascada: miembros, watchlists, informes y ligas contratadas)
        'organization_leagues', 'scouting_reports', 'watchlist_players', 'watchlists',
        'organization_members', 'organizations',
        -- Datos descargados por el pipeline
        'player_match_scores', 'player_match_stats', 'player_season_stats', 'squad_members',
        'player_market_values', 'player_transfers', 'player_injuries', 'player_national_teams', 'player_physical',
        'matches', 'players', 'teams', 'ingestion_checkpoints', 'seasons', 'competitions',
        'leagues', 'ingestion_runs'
    ] LOOP
        -- Solo las tablas que existan (alguna migración puede no estar aplicada)
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('TRUNCATE TABLE public.%I CASCADE', t);
            RAISE NOTICE 'Vaciada: %', t;
        END IF;
    END LOOP;
END $$;
