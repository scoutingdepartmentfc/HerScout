-- Scout assignments to upcoming matches (S1 Block 12 & SPEC §7)
CREATE TABLE IF NOT EXISTS public.scout_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID,
    player_id VARCHAR(64) NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    match_id VARCHAR(64) NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    scout_name VARCHAR(120) NOT NULL,
    mode VARCHAR(20) NOT NULL DEFAULT 'live' CHECK (mode IN ('live', 'video')),
    status VARCHAR(20) NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'done')),
    match_report_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(player_id, match_id)
);

CREATE INDEX IF NOT EXISTS idx_scout_assignments_player ON public.scout_assignments(player_id);
CREATE INDEX IF NOT EXISTS idx_scout_assignments_match ON public.scout_assignments(match_id);

ALTER TABLE public.scout_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read scout_assignments" ON public.scout_assignments FOR SELECT USING (true);
CREATE POLICY "Service role write scout_assignments" ON public.scout_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);
