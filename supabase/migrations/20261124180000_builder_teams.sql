-- 11 Builder: equipos guardados (pizarra). Antes iban en el localStorage del navegador.
-- Se leen y escriben solo desde la API (/api/builder/teams, con la service role): RLS activo y sin políticas,
-- así que la clave anónima del navegador no puede tocarlos.
CREATE TABLE IF NOT EXISTS public.builder_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  formation TEXT NOT NULL,
  -- { "LCB": [ {id, name, photoUrl, teamName, ...}, ... hasta 10 ], ... } (la primera de cada posición es la titular)
  team JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Notas por jugadora { player_id: texto } y nota general del equipo
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  team_note TEXT,
  -- Color de cada jugadora en la pizarra { player_id: "#hex" }
  colors JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Quién lo guardó (usuario de la sesión)
  created_by_email TEXT,
  created_by_name TEXT,
  updated_by_email TEXT,
  updated_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builder_teams_updated ON public.builder_teams(updated_at DESC);

ALTER TABLE public.builder_teams ENABLE ROW LEVEL SECURITY;
