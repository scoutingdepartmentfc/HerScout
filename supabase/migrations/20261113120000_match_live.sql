-- Live match updates: result + lineups (with goals, cards and substitutions) right after each match ends.
-- Filled by the Edge Function `match-live` (supabase/functions/match-live), called every 10 min by pg_cron.
-- The Tuesday pipeline still computes stats/ratings; it decides what to process from its own cache, so a
-- match marked 'Played' here is still processed on Tuesday. Its upserts don't send `lineups`, so they keep it.

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS lineups JSONB;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS live_checked_at TIMESTAMPTZ;

-- The function only reads matches in a small time window: keep that query on an index (low egress, fast).
CREATE INDEX IF NOT EXISTS matches_match_date_idx ON public.matches (match_date);

-- ---------------------------------------------------------------------------------------------------------
-- Scheduler (run AFTER deploying the function, see supabase/functions/match-live/README.md):
--   1. Store the project URL and the shared secret in Vault (Dashboard → Project Settings → Vault, or SQL):
--        select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--        select vault.create_secret('<same value as the CRON_SECRET function secret>', 'match_live_secret');
--   2. Then this block schedules the call every 10 minutes.
-- ---------------------------------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('match-live') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'match-live');
  PERFORM cron.schedule(
    'match-live',
    '*/10 * * * *',
    $job$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/match-live',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'match_live_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$
  );
END $$;
