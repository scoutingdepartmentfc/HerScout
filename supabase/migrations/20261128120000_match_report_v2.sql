-- =========================================================================
-- Match Report v2 · Scouting history · Star consensus (SPEC v1.5 §5, §6.4, §6.9, §6.10, §7)
-- =========================================================================
BEGIN;

-- 1. CLUB TIERS (T1–T7), assigned per club by an admin (§6.7)
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS tier VARCHAR(3)
    CHECK (tier IS NULL OR tier IN ('T1','T2','T3','T4','T5','T6','T7'));
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS tier_updated_by VARCHAR(120);
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS tier_updated_at TIMESTAMPTZ;

-- 2. SCOUTS (simple identity until per-scout login exists; "Viewing as" selector in the app)
CREATE TABLE IF NOT EXISTS public.scouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    name VARCHAR(120) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS scouts_org_name_uniq ON public.scouts (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- Existing assignments keep scout_name; new ones also store scout_id
ALTER TABLE public.scout_assignments ADD COLUMN IF NOT EXISTS scout_id UUID REFERENCES public.scouts(id) ON DELETE SET NULL;
-- Seed scouts from names already used in assignments / reports, and link them
INSERT INTO public.scouts (organization_id, name)
SELECT DISTINCT ON (lower(trim(scout_name))) organization_id, trim(scout_name)
FROM public.scout_assignments
WHERE scout_name IS NOT NULL AND trim(scout_name) <> ''
ON CONFLICT DO NOTHING;
UPDATE public.scout_assignments a SET scout_id = s.id
FROM public.scouts s
WHERE a.scout_id IS NULL AND lower(s.name) = lower(trim(a.scout_name));

-- Full reports: link to a scout (stars-only drafts are created per scout, §6.9)
ALTER TABLE public.scouting_reports ADD COLUMN IF NOT EXISTS scout_id UUID REFERENCES public.scouts(id) ON DELETE SET NULL;

-- 3. SCOUT ATTENDANCE: created when a scout opens a match report (§5.1)
CREATE TABLE IF NOT EXISTS public.scout_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    match_id VARCHAR(64) NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    scout_id UUID NOT NULL REFERENCES public.scouts(id) ON DELETE CASCADE,
    mode VARCHAR(10) NOT NULL DEFAULT 'live' CHECK (mode IN ('live','video')),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (match_id, scout_id)
);
CREATE INDEX IF NOT EXISTS idx_scout_attendance_scout ON public.scout_attendance(scout_id);

-- 4. MATCH REPORTS v2 (one per match × player × scout)
CREATE TABLE IF NOT EXISTS public.match_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    match_id VARCHAR(64) NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    player_id VARCHAR(64) NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    scout_id UUID NOT NULL REFERENCES public.scouts(id) ON DELETE CASCADE,
    team_id VARCHAR(64) REFERENCES public.teams(id) ON DELETE SET NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
    mode VARCHAR(10) NOT NULL DEFAULT 'live' CHECK (mode IN ('live','video')),
    match_date TIMESTAMPTZ,

    -- auto from lineup / events, editable as start → end
    position_start VARCHAR(10),
    position_end VARCHAR(10),
    system_start VARCHAR(12),
    system_end VARCHAR(12),
    minutes INT,
    events JSONB NOT NULL DEFAULT '[]'::jsonb,
    eventing JSONB NOT NULL DEFAULT '{}'::jsonb,       -- enums.json → matchEventingKeys

    -- context snapshot at match time
    own_tier VARCHAR(3),
    opponent_tier VARCHAR(3),
    tier_diff INT,

    opta_rating NUMERIC(4,2),
    match_rating NUMERIC(3,1) NOT NULL CHECK (match_rating >= 0 AND match_rating <= 10 AND (match_rating * 2) = floor(match_rating * 2)),
    adjusted_rating NUMERIC(3,1),

    rating_now NUMERIC(2,1) CHECK (rating_now IS NULL OR (rating_now BETWEEN 0.5 AND 5 AND (rating_now * 2) = floor(rating_now * 2))),
    rating_potential NUMERIC(2,1) CHECK (rating_potential IS NULL OR (rating_potential BETWEEN 0.5 AND 5 AND (rating_potential * 2) = floor(rating_potential * 2))),

    vs_last JSONB,          -- { overall, technical, physical, decision, tactical, mentality: -1/0/1 }
    minutes_vs_avg INT,
    watch_for JSONB,        -- [{ item, result: better/same/worse/not_seen }]
    pillar_flash JSONB,     -- { pillar: -1/0/1 } first-time players only
    tags_seen TEXT[] NOT NULL DEFAULT '{}',
    player_note TEXT,
    consistency_note TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    UNIQUE (match_id, player_id, scout_id)
);
CREATE INDEX IF NOT EXISTS idx_match_reports_player ON public.match_reports(player_id, match_date DESC);
CREATE INDEX IF NOT EXISTS idx_match_reports_match ON public.match_reports(match_id);
CREATE INDEX IF NOT EXISTS idx_match_reports_scout ON public.match_reports(scout_id);

ALTER TABLE public.scout_assignments
    DROP CONSTRAINT IF EXISTS scout_assignments_match_report_fk;
ALTER TABLE public.scout_assignments
    ADD CONSTRAINT scout_assignments_match_report_fk FOREIGN KEY (match_report_id) REFERENCES public.match_reports(id) ON DELETE SET NULL;

-- 5. MATCH NOTE: one per match per scout, shared by all players of that match
CREATE TABLE IF NOT EXISTS public.match_notes (
    match_id VARCHAR(64) NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    scout_id UUID NOT NULL REFERENCES public.scouts(id) ON DELETE CASCADE,
    text TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (match_id, scout_id)
);

-- 6. PLAYER STAR RATINGS: every star rating from full or match reports (§6.9)
CREATE TABLE IF NOT EXISTS public.player_star_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    player_id VARCHAR(64) NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    scout_id UUID NOT NULL REFERENCES public.scouts(id) ON DELETE CASCADE,
    source VARCHAR(14) NOT NULL CHECK (source IN ('full_report','match_report')),
    source_id UUID NOT NULL,
    rating_now NUMERIC(2,1),
    rating_potential NUMERIC(2,1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_star_ratings_player ON public.player_star_ratings(player_id, created_at DESC);

-- 7. RLS: same pattern as scout_assignments (public read, service role writes via API)
ALTER TABLE public.scouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scout_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_star_ratings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['scouts','scout_attendance','match_reports','match_notes','player_star_ratings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public read %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Public read %1$s" ON public.%1$s FOR SELECT USING (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS "Service role write %1$s" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "Service role write %1$s" ON public.%1$s FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

COMMIT;
