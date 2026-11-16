-- Clean start schema additions & cleanup:
-- 1. Drop unnecessary staging/link/legacy tables
DROP TABLE IF EXISTS
  public.player_links,
  public.team_links,
  public.raw_soccerdonna_players,
  public.raw_soccerdonna_teams,
  public.raw_opta_players,
  public.raw_opta_teams,
  public.ingestion_targets
CASCADE;

-- 2. Link Soccerdonna leagues to Opta competition IDs and selected seasons
ALTER TABLE public.sd_leagues
  ADD COLUMN IF NOT EXISTS opta_competition_id TEXT,
  ADD COLUMN IF NOT EXISTS opta_season_ids TEXT[] DEFAULT '{}';

-- 3. Ensure players table has clean external IDs for FotMob and Opta
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS fotmob_id TEXT,
  ADD COLUMN IF NOT EXISTS fotmob_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS opta_id TEXT;

CREATE INDEX IF NOT EXISTS idx_players_opta_id ON public.players(opta_id) WHERE opta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_players_fotmob_id ON public.players(fotmob_id) WHERE fotmob_id IS NOT NULL;

