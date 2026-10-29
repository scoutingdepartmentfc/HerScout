-- =========================================================================
-- HERSCOUT SAAS MULTI-TENANCY & CLUB WORKSPACE MIGRATION
-- Version: 1.0.0
-- Description: Organizations, memberships, branding, SaaS entitlement fields,
--              and strict Row Level Security (RLS) policies.
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. ORGANIZATIONS (CLUBS)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    short_name VARCHAR(60) NOT NULL,
    slug VARCHAR(80) NOT NULL UNIQUE,
    logo_url TEXT,
    primary_color VARCHAR(30) DEFAULT '217 91% 60%', -- HSL string e.g. '217 91% 60%'
    secondary_color VARCHAR(30) DEFAULT '215 28% 17%',
    accent_color VARCHAR(30) DEFAULT '160 84% 39%',
    preferred_timezone VARCHAR(50) DEFAULT 'Europe/London',
    
    -- SaaS Entitlement & Subscription Preparation (No billing forced)
    subscription_plan VARCHAR(50) NOT NULL DEFAULT 'standard', -- 'trial', 'standard', 'pro', 'enterprise'
    subscription_status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'trialing', 'active', 'suspended', 'cancelled'
    seat_limit INT NOT NULL DEFAULT 5,
    feature_entitlements JSONB NOT NULL DEFAULT '{"pdf_export": true, "advanced_radars": true, "video_attachments": false}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. ORGANIZATION MEMBERS (USERS & ROLES)
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- references auth.users(id)
    role VARCHAR(50) NOT NULL DEFAULT 'scout', -- 'club_admin', 'chief_scout', 'scout', 'analyst', 'viewer'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);

-- 3. WATCHLISTS (CLUB PRIVATE)
CREATE TABLE IF NOT EXISTS public.watchlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    is_private_to_creator BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_watchlists_org ON public.watchlists(organization_id);

-- 4. WATCHLIST PLAYERS (CLUB PRIVATE)
CREATE TABLE IF NOT EXISTS public.watchlist_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    watchlist_id UUID NOT NULL REFERENCES public.watchlists(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    player_id VARCHAR(64) NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    priority_tier VARCHAR(20) NOT NULL DEFAULT 'tier-b', -- 'tier-a', 'tier-b', 'tier-c'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(watchlist_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_players_org ON public.watchlist_players(organization_id);

-- 5. SCOUTING REPORTS & EVALUATIONS (CLUB PRIVATE)
CREATE TABLE IF NOT EXISTS public.scouting_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    author_id UUID NOT NULL,
    player_id VARCHAR(64) NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    match_id VARCHAR(64) REFERENCES public.matches(id) ON DELETE SET NULL,
    rating NUMERIC(4,2) NOT NULL,
    recommendation VARCHAR(50) NOT NULL, -- 'sign', 'monitor', 'pass'
    tactical_notes TEXT,
    strengths TEXT[],
    weaknesses TEXT[],
    document_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scouting_reports_org ON public.scouting_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_scouting_reports_player ON public.scouting_reports(player_id);

-- =========================================================================
-- HELPER FUNCTIONS FOR ROW-LEVEL SECURITY (RLS)
-- =========================================================================

-- Get array of organization IDs the current user belongs to
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

-- Check if user is a club admin of a given organization
CREATE OR REPLACE FUNCTION public.is_club_admin(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE organization_id = org_id
          AND user_id = auth.uid()
          AND role = 'club_admin'
    );
$$;

-- =========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Enable RLS on all tenant tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scouting_reports ENABLE ROW LEVEL SECURITY;

-- 1. Organizations Policies
CREATE POLICY "Users can view their own organizations"
    ON public.organizations
    FOR SELECT
    USING (id = ANY(public.get_auth_user_org_ids()));

CREATE POLICY "Club admins can update their own organization settings"
    ON public.organizations
    FOR UPDATE
    USING (public.is_club_admin(id))
    WITH CHECK (public.is_club_admin(id));

-- 2. Organization Members Policies
CREATE POLICY "Users can view members of their organizations"
    ON public.organization_members
    FOR SELECT
    USING (organization_id = ANY(public.get_auth_user_org_ids()));

CREATE POLICY "Club admins can manage their organization members"
    ON public.organization_members
    FOR ALL
    USING (public.is_club_admin(organization_id))
    WITH CHECK (public.is_club_admin(organization_id));

-- 3. Watchlists Policies
CREATE POLICY "Users can view their organization watchlists"
    ON public.watchlists
    FOR SELECT
    USING (organization_id = ANY(public.get_auth_user_org_ids()));

CREATE POLICY "Users can create watchlists for their organization"
    ON public.watchlists
    FOR INSERT
    WITH CHECK (organization_id = ANY(public.get_auth_user_org_ids()));

CREATE POLICY "Users can update their organization watchlists"
    ON public.watchlists
    FOR UPDATE
    USING (organization_id = ANY(public.get_auth_user_org_ids()))
    WITH CHECK (organization_id = ANY(public.get_auth_user_org_ids()));

CREATE POLICY "Users can delete their organization watchlists"
    ON public.watchlists
    FOR DELETE
    USING (organization_id = ANY(public.get_auth_user_org_ids()));

-- 4. Watchlist Players Policies
CREATE POLICY "Users can view players in their organization watchlists"
    ON public.watchlist_players
    FOR SELECT
    USING (organization_id = ANY(public.get_auth_user_org_ids()));

CREATE POLICY "Users can add players to their organization watchlists"
    ON public.watchlist_players
    FOR INSERT
    WITH CHECK (organization_id = ANY(public.get_auth_user_org_ids()));

CREATE POLICY "Users can modify entries in their organization watchlists"
    ON public.watchlist_players
    FOR UPDATE
    USING (organization_id = ANY(public.get_auth_user_org_ids()))
    WITH CHECK (organization_id = ANY(public.get_auth_user_org_ids()));

CREATE POLICY "Users can remove players from their organization watchlists"
    ON public.watchlist_players
    FOR DELETE
    USING (organization_id = ANY(public.get_auth_user_org_ids()));

-- 5. Scouting Reports Policies
CREATE POLICY "Users can view scouting reports belonging to their organization"
    ON public.scouting_reports
    FOR SELECT
    USING (organization_id = ANY(public.get_auth_user_org_ids()));

CREATE POLICY "Users can file scouting reports for their organization"
    ON public.scouting_reports
    FOR INSERT
    WITH CHECK (organization_id = ANY(public.get_auth_user_org_ids()));

CREATE POLICY "Users can update their organization scouting reports"
    ON public.scouting_reports
    FOR UPDATE
    USING (organization_id = ANY(public.get_auth_user_org_ids()))
    WITH CHECK (organization_id = ANY(public.get_auth_user_org_ids()));

CREATE POLICY "Users can delete their organization scouting reports"
    ON public.scouting_reports
    FOR DELETE
    USING (organization_id = ANY(public.get_auth_user_org_ids()));

