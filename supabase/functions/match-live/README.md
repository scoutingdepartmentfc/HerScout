# match-live

Updates each match right after it ends: result, status, lineups (formation, XI and bench), goals, cards and
substitutions. Also stores the starting XI ~1 h before kick-off, as soon as Opta publishes it.

Runs every 10 minutes via `pg_cron` → `pg_net` → this function. It only touches matches in two small time
windows, so each run reads a handful of rows (minimal egress) and calls Opta only for those matches.

## Setup (once)

```bash
# 1. Log in and deploy (the function checks its own secret header, not a Supabase JWT)
npx supabase login
npx supabase functions deploy match-live --no-verify-jwt --project-ref <project-ref>

# 2. Function secrets (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically)
npx supabase secrets set CRON_SECRET=<long random string> --project-ref <project-ref>
# optional, defaults to the same key as pipeline/config.py
npx supabase secrets set SDAPI_OUTLET_KEY=<key> --project-ref <project-ref>
```

3. In the SQL Editor, store the URL and the same secret in Vault:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<same CRON_SECRET>', 'match_live_secret');
```

4. Run `supabase/migrations/20261113120000_match_live.sql` (adds the columns and schedules the job).

## Check it

```sql
select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'match-live')
order by start_time desc limit 10;
select id, status, home_score, away_score, live_checked_at from matches
where live_checked_at is not null order by live_checked_at desc limit 20;
```

Manual call: `curl -X POST https://<project-ref>.supabase.co/functions/v1/match-live -H "x-cron-secret: <secret>"`
