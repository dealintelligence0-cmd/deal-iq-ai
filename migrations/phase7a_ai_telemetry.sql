-- Phase 7A — AI telemetry baseline (measurement only, no behaviour change)
--
-- WHAT THIS DOES
--   Creates one table that records WHAT the AI layer did for each request: whether a
--   cloud call was made, a cached result was reused, or (from Phase 7D) on-device AI
--   answered — plus tokens, estimated cost, latency and a coarse failure reason.
--
-- WHY
--   We do not claim savings without measurement. This establishes the BEFORE baseline
--   that Phases 7B–7G are measured against. The headline KPI is:
--       cloud AI calls avoided per 100 user actions.
--
-- HOW TO APPLY (non-technical, ~1 minute)
--   1. Open your Supabase project → SQL Editor → New query.
--   2. Paste this entire file and click Run.
--   3. Done. Telemetry starts recording on the next AI generation.
--
-- IMPORTANT — telemetry is DORMANT until this file is applied. The app checks for this
-- table at write time; if it does not exist, the write is silently skipped and nothing
-- breaks. To switch telemetry off later, either drop this table or set the environment
-- variable AI_TELEMETRY_DISABLED=1 in Vercel.
--
-- PRIVACY / ENTERPRISE SAFETY
--   This table stores NO prompt text, NO generated output, NO document content and NO
--   company or deal names. Only counts, model identifiers, durations and fixed category
--   codes. Provider error messages are mapped to a short code (never stored verbatim),
--   because raw errors can echo API keys or customer data.

CREATE TABLE IF NOT EXISTS ai_telemetry (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Where the call came from.
  module              text NOT NULL,          -- proposal | synergy | pmi | tsa | enrich | ingestion | …
  operation           text NOT NULL,          -- generate | retry_quality | semantic_cache | …

  -- What the system DID. This is the column the KPI is built on.
  --   cloud            → a cloud AI call was made
  --   cloud_fallback   → primary failed; fallback provider or offline engine served it
  --   cache_hit        → existing result reused, cloud call AVOIDED
  --   cache_miss       → cache consulted and missed (a cloud call follows)
  --   t0_answered      → deterministic logic answered, no AI at all        (Phase 7B+)
  --   local_accepted   → on-device AI answered, cloud call AVOIDED         (Phase 7D+)
  --   local_escalated  → on-device AI ran but failed validation → cloud    (Phase 7D+)
  decision            text NOT NULL CHECK (decision IN (
                        'cloud','cloud_fallback','cache_hit','cache_miss',
                        't0_answered','local_accepted','local_escalated')),

  provider            text,
  model               text,
  tier                text,

  input_tokens        integer NOT NULL DEFAULT 0,
  output_tokens       integer NOT NULL DEFAULT 0,
  cached_input_tokens integer NOT NULL DEFAULT 0,   -- provider-side prompt caching
  est_cost_usd        numeric NOT NULL DEFAULT 0,   -- from the app's existing rate table

  latency_ms          integer NOT NULL DEFAULT 0,

  -- Fixed category only — never a raw provider error string.
  fallback_reason     text CHECK (fallback_reason IS NULL OR fallback_reason IN (
                        'rate_limit','timeout','auth','context_length',
                        'provider_error','unavailable','unknown')),

  -- Did the T0 gate accept on-device output? Always 'not_applicable' until Phase 7D.
  validation_outcome  text NOT NULL DEFAULT 'not_applicable'
                        CHECK (validation_outcome IN ('not_applicable','passed','failed')),

  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Reporting indexes: baseline queries slice by time, module, and decision.
CREATE INDEX IF NOT EXISTS idx_ai_telemetry_created    ON ai_telemetry (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_telemetry_mod_dec    ON ai_telemetry (module, decision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_telemetry_user_time  ON ai_telemetry (user_id, created_at DESC);

-- RLS: a user may read only their own telemetry. Writes come from the server-side
-- service-role client, which bypasses RLS — so no INSERT policy is granted to users.
ALTER TABLE ai_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ai_telemetry_own_read ON ai_telemetry;
CREATE POLICY p_ai_telemetry_own_read
  ON ai_telemetry FOR SELECT
  USING (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- BASELINE QUERIES — run these after ~2 weeks of normal use to capture "BEFORE".
-- Re-run the identical queries after each later phase to prove the improvement.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) HEADLINE KPI — cloud calls avoided per 100 AI decisions.
--    Baseline is expected to be LOW: today the only avoidance path is the in-memory
--    semantic cache, which resets on every serverless instance.
--
-- SELECT
--   count(*) FILTER (WHERE decision IN ('cloud','cloud_fallback'))            AS cloud_calls,
--   count(*) FILTER (WHERE decision IN ('cache_hit','t0_answered','local_accepted')) AS calls_avoided,
--   round(100.0 * count(*) FILTER (WHERE decision IN ('cache_hit','t0_answered','local_accepted'))
--         / NULLIF(count(*),0), 1)                                            AS avoided_per_100
-- FROM ai_telemetry
-- WHERE created_at > now() - interval '14 days';

-- 2) COST + TOKENS BY MODULE — where the money actually goes.
--
-- SELECT module,
--        count(*) FILTER (WHERE decision IN ('cloud','cloud_fallback')) AS cloud_calls,
--        sum(input_tokens)  AS input_tokens,
--        sum(output_tokens) AS output_tokens,
--        round(sum(est_cost_usd)::numeric, 4) AS est_cost_usd
-- FROM ai_telemetry
-- WHERE created_at > now() - interval '14 days'
-- GROUP BY module ORDER BY est_cost_usd DESC;

-- 3) PROPOSAL RETRY CHAIN — the direct input to Phase 7B. Shows how often each retry
--    fires and what the repeated full-context calls cost.
--
-- SELECT operation, count(*) AS calls,
--        sum(input_tokens) AS input_tokens,
--        round(sum(est_cost_usd)::numeric, 4) AS est_cost_usd,
--        round(avg(latency_ms)) AS avg_latency_ms
-- FROM ai_telemetry
-- WHERE module = 'proposal' AND created_at > now() - interval '14 days'
-- GROUP BY operation ORDER BY est_cost_usd DESC;

-- 4) CACHE EFFECTIVENESS — proves the Phase 7C problem (hit rate near zero).
--
-- SELECT module,
--        count(*) FILTER (WHERE decision = 'cache_hit')  AS hits,
--        count(*) FILTER (WHERE decision = 'cache_miss') AS misses,
--        round(100.0 * count(*) FILTER (WHERE decision = 'cache_hit')
--              / NULLIF(count(*) FILTER (WHERE decision IN ('cache_hit','cache_miss')),0), 1) AS hit_rate_pct
-- FROM ai_telemetry
-- WHERE operation = 'semantic_cache'          -- scope to ONE cache; keeps the rate honest
--   AND created_at > now() - interval '14 days'
-- GROUP BY module;

-- 5) ENRICH VOLUME — one cloud call per deal today; the Phase 7D baseline.
--
-- SELECT count(*) AS enrich_cloud_calls,
--        round(sum(est_cost_usd)::numeric, 4) AS est_cost_usd,
--        round(avg(latency_ms)) AS avg_latency_ms
-- FROM ai_telemetry
-- WHERE module = 'enrich' AND decision IN ('cloud','cloud_fallback')
--   AND created_at > now() - interval '14 days';

-- 6) RELIABILITY — hidden retries and failure mix.
--
-- SELECT fallback_reason, count(*) AS occurrences
-- FROM ai_telemetry
-- WHERE fallback_reason IS NOT NULL AND created_at > now() - interval '14 days'
-- GROUP BY fallback_reason ORDER BY occurrences DESC;

-- 7) LATENCY — the "before" for local-vs-cloud comparisons in later phases.
--
-- SELECT decision,
--        round(avg(latency_ms)) AS avg_ms,
--        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms
-- FROM ai_telemetry
-- WHERE created_at > now() - interval '14 days'
-- GROUP BY decision;


-- ─────────────────────────────────────────────────────────────────────────────
-- RETENTION — keeps the table small and free-tier friendly. Safe to run any time;
-- consider it monthly once a baseline has been captured and exported.
-- ─────────────────────────────────────────────────────────────────────────────
-- DELETE FROM ai_telemetry WHERE created_at < now() - interval '90 days';
