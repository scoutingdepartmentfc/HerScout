-- =========================================================================
-- HERSCOUT: LIGAS DE SOCCERDONNA (fuente principal de jugadoras)
-- sd_leagues: catálogo de ligas de soccerdonna.de (pipeline/sd_ligas.py catalogo); en /admin se eligen
-- las que se descargan (enabled) y su competición Opta (opta_competition_id) para las métricas.
-- Jugadoras y clubes de Soccerdonna usan id "sd-<id>"; opta_id las vincula después con Opta.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.sd_leagues (
    code VARCHAR(20) PRIMARY KEY,              -- ESP1, ENG1, NWSL...
    name VARCHAR(150) NOT NULL,
    country VARCHAR(100),
    level VARCHAR(50),
    teams INT,
    players INT,
    url TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    opta_competition_id VARCHAR(64),           -- sugerida por parecido de nombre + país, editable en /admin
    last_download_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.sd_leagues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role write sd_leagues" ON public.sd_leagues;
CREATE POLICY "Service role write sd_leagues" ON public.sd_leagues FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS sd_league_code VARCHAR(20);
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS opta_id VARCHAR(64);
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS sd_league_code VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_players_sd_league ON public.players(sd_league_code);
