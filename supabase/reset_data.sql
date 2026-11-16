-- Wipe ALL tables in public schema EXCEPT opta_catalog.
-- Safe against missing tables: loops dynamically over pg_tables.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'opta_catalog'
  ) LOOP
    EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE;', r.tablename);
  END LOOP;
END $$;
