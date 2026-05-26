-- Phase 4 — Executive Brief surface (applied to Supabase project dqffgolunjrswamvnsip)
-- Recorded here for version control; applied via Supabase migration:
--   20260526... phase4_synthesis_runs_lookup_index
--
-- The cognition_synthesis_runs table already exists (Phase 0). Phase 4 only adds
-- a lookup index for "latest executive brief per scope". Briefs are generated on
-- demand by src/lib/cognition/synthesize.ts (deterministic, zero AI, no scheduled
-- jobs) and written through the service-role client, so no new RLS policy is needed.

CREATE INDEX IF NOT EXISTS idx_cog_synth_scope_ran
  ON cognition_synthesis_runs (workspace_id, deal_id, ran_at DESC);
