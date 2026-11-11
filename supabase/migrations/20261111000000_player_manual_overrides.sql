-- Manual edits made from the player profile (Edit button). Stored apart from the pipeline columns so that
-- Opta / Soccerdonna / ceroacero re-runs never overwrite them; the API merges them over the scraped data.
-- Keys (camelCase, same as the API response): name, matchName, country, citizenship, birthDate, placeOfBirth,
-- height, weight, preferredFoot, shirtNumber, marketValue, contractUntil, joinedOn, photoUrl,
-- primaryPosition, otherPositions.
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS manual_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS manual_updated_at TIMESTAMPTZ;
