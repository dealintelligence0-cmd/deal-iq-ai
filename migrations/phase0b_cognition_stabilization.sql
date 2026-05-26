-- Phase 0b — Cognition stabilization (applied to Supabase project dqffgolunjrswamvnsip)
-- Recorded here for version control; both statements were applied via Supabase migrations:
--   20260526... phase0b_cognition_assumptions_nulls_not_distinct
--   20260526... phase0b_cognition_rules_enable_rls

-- ---------------------------------------------------------------------------
-- 1. Deterministic assumption upserts.
--    The original UNIQUE(workspace_id, deal_id, key) treated NULL scopes as
--    DISTINCT, so the orchestrator's onConflict upsert never matched for
--    workspace_id-null rows. Every module run INSERTed a duplicate instead of
--    UPDATEing, and getAssumption().maybeSingle() began erroring once >1 row
--    matched a scope. Collapse duplicates, then switch to NULLS NOT DISTINCT.
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY workspace_id, deal_id, key
           ORDER BY last_revised_at DESC, revision_count DESC, id
         ) AS rn
  FROM cognition_assumptions
)
DELETE FROM cognition_assumptions a
USING ranked r
WHERE a.id = r.id AND r.rn > 1;

ALTER TABLE cognition_assumptions
  DROP CONSTRAINT IF EXISTS cognition_assumptions_workspace_id_deal_id_key_key;

ALTER TABLE cognition_assumptions
  ADD CONSTRAINT cognition_assumptions_scope_key_uniq
  UNIQUE NULLS NOT DISTINCT (workspace_id, deal_id, key);

-- ---------------------------------------------------------------------------
-- 2. Close the one cognition RLS gap. cognition_propagation_rules was the only
--    cognition table without RLS. Rules are global declarative logic: readable
--    by any authenticated user, writable only by the service role (orchestrator),
--    which bypasses RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE cognition_propagation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cognition_rules_read ON cognition_propagation_rules;
CREATE POLICY cognition_rules_read
  ON cognition_propagation_rules
  FOR SELECT
  TO authenticated
  USING (true);
