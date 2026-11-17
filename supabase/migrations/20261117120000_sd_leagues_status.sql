-- /admin: estado de cada parte de la descarga por liga (Soccerdonna ya usa last_download_at)
ALTER TABLE public.sd_leagues
  ADD COLUMN IF NOT EXISTS last_opta_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_fotmob_at TIMESTAMPTZ;

-- Las temporadas Opta elegidas nunca son NULL (el pipeline las une con la última del catálogo)
UPDATE public.sd_leagues SET opta_season_ids = '{}' WHERE opta_season_ids IS NULL;
