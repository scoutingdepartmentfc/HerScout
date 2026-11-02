-- =========================================================================
-- HERSCOUT: VALORACIONES EA SPORTS FC (escala 1-99): Pace, Physicality y sus atributos
-- Se importan del dataset de Kaggle mikedpad/ea-sports-fc27-player-ratings con: python -m pipeline.ea_fc
-- Una fila por jugadora (la última edición importada).
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.player_ea_ratings (
    player_id VARCHAR(64) PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
    pace SMALLINT,
    acceleration SMALLINT,
    sprint_speed SMALLINT,
    physicality SMALLINT,
    jumping SMALLINT,
    stamina SMALLINT,
    strength SMALLINT,
    aggression SMALLINT,
    overall_rating SMALLINT,
    ea_player_id INTEGER,
    ea_name VARCHAR(150),
    ea_club VARCHAR(150),
    ea_league VARCHAR(150),
    ea_birth_date DATE,
    edition VARCHAR(20),
    snapshot_date DATE,
    match_method VARCHAR(30),
    match_score NUMERIC(5,1),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.player_ea_ratings ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'player_ea_ratings' AND policyname = 'Public read player_ea_ratings') THEN
        CREATE POLICY "Public read player_ea_ratings" ON public.player_ea_ratings FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'player_ea_ratings' AND policyname = 'Service role write player_ea_ratings') THEN
        CREATE POLICY "Service role write player_ea_ratings" ON public.player_ea_ratings FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
