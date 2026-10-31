-- =========================================================================
-- HERSCOUT: ESCUDO DEL CLUB ACTUAL Y LOGO DE SU LIGA (Soccerdonna)
-- players.fm_team_name / fm_team_badge_url ya guardan el club actual de Soccerdonna;
-- aquí se añade la liga de ese club y la liga de cada equipo.
-- =========================================================================

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS current_league_name VARCHAR(150);
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS current_league_logo_url TEXT;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS league_name VARCHAR(150);
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS league_logo_url TEXT;
ALTER TABLE public.sd_leagues ADD COLUMN IF NOT EXISTS logo_url TEXT;
