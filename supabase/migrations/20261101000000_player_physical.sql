-- =========================================================================
-- HERSCOUT: ATRIBUTOS FÍSICOS DE FOOTBALL MANAGER (escala 1-20)
-- Se importan de una exportación de vuestra propia partida de FM con: python -m pipeline.fm_fisico <fichero>
-- Una fila por jugadora. Valores con decimales si FM daba un rango (atributo sin ojear del todo).
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.player_physical (
    player_id VARCHAR(64) PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
    acceleration NUMERIC(3,1),
    agility NUMERIC(3,1),
    balance NUMERIC(3,1),
    jumping_reach NUMERIC(3,1),
    natural_fitness NUMERIC(3,1),
    pace NUMERIC(3,1),
    stamina NUMERIC(3,1),
    strength NUMERIC(3,1),
    fm_name VARCHAR(150),
    fm_club VARCHAR(150),
    fm_birth_date DATE,
    match_method VARCHAR(30),
    match_score NUMERIC(5,1),
    source_file VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.player_physical ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'player_physical' AND policyname = 'Public read player_physical') THEN
        CREATE POLICY "Public read player_physical" ON public.player_physical FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'player_physical' AND policyname = 'Service role write player_physical') THEN
        CREATE POLICY "Service role write player_physical" ON public.player_physical FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;
