-- =========================================================================
-- HERSCOUT: LIGAS CONTRATADAS POR CADA CLUB
-- Qué ligas (competition_id de Opta, las de ingestion_targets) ve cada club en su app.
-- Se gestiona desde /admin (API de Next.js con service_role).
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.organization_leagues (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    competition_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, competition_id)
);
CREATE INDEX IF NOT EXISTS idx_org_leagues_comp ON public.organization_leagues(competition_id);

-- Misma función que 20261029000000_multi_tenancy_workspaces.sql, por si esa migración no se aplicó entera
CREATE OR REPLACE FUNCTION public.get_auth_user_org_ids()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT COALESCE(array_agg(organization_id), '{}'::UUID[])
    FROM public.organization_members
    WHERE user_id = auth.uid();
$$;

ALTER TABLE public.organization_leagues ENABLE ROW LEVEL SECURITY;

-- Cada club ve solo sus ligas contratadas; solo el administrador de la plataforma (service_role) las cambia
DROP POLICY IF EXISTS "Members view their organization leagues" ON public.organization_leagues;
CREATE POLICY "Members view their organization leagues"
    ON public.organization_leagues
    FOR SELECT
    USING (organization_id = ANY(public.get_auth_user_org_ids()));

DROP POLICY IF EXISTS "Service role write organization_leagues" ON public.organization_leagues;
CREATE POLICY "Service role write organization_leagues"
    ON public.organization_leagues
    FOR ALL TO service_role USING (true) WITH CHECK (true);
