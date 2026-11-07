-- Coche escoba ceroacero.es (pipeline/ceroacero.py): ficha emparejada y última revisión.
-- El resto de datos se escriben en columnas existentes, solo cuando están vacías.
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS cz_id BIGINT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS cz_url TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS cz_updated_at TIMESTAMPTZ;
