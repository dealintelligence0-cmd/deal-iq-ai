-- Phase 7C — durable AI result cache
--
-- WHAT THIS DOES
--   Creates one table that stores AI results so they survive the serverless instance
--   that produced them. Nothing else changes: the same matching rules, the same
--   24-hour expiry, the same per-user scoping as the existing in-memory cache.
--
-- WHY
--   The cache used to live in process memory. On Vercel, the instance that wrote an
--   entry is almost never the instance that could reuse it, so Phase 7A telemetry
--   measured the hit rate at 0% — the cache avoided no cloud calls at all. This makes
--   a hit possible for a partner who comes back later, or lands on a different
--   instance, which is the normal case rather than the exception.
--
-- HOW TO APPLY (non-technical, ~1 minute)
--   1. Open your Supabase project -> SQL Editor -> New query.
--   2. Paste this entire file and click Run.
--   3. Done. Caching starts working on the next PMI or Synergy generation.
--
-- IMPORTANT — the cache is DORMANT until this file is applied. Without this table
-- every lookup fails and is swallowed, leaving exactly the previous behaviour: nothing
-- breaks, nothing is cached across instances. To switch it off later, either drop this
-- table or set the environment variable AI_CACHE_DISABLED=1 in Vercel.
--
-- PRIVACY / SAFETY
--   This table DOES store generated document text — that is what a cache is. It is
--   therefore scoped tightly:
--     * user_id is required, and RLS restricts reads to the owning user, so one
--       partner's document can never be served to another.
--     * salt pins the provider AND model, so changing model never replays an answer
--       produced by a different one.
--     * expires_at bounds every row to 24 hours, so a stale document cannot outlive
--       the deal model it was derived from.
--   Writes come from the server-side service-role client, which bypasses RLS.

CREATE TABLE IF NOT EXISTS ai_cache (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  module        text NOT NULL,                 -- pmi | synergy | …
  salt          text NOT NULL DEFAULT '',      -- "<provider>:<model>" — pins the answer's origin
  prompt_hash   text NOT NULL,                 -- sha256 of the exact prompt: the fast, safest match
  prompt_chars  integer NOT NULL DEFAULT 0,    -- cheap pre-filter before scoring similarity
  vector        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- top terms, for near-match scoring

  content       text NOT NULL,                 -- the generated document being reused
  provider      text,
  model         text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

-- Exact-match lookup: the single most common and safest hit.
CREATE INDEX IF NOT EXISTS idx_ai_cache_exact
  ON ai_cache (user_id, module, salt, prompt_hash);

-- Near-match candidate scan, newest first.
CREATE INDEX IF NOT EXISTS idx_ai_cache_scan
  ON ai_cache (user_id, module, salt, created_at DESC);

-- Expiry sweep.
CREATE INDEX IF NOT EXISTS idx_ai_cache_expiry
  ON ai_cache (expires_at);

-- RLS: a user may read only their own cached results. Writes are server-side via the
-- service-role client, so no INSERT policy is granted to users.
ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ai_cache_own_read ON ai_cache;
CREATE POLICY p_ai_cache_own_read
  ON ai_cache FOR SELECT
  USING (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- CHECKING IT WORKS — run after a few PMI/Synergy generations.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Is anything being cached at all?
--
-- SELECT module, count(*) AS entries, min(created_at) AS oldest, max(created_at) AS newest
-- FROM ai_cache GROUP BY module;

-- 2) THE HEADLINE: hit rate. Before Phase 7C this was 0%.
--    Generate the same PMI or Synergy twice with unchanged inputs — the second should
--    be a cache_hit.
--
-- SELECT module,
--        count(*) FILTER (WHERE decision = 'cache_hit')  AS hits,
--        count(*) FILTER (WHERE decision = 'cache_miss') AS misses,
--        round(100.0 * count(*) FILTER (WHERE decision = 'cache_hit')
--              / NULLIF(count(*) FILTER (WHERE decision IN ('cache_hit','cache_miss')),0), 1) AS hit_rate_pct
-- FROM ai_telemetry
-- WHERE operation = 'semantic_cache' AND created_at > now() - interval '14 days'
-- GROUP BY module;

-- 3) How much space the cache is using (free tier is 500 MB).
--
-- SELECT pg_size_pretty(pg_total_relation_size('ai_cache')) AS cache_size;


-- ─────────────────────────────────────────────────────────────────────────────
-- RETENTION — expired rows are swept automatically on each write. This is only a
-- manual catch-up, safe to run any time.
-- ─────────────────────────────────────────────────────────────────────────────
-- DELETE FROM ai_cache WHERE expires_at < now();
