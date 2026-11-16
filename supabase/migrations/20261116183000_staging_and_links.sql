-- Staging tables for Opta and Soccerdonna + Link tables for clean unification

CREATE TABLE IF NOT EXISTS public.raw_opta_teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  country TEXT,
  competition_id TEXT,
  badge_url TEXT,
  raw_payload JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.raw_soccerdonna_teams (
  id TEXT PRIMARY KEY, -- e.g. 'sd-1143'
  name TEXT NOT NULL,
  league_code TEXT,
  country TEXT,
  sd_url TEXT,
  badge_url TEXT,
  raw_payload JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_links (
  id BIGSERIAL PRIMARY KEY,
  opta_team_id TEXT NOT NULL REFERENCES public.raw_opta_teams(id) ON DELETE CASCADE,
  sd_team_id TEXT NOT NULL REFERENCES public.raw_soccerdonna_teams(id) ON DELETE CASCADE,
  confidence REAL DEFAULT 100.0,
  method TEXT DEFAULT 'auto',
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (opta_team_id, sd_team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_links_opta ON public.team_links(opta_team_id);
CREATE INDEX IF NOT EXISTS idx_team_links_sd ON public.team_links(sd_team_id);

CREATE TABLE IF NOT EXISTS public.raw_opta_players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  match_name TEXT,
  country TEXT,
  birth_date DATE,
  place_of_birth TEXT,
  height INTEGER,
  weight INTEGER,
  preferred_foot TEXT,
  shirt_number INTEGER,
  opta_position TEXT,
  current_team_id TEXT,
  photo_url TEXT,
  raw_payload JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.raw_soccerdonna_players (
  id TEXT PRIMARY KEY, -- e.g. 'sd_12345'
  name TEXT NOT NULL,
  country TEXT,
  birth_date DATE,
  place_of_birth TEXT,
  height INTEGER,
  preferred_foot TEXT,
  current_team_id TEXT,
  sd_url TEXT,
  market_value NUMERIC,
  photo_url TEXT,
  raw_payload JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.player_links (
  id BIGSERIAL PRIMARY KEY,
  opta_player_id TEXT NOT NULL REFERENCES public.raw_opta_players(id) ON DELETE CASCADE,
  sd_player_id TEXT NOT NULL REFERENCES public.raw_soccerdonna_players(id) ON DELETE CASCADE,
  confidence REAL DEFAULT 100.0,
  method TEXT DEFAULT 'auto',
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (opta_player_id, sd_player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_links_opta ON public.player_links(opta_player_id);
CREATE INDEX IF NOT EXISTS idx_player_links_sd ON public.player_links(sd_player_id);

