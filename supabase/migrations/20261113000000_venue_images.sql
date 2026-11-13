-- Stadium photos for the Matches page backdrop, resolved once from Wikipedia (pageimages) by venue name.
-- Keyed by the normalized Opta venue name (lower(trim(matches.venue_name))). A row with image_url NULL means
-- "searched, no photo found" so it is not looked up again (the API retries those after 90 days).
-- To fix a wrong photo by hand: UPDATE venue_images SET image_url = '<url>', manual = true WHERE name_key = '...';
CREATE TABLE IF NOT EXISTS public.venue_images (
  name_key    TEXT PRIMARY KEY,
  venue_name  TEXT NOT NULL,
  image_url   TEXT,
  wiki_title  TEXT,
  manual      BOOLEAN NOT NULL DEFAULT false,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the server (service role) reads/writes it.
ALTER TABLE public.venue_images ENABLE ROW LEVEL SECURITY;
