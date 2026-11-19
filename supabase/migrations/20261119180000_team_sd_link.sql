-- Equipo Opta ↔ club de Soccerdonna (pipeline/sd_ligas.py vincular_equipos): los partidos se muestran con el
-- nombre del club de Soccerdonna (el mismo de la ficha de cada jugadora) y no con el de Opta
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS sd_team_id TEXT,
  ADD COLUMN IF NOT EXISTS sd_name TEXT;
