-- =========================================================================
-- HERSCOUT: DATOS OPTA + FOTMOB + SOCCERDONNA (mismo esquema que Scouting_jugadores)
-- Ejecutar UNA vez en el SQL Editor de Supabase.
--
-- 1. Borra las 6 tablas de datos simplificadas (estaban vacías) y las crea con el esquema
--    del pipeline (pipeline/ingest.py y pipeline/soccerdonna.py).
-- 2. Añade opta_catalog e ingestion_targets (ligas/temporadas que se eligen en /admin).
-- 3. Vuelve a enlazar watchlist_players y scouting_reports con players/matches.
-- No toca organizations, organization_members, watchlists ni scouting_reports (solo sus FK).
-- =========================================================================

BEGIN;

DROP TABLE IF EXISTS public.player_season_stats CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;
DROP TABLE IF EXISTS public.players CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.seasons CASCADE;
DROP TABLE IF EXISTS public.competitions CASCADE;

-- ───────────────────────── 20261019000000_initial_scouting_schema.sql ─────────────────────────
-- =========================================================================
-- SCOUTING PROFESIONAL: MIGRACIÓN BASE POSTGRESQL (SUPABASE FREE OPTIMIZADA)
-- Version: 1.0.0
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. COMPETICIONES
CREATE TABLE IF NOT EXISTS public.competitions (
    id VARCHAR(64) PRIMARY KEY, -- ID estable del proveedor (Opta / SDAPI)
    name VARCHAR(150) NOT NULL,
    country VARCHAR(100) NOT NULL,
    code VARCHAR(50),
    active_season_id VARCHAR(64),
    logo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TEMPORADAS
CREATE TABLE IF NOT EXISTS public.seasons (
    id VARCHAR(64) PRIMARY KEY, -- tmcl ID
    competition_id VARCHAR(64) NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- Ej: '2025/2026'
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_seasons_comp ON public.seasons(competition_id);

-- 3. EQUIPOS
CREATE TABLE IF NOT EXISTS public.teams (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    short_name VARCHAR(100),
    country VARCHAR(100),
    badge_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. JUGADORES
CREATE TABLE IF NOT EXISTS public.players (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    match_name VARCHAR(100),
    country VARCHAR(100),
    birth_date DATE,
    photo_url TEXT,
    primary_position VARCHAR(50) DEFAULT 'Desconocida',
    grupo_demarcacion VARCHAR(50) DEFAULT 'Sin clasificar',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_players_dem ON public.players(primary_position, grupo_demarcacion);

-- 5. PARTIDOS (MATCHES)
CREATE TABLE IF NOT EXISTS public.matches (
    id VARCHAR(64) PRIMARY KEY,
    competition_id VARCHAR(64) NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    season_id VARCHAR(64) NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
    home_team_id VARCHAR(64) NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    away_team_id VARCHAR(64) NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    match_date TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'Played', -- 'Played', 'Fixture', 'Postponed'
    home_score INT DEFAULT 0,
    away_score INT DEFAULT 0,
    has_events BOOLEAN DEFAULT false,
    has_stats BOOLEAN DEFAULT false,
    last_processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_matches_comp_season ON public.matches(competition_id, season_id, match_date);

-- 6. ESTADÍSTICAS POR PARTIDO (PLAYER_MATCH_STATS)
CREATE TABLE IF NOT EXISTS public.player_match_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id VARCHAR(64) NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    player_id VARCHAR(64) NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    team_id VARCHAR(64) NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    competition_id VARCHAR(64) NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    season_id VARCHAR(64) NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
    match_date TIMESTAMPTZ,
    formation VARCHAR(50),
    slot INT,
    demarcacion VARCHAR(50),
    grupo_demarcacion VARCHAR(50),
    minutes_played INT DEFAULT 0,
    is_starter BOOLEAN DEFAULT false,
    is_captain BOOLEAN DEFAULT false,
    
    -- Métricas granulares nativas para indexación rápida
    goals INT DEFAULT 0,
    assists INT DEFAULT 0,
    xg NUMERIC(6,3) DEFAULT 0,
    xa NUMERIC(6,3) DEFAULT 0,
    xca NUMERIC(6,3) DEFAULT 0,
    passes_completed INT DEFAULT 0,
    passes_total INT DEFAULT 0,
    passes_pct NUMERIC(5,2) DEFAULT 0,
    progressive_passes INT DEFAULT 0,
    tackles_won INT DEFAULT 0,
    tackles_total INT DEFAULT 0,
    interceptions INT DEFAULT 0,
    recoveries INT DEFAULT 0,
    aerials_won INT DEFAULT 0,
    aerials_total INT DEFAULT 0,
    takeons_successful INT DEFAULT 0,
    takeons_total INT DEFAULT 0,
    fouls INT DEFAULT 0,
    yellow_cards INT DEFAULT 0,
    red_cards INT DEFAULT 0,

    -- JSONB compacto con métricas secundarias (+40 campos) para no disparar coste de columnas
    detailed_metrics JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(match_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_pms_player ON public.player_match_stats(player_id, match_date);
CREATE INDEX IF NOT EXISTS idx_pms_comp_season ON public.player_match_stats(competition_id, season_id, demarcacion);

-- 7. SCORES EVALUATIVOS POR PARTIDO (0 A 9.9)
CREATE TABLE IF NOT EXISTS public.player_match_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id VARCHAR(64) NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    player_id VARCHAR(64) NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    demarcacion VARCHAR(50) NOT NULL,
    grupo_demarcacion VARCHAR(50) NOT NULL,
    score_general NUMERIC(4,2) NOT NULL DEFAULT 5.0,
    score_ofensivo NUMERIC(4,2) NOT NULL DEFAULT 5.0,
    score_defensivo NUMERIC(4,2) NOT NULL DEFAULT 5.0,
    score_comportamiento NUMERIC(4,2) NOT NULL DEFAULT 5.0,
    score_abp NUMERIC(4,2) NOT NULL DEFAULT 5.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(match_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_pm_scores_player ON public.player_match_scores(player_id);

-- 8. TABLA AGREGADA DE TEMPORADA (PLAYER_SEASON_STATS) - OPTIMIZACIÓN SUPABASE FREE
CREATE TABLE IF NOT EXISTS public.player_season_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id VARCHAR(64) NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    season_id VARCHAR(64) NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
    competition_id VARCHAR(64) NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    team_id VARCHAR(64) NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    demarcacion VARCHAR(50) NOT NULL,
    grupo_demarcacion VARCHAR(50) NOT NULL,
    
    matches_played INT DEFAULT 0,
    matches_70m INT DEFAULT 0,
    starts INT DEFAULT 0,
    minutes_played INT DEFAULT 0,
    starter_pct NUMERIC(5,2) DEFAULT 0,

    -- Scores ponderados oficiales (0 a 9.9)
    score_general NUMERIC(4,2) DEFAULT 5.0,
    score_ofensivo NUMERIC(4,2) DEFAULT 5.0,
    score_defensivo NUMERIC(4,2) DEFAULT 5.0,
    score_comportamiento NUMERIC(4,2) DEFAULT 5.0,
    score_abp NUMERIC(4,2) DEFAULT 5.0,
    
    -- Percentiles calculados por demarcación en la competición (0 a 99)
    percentile_general NUMERIC(5,2) DEFAULT 50.0,
    percentile_ofensivo NUMERIC(5,2) DEFAULT 50.0,
    percentile_defensivo NUMERIC(5,2) DEFAULT 50.0,
    percentile_comportamiento NUMERIC(5,2) DEFAULT 50.0,
    percentile_abp NUMERIC(5,2) DEFAULT 50.0,
    
    -- Métricas agregadas por 90 minutos
    goals_p90 NUMERIC(6,3) DEFAULT 0,
    assists_p90 NUMERIC(6,3) DEFAULT 0,
    xg_p90 NUMERIC(6,3) DEFAULT 0,
    xa_p90 NUMERIC(6,3) DEFAULT 0,
    xca_p90 NUMERIC(6,3) DEFAULT 0,
    passes_p90 NUMERIC(6,3) DEFAULT 0,
    passes_pct NUMERIC(5,2) DEFAULT 0,
    progressive_passes_p90 NUMERIC(6,3) DEFAULT 0,
    takeons_p90 NUMERIC(6,3) DEFAULT 0,
    takeons_pct NUMERIC(5,2) DEFAULT 0,
    tackles_p90 NUMERIC(6,3) DEFAULT 0,
    tackles_pct NUMERIC(5,2) DEFAULT 0,
    interceptions_p90 NUMERIC(6,3) DEFAULT 0,
    recoveries_p90 NUMERIC(6,3) DEFAULT 0,
    aerials_p90 NUMERIC(6,3) DEFAULT 0,
    aerials_pct NUMERIC(5,2) DEFAULT 0,
    
    -- Resumen JSON para visualización radar / campograma rápido sin egress
    radar_data JSONB DEFAULT '{}'::jsonb,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(player_id, season_id, demarcacion)
);
CREATE INDEX IF NOT EXISTS idx_pss_ranking ON public.player_season_stats(competition_id, season_id, demarcacion, score_general DESC);
CREATE INDEX IF NOT EXISTS idx_pss_player ON public.player_season_stats(player_id);

-- 9. CONTROL DE INGESTAS Y CHECKPOINTS
CREATE TABLE IF NOT EXISTS public.ingestion_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
    trigger_type VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'manual'
    total_competitions INT DEFAULT 0,
    matches_processed INT DEFAULT 0,
    players_updated INT DEFAULT 0,
    error_summary TEXT,
    details JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.ingestion_checkpoints (
    competition_id VARCHAR(64) PRIMARY KEY REFERENCES public.competitions(id) ON DELETE CASCADE,
    season_id VARCHAR(64) NOT NULL,
    last_match_date TIMESTAMPTZ,
    last_processed_match_id VARCHAR(64),
    last_success_run TIMESTAMPTZ,
    consecutive_errors INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'idle',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================================
-- SEGURIDAD: ROW LEVEL SECURITY (RLS)
-- =========================================================================
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_match_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_match_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_season_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_checkpoints ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura anónima (frontend de solo lectura)
CREATE POLICY "Public read competitions" ON public.competitions FOR SELECT USING (true);
CREATE POLICY "Public read seasons" ON public.seasons FOR SELECT USING (true);
CREATE POLICY "Public read teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Public read players" ON public.players FOR SELECT USING (true);
CREATE POLICY "Public read matches" ON public.matches FOR SELECT USING (true);
CREATE POLICY "Public read player_match_stats" ON public.player_match_stats FOR SELECT USING (true);
CREATE POLICY "Public read player_match_scores" ON public.player_match_scores FOR SELECT USING (true);
CREATE POLICY "Public read player_season_stats" ON public.player_season_stats FOR SELECT USING (true);
CREATE POLICY "Public read ingestion_runs" ON public.ingestion_runs FOR SELECT USING (true);

-- Permisos de escritura reservados exclusivamente a service_role
CREATE POLICY "Service role write competitions" ON public.competitions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role write seasons" ON public.seasons FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role write teams" ON public.teams FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role write players" ON public.players FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role write matches" ON public.matches FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role write player_match_stats" ON public.player_match_stats FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role write player_match_scores" ON public.player_match_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role write player_season_stats" ON public.player_season_stats FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role write ingestion_runs" ON public.ingestion_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role write ingestion_checkpoints" ON public.ingestion_checkpoints FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────── 20261019120000_pipeline_v2_fotos_y_demarcaciones.sql ─────────────────────────
-- =========================================================================
-- SCOUTING PROFESIONAL: PIPELINE v2 (fotos, perfil de jugador, scores por partido)
-- Idempotente: se puede ejecutar varias veces.
-- =========================================================================

-- 1. JUGADORES: perfil completo desde Opta squads + FotMob
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS current_team_id VARCHAR(64) REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS shirt_number INT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS height INT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS weight INT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS preferred_foot VARCHAR(20);
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS place_of_birth VARCHAR(150);
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS opta_position VARCHAR(50);
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS market_value BIGINT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS fotmob_id BIGINT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS photo_updated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_players_team ON public.players(current_team_id);

-- Las URLs de optasports usaban el ID legacy numérico y redirigen a un placeholder: se limpian
UPDATE public.players SET photo_url = NULL WHERE photo_url LIKE '%optasports.com%';

-- 2. EQUIPOS
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS fotmob_id BIGINT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS competition_id VARCHAR(64) REFERENCES public.competitions(id) ON DELETE SET NULL;

-- 3. COMPETICIONES
ALTER TABLE public.competitions ADD COLUMN IF NOT EXISTS fotmob_id BIGINT;

-- 4. PARTIDOS: marcador ya se rellena (home_score/away_score existen)
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS week VARCHAR(20);

-- 5. SCORES POR PARTIDO: guardar competición/temporada/fecha para evolutivos sin JOIN
ALTER TABLE public.player_match_scores ADD COLUMN IF NOT EXISTS competition_id VARCHAR(64) REFERENCES public.competitions(id) ON DELETE CASCADE;
ALTER TABLE public.player_match_scores ADD COLUMN IF NOT EXISTS season_id VARCHAR(64) REFERENCES public.seasons(id) ON DELETE CASCADE;
ALTER TABLE public.player_match_scores ADD COLUMN IF NOT EXISTS match_date TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_pm_scores_player_date ON public.player_match_scores(player_id, match_date);

-- 6. TABLA DE TEMPORADA: índice para rankings por grupo de demarcación
CREATE INDEX IF NOT EXISTS idx_pss_ranking_grupo ON public.player_season_stats(competition_id, season_id, grupo_demarcacion, score_general DESC);

-- 7. STORAGE: buckets de fotos/escudos (públicos) y caché del pipeline (privado)
INSERT INTO storage.buckets (id, name, public)
VALUES ('player-photos', 'player-photos', true),
       ('team-badges', 'team-badges', true),
       ('pipeline-cache', 'pipeline-cache', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'Public read player photos and badges') THEN
        CREATE POLICY "Public read player photos and badges" ON storage.objects
            FOR SELECT USING (bucket_id IN ('player-photos', 'team-badges'));
    END IF;
END $$;

-- ───────────────────────── 20261021000000_transfermarkt.sql ─────────────────────────
-- =========================================================================
-- SCOUTING PROFESIONAL: TRANSFERMARKT (perfil, valor de mercado, traspasos, lesiones)
-- Idempotente: se puede ejecutar varias veces.
-- =========================================================================

-- 1. JUGADORES: ID Transfermarkt y datos de contrato
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS tm_id BIGINT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS tm_url TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS tm_position_main VARCHAR(60);
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS tm_positions_other TEXT[];
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS citizenship TEXT[];
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS contract_expires DATE;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS joined_on DATE;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS agent VARCHAR(150);
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS market_value_updated_at DATE;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS tm_updated_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_tm_id ON public.players(tm_id) WHERE tm_id IS NOT NULL;

-- 2. EQUIPOS
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS tm_id BIGINT;

-- 3. EVOLUCIÓN DEL VALOR DE MERCADO
CREATE TABLE IF NOT EXISTS public.player_market_values (
    player_id VARCHAR(64) NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    market_value BIGINT,
    club_name VARCHAR(150),
    tm_club_id BIGINT,
    age INT,
    PRIMARY KEY (player_id, date)
);

-- 4. HISTORIAL DE TRASPASOS / CESIONES
CREATE TABLE IF NOT EXISTS public.player_transfers (
    tm_transfer_id BIGINT PRIMARY KEY,
    player_id VARCHAR(64) NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    date DATE,
    season VARCHAR(10),
    club_from VARCHAR(150),
    tm_club_from_id BIGINT,
    club_to VARCHAR(150),
    tm_club_to_id BIGINT,
    fee BIGINT,
    market_value BIGINT,
    upcoming BOOLEAN DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_transfers_player ON public.player_transfers(player_id, date);

-- 5. LESIONES
CREATE TABLE IF NOT EXISTS public.player_injuries (
    player_id VARCHAR(64) NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    from_date DATE NOT NULL,
    injury VARCHAR(150) NOT NULL,
    season VARCHAR(10),
    until_date DATE,
    days INT,
    games_missed INT,
    PRIMARY KEY (player_id, from_date, injury)
);

-- 6. RLS: lectura pública, escritura solo service_role
ALTER TABLE public.player_market_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_injuries ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['player_market_values', 'player_transfers', 'player_injuries'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'Public read ' || t) THEN
            EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)', 'Public read ' || t, t);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'Service role write ' || t) THEN
            EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', 'Service role write ' || t, t);
        END IF;
    END LOOP;
END $$;

-- ───────────────────────── 20261023000000_soccerdonna.sql ─────────────────────────
-- =========================================================================
-- SCOUTING PROFESIONAL: SOCCERDONNA (fútbol femenino)
-- Perfil, selección nacional, valor de mercado, traspasos y lesiones.
-- Reutiliza player_market_values / player_transfers / player_injuries de Transfermarkt.
-- Idempotente: se puede ejecutar varias veces.
-- =========================================================================

-- 1. JUGADORAS: ID Soccerdonna
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS sd_id BIGINT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS sd_url TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS outfitter VARCHAR(60);
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS sd_updated_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_sd_id ON public.players(sd_id) WHERE sd_id IS NOT NULL;

-- 2. ESCUDOS de los clubes por los que ha pasado (evolución de valor y traspasos)
ALTER TABLE public.player_market_values ADD COLUMN IF NOT EXISTS sd_club_id BIGINT;
ALTER TABLE public.player_market_values ADD COLUMN IF NOT EXISTS club_badge_url TEXT;
ALTER TABLE public.player_transfers ADD COLUMN IF NOT EXISTS club_from_badge_url TEXT;
ALTER TABLE public.player_transfers ADD COLUMN IF NOT EXISTS club_to_badge_url TEXT;
ALTER TABLE public.player_transfers ADD COLUMN IF NOT EXISTS loan BOOLEAN DEFAULT false;
ALTER TABLE public.player_transfers ADD COLUMN IF NOT EXISTS fee_text VARCHAR(60);

-- 3. SELECCIÓN NACIONAL
CREATE TABLE IF NOT EXISTS public.player_national_teams (
    player_id VARCHAR(64) NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    sd_team_id BIGINT NOT NULL,
    team_name VARCHAR(150) NOT NULL,
    debut_date DATE,
    caps INT,
    goals INT,
    PRIMARY KEY (player_id, sd_team_id)
);

ALTER TABLE public.player_national_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública selección" ON public.player_national_teams;
CREATE POLICY "Lectura pública selección" ON public.player_national_teams FOR SELECT USING (true);

-- ───────────────────────── 20261023120000_plantillas_por_temporada.sql ─────────────────────────
-- =========================================================================
-- SCOUTING PROFESIONAL: PLANTILLAS POR TEMPORADA (Opta)
-- Todas las jugadoras de cada temporada, hayan jugado o no (player_season_stats
-- solo tiene a las que superan el mínimo de minutos).
-- Idempotente: se puede ejecutar varias veces.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.squad_members (
    season_id VARCHAR(64) NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
    player_id VARCHAR(64) NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    competition_id VARCHAR(64) NOT NULL,
    team_id VARCHAR(64) REFERENCES public.teams(id) ON DELETE SET NULL,
    active BOOLEAN DEFAULT true,          -- false: dejó el equipo durante la temporada
    shirt_number INT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (season_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_squad_members_player ON public.squad_members(player_id);

ALTER TABLE public.squad_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública plantillas" ON public.squad_members;
CREATE POLICY "Lectura pública plantillas" ON public.squad_members FOR SELECT USING (true);

-- ───────────────────────── 20261024000000_ligas.sql ─────────────────────────
-- =========================================================================
-- SCOUTING PROFESIONAL: LIGAS (FotMob)
-- Liga del equipo actual de cada jugadora y su logo.
-- Idempotente: se puede ejecutar varias veces.
-- =========================================================================

-- 1. LIGAS: ID de FotMob (logo en team-badges/ligas/{id}.png)
CREATE TABLE IF NOT EXISTS public.leagues (
    id INT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    country_code VARCHAR(10),
    logo_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura pública ligas" ON public.leagues;
CREATE POLICY "Lectura pública ligas" ON public.leagues FOR SELECT USING (true);

-- 2. JUGADORAS: ID FotMob, equipo actual según FotMob y su liga
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS fotmob_id BIGINT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS fm_team_name VARCHAR(150);
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS league_id INT REFERENCES public.leagues(id) ON DELETE SET NULL;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS league_updated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_players_league ON public.players(league_id);


-- ───────────────────────── 20261024120000_escudo_club_actual.sql ─────────────────────────
-- =========================================================================
-- SCOUTING PROFESIONAL: ESCUDO DEL CLUB ACTUAL (FotMob)
-- Escudo nítido del club actual (los de Soccerdonna son de 25 px): team-badges/fotmob/{fm_team_id}.png
-- Idempotente: se puede ejecutar varias veces.
-- =========================================================================

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS fm_team_id BIGINT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS fm_team_badge_url TEXT;

-- ───────────────────────── 20261028120000_calendario_estadios.sql ─────────────────────────
-- =========================================================================
-- SCOUTING PROFESIONAL: CALENDARIO COMPLETO
-- La ingesta guarda también los partidos pendientes (status 'Fixture'/'Postponed'...)
-- con su estadio; `time_confirmed` = false si Opta aún no ha fijado la hora.
-- Idempotente: se puede ejecutar varias veces.
-- =========================================================================
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS venue_id VARCHAR(64);
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS venue_name VARCHAR(200);
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS time_confirmed BOOLEAN DEFAULT true;

-- ───────────────────────── 20261028180000_notas_0_100.sql ─────────────────────────
-- =========================================================================
-- SCOUTING PROFESIONAL: NOTAS 0-100 POR CATEGORÍA (pipeline/categorias.py)
-- Percentil frente al grupo de demarcación con corrección por minutos jugados.
-- NULL = categoría sin datos (p. ej. Progresión en temporadas de solo matchstats).
-- Idempotente: se puede ejecutar varias veces.
-- =========================================================================
ALTER TABLE public.player_season_stats ADD COLUMN IF NOT EXISTS nota_global NUMERIC(5,1);
ALTER TABLE public.player_season_stats ADD COLUMN IF NOT EXISTS nota_ataque NUMERIC(5,1);
ALTER TABLE public.player_season_stats ADD COLUMN IF NOT EXISTS nota_construccion NUMERIC(5,1);
ALTER TABLE public.player_season_stats ADD COLUMN IF NOT EXISTS nota_defensa NUMERIC(5,1);
ALTER TABLE public.player_season_stats ADD COLUMN IF NOT EXISTS nota_balon_parado NUMERIC(5,1);
ALTER TABLE public.player_season_stats ADD COLUMN IF NOT EXISTS nota_disponibilidad NUMERIC(5,1);
CREATE INDEX IF NOT EXISTS idx_pss_nota_global ON public.player_season_stats(competition_id, season_id, nota_global DESC);

-- ───────────────────────── Ligas a descargar (de 20261028000000_admin_clubes_ligas.sql) ─────────────────────────
-- Solo service_role: el panel /admin de HerScout lee y escribe desde la API de Next.js
-- 4. CATÁLOGO OPTA (lo rellena pipeline/catalogo.py con la service_role)
-- data_level: jugadora | jugadora parcial | alineacion | resultado | sin jugados
CREATE TABLE IF NOT EXISTS public.opta_catalog (
    season_id VARCHAR(50) PRIMARY KEY,
    competition_id VARCHAR(50) NOT NULL,
    competition_name VARCHAR(150) NOT NULL,
    country VARCHAR(100),
    format VARCHAR(50),
    season_name VARCHAR(50),
    start_date DATE,
    end_date DATE,
    played_matches INT DEFAULT 0,
    data_level VARCHAR(30),
    has_eventing BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opta_catalog_comp ON public.opta_catalog(competition_id);
ALTER TABLE public.opta_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role write opta_catalog" ON public.opta_catalog;
CREATE POLICY "Service role write opta_catalog" ON public.opta_catalog FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. LIGAS A DESCARGAR (las lee pipeline/ingest.py; si no hay ninguna activa usa config.py)
-- fuente: eventing (eventos + matchstats) | matchstats (solo estadísticas oficiales)
CREATE TABLE IF NOT EXISTS public.ingestion_targets (
    season_id VARCHAR(50) PRIMARY KEY,
    competition_id VARCHAR(50) NOT NULL,
    competition_name VARCHAR(150) NOT NULL,
    country VARCHAR(100),
    season_name VARCHAR(50),
    fuente VARCHAR(20) NOT NULL DEFAULT 'eventing' CHECK (fuente IN ('eventing', 'matchstats')),
    is_active BOOLEAN DEFAULT false,
    enabled BOOLEAN DEFAULT true,
    fotmob_id INT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.ingestion_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role write ingestion_targets" ON public.ingestion_targets;
CREATE POLICY "Service role write ingestion_targets" ON public.ingestion_targets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────── Enlaces con las tablas de clubes de HerScout ─────────────────────────
ALTER TABLE public.watchlist_players
    ADD CONSTRAINT watchlist_players_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;
ALTER TABLE public.scouting_reports
    ADD CONSTRAINT scouting_reports_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;
ALTER TABLE public.scouting_reports
    ADD CONSTRAINT scouting_reports_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE SET NULL;

COMMIT;
