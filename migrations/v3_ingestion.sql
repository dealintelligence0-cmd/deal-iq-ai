

-- =====================================================================
-- Deal IQ AI — Ingestion v2 schema migration
-- =====================================================================
-- Adds the new backend ingestion + canonical layer per the v2 specification:
--
--   raw_feed_records         every uploaded row preserved verbatim
--   import_batches           batch history (rollback / reprocess)
--   canonical_deals          clean post-extraction records
--   digest_records           multi-deal articles (separate lane)
--   resolution_tasks         doubtful rows requiring human review
--   correction_examples      human corrections for few-shot AI reuse
--
-- The existing `deals` table is preserved unchanged. A trigger keeps `deals`
-- in sync with `canonical_deals` so existing downstream modules continue
-- working without code changes.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------
-- 1. import_batches — one row per upload run
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_batches (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by        uuid NOT NULL,
  source_file       text NOT NULL,
  total_rows        integer NOT NULL DEFAULT 0,
  canonical_rows    integer NOT NULL DEFAULT 0,
  digest_rows       integer NOT NULL DEFAULT 0,
  resolution_rows   integer NOT NULL DEFAULT 0,
  blank_rows        integer NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'pending',  -- pending|processing|completed|failed
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_import_batches_user_created
  ON import_batches (created_by, created_at DESC);

-- ----------------------------------------------------------------------
-- 2. raw_feed_records — verbatim preservation of every uploaded row
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_feed_records (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id          uuid NOT NULL REFERENCES import_batches(id) ON DELETE RESTRICT,
  created_by        uuid NOT NULL,
  source_file       text NOT NULL,
  source_row_number integer NOT NULL,
  raw_json          jsonb NOT NULL,        -- the full original row as uploaded
  raw_heading       text,                  -- shortcut for the Heading column
  raw_opportunity   text,
  raw_bidders       text,
  raw_targets       text,
  raw_vendors       text,
  raw_issuers       text,
  raw_intel_type    text,
  raw_intel_size    text,
  raw_intel_grade   text,
  raw_stake_value   text,
  raw_sector        text,
  raw_geography     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_raw_feed_batch ON raw_feed_records (batch_id);
CREATE INDEX IF NOT EXISTS idx_raw_feed_heading_trgm
  ON raw_feed_records USING gin (lower(raw_heading) gin_trgm_ops);

-- ----------------------------------------------------------------------
-- 3. canonical_deals — clean post-extraction records
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canonical_deals (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_row_id         uuid NOT NULL REFERENCES raw_feed_records(id) ON DELETE RESTRICT,
  batch_id              uuid NOT NULL REFERENCES import_batches(id) ON DELETE RESTRICT,
  created_by            uuid NOT NULL,

  -- Canonical fields (per spec)
  heading               text NOT NULL,
  buyer                 text,
  target                text,
  vendor                text,
  dominant_sector       text,
  dominant_geography    text,
  intelligence_size     text,
  intelligence_grade    text,
  stake_value           text,
  deal_type             text,
  deal_status           text,

  -- Confidence + audit
  parse_confidence      numeric NOT NULL DEFAULT 0,
  parse_path            text NOT NULL DEFAULT '',
  needs_review          boolean NOT NULL DEFAULT false,
  is_digest             boolean NOT NULL DEFAULT false,
  evidence_json         jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Lifecycle
  deal_date             date,
  superseded_by         uuid REFERENCES canonical_deals(id),  -- set when reprocessed
  superseded_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source_row_id, superseded_by)    -- only one live canonical per raw row
);
CREATE INDEX IF NOT EXISTS idx_canonical_buyer    ON canonical_deals (lower(buyer));
CREATE INDEX IF NOT EXISTS idx_canonical_target   ON canonical_deals (lower(target));
CREATE INDEX IF NOT EXISTS idx_canonical_batch    ON canonical_deals (batch_id);
CREATE INDEX IF NOT EXISTS idx_canonical_live     ON canonical_deals (id) WHERE superseded_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_canonical_review   ON canonical_deals (needs_review) WHERE superseded_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_canonical_heading_trgm
  ON canonical_deals USING gin (lower(heading) gin_trgm_ops);

-- ----------------------------------------------------------------------
-- 4. digest_records — multi-deal articles, separate lane
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS digest_records (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_row_id     uuid NOT NULL REFERENCES raw_feed_records(id) ON DELETE RESTRICT,
  batch_id          uuid NOT NULL REFERENCES import_batches(id) ON DELETE RESTRICT,
  created_by        uuid NOT NULL,
  heading           text NOT NULL,
  opportunity       text,
  topics            text,
  intelligence_type text,
  sector            text,
  geography         text,
  digest_reason     text,                  -- which keyword triggered the digest classification
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_digest_batch     ON digest_records (batch_id);
CREATE INDEX IF NOT EXISTS idx_digest_heading_trgm
  ON digest_records USING gin (lower(heading) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_digest_opp_trgm
  ON digest_records USING gin (lower(opportunity) gin_trgm_ops);

-- ----------------------------------------------------------------------
-- 5. resolution_tasks — doubtful rows for human review
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resolution_tasks (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_row_id       uuid NOT NULL REFERENCES raw_feed_records(id) ON DELETE RESTRICT,
  batch_id            uuid NOT NULL REFERENCES import_batches(id) ON DELETE RESTRICT,
  canonical_deal_id   uuid REFERENCES canonical_deals(id) ON DELETE SET NULL,
  created_by          uuid NOT NULL,

  -- Snapshot of input + best-guess extraction
  heading             text NOT NULL,
  opportunity         text,
  raw_bidders         text,
  raw_targets         text,
  raw_vendors         text,
  raw_intel_type      text,
  raw_intel_size      text,
  raw_intel_grade     text,

  -- AI / deterministic suggestions
  ai_suggestions      jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_confidence    jsonb NOT NULL DEFAULT '{}'::jsonb,
  uncertainty_reasons text[] NOT NULL DEFAULT '{}',

  -- Resolution state
  status              text NOT NULL DEFAULT 'open',  -- open|resolved|dismissed
  resolved_by         uuid,
  resolved_at         timestamptz,
  resolution_payload  jsonb,                          -- what the human entered

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resolution_open  ON resolution_tasks (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resolution_user  ON resolution_tasks (created_by, status, created_at DESC);

-- ----------------------------------------------------------------------
-- 6. correction_examples — human corrections for few-shot AI reuse
-- ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS correction_examples (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_row_id       uuid REFERENCES raw_feed_records(id) ON DELETE SET NULL,
  resolution_task_id  uuid REFERENCES resolution_tasks(id) ON DELETE SET NULL,
  created_by          uuid NOT NULL,

  -- Input snapshot
  heading             text NOT NULL,
  opportunity         text,
  structured_fields   jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- The wrong AI / deterministic suggestion (for contrastive learning)
  bad_extraction      jsonb,

  -- The correct values (what the human entered)
  good_extraction     jsonb NOT NULL,

  -- For retrieval similarity
  intent_tags         text[] NOT NULL DEFAULT '{}',   -- e.g. {"asset_sale","ipo","fundraise","cross_border"}

  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_correction_recent ON correction_examples (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_correction_tags   ON correction_examples USING gin (intent_tags);
CREATE INDEX IF NOT EXISTS idx_correction_heading_trgm
  ON correction_examples USING gin (lower(heading) gin_trgm_ops);

-- ----------------------------------------------------------------------
-- 7. Bridge: keep the legacy `deals` table in sync with canonical_deals
-- ----------------------------------------------------------------------
-- The existing deal pipeline / proposal / PMI / TSA / synergy modules read
-- from `deals`. They are out-of-scope to modify. We keep `deals` populated
-- by mirroring inserts/updates from `canonical_deals` via a trigger so the
-- downstream modules continue working unchanged on clean canonical data.

-- Make sure the legacy table has the columns the bridge needs.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS canonical_id     uuid;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS source_row_id    uuid;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS heading          text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS parse_confidence numeric;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS parse_pattern    text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS is_digest        boolean DEFAULT false;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS needs_review     boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_deals_canonical_id ON deals (canonical_id);

-- Bridge function: mirror a live canonical_deals row into `deals`.
CREATE OR REPLACE FUNCTION mirror_canonical_to_deals() RETURNS trigger AS $$
BEGIN
  -- Only mirror live (non-superseded) canonical rows that are NOT digests
  -- and NOT marked needs_review. Doubtful rows stay in resolution_tasks
  -- and don't reach the downstream pipeline until corrected.
  IF NEW.superseded_by IS NOT NULL OR NEW.is_digest = true OR NEW.needs_review = true THEN
    -- Remove any previously-mirrored row for this canonical record
    DELETE FROM deals WHERE canonical_id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO deals (
    canonical_id, source_row_id, created_by, source_file,
    deal_date, heading, buyer, target,
    sector, country, deal_type, status,
    stake_percent, value_raw,
    parse_confidence, parse_pattern, is_digest, needs_review,
    notes
  )
  SELECT
    NEW.id, NEW.source_row_id, NEW.created_by,
    (SELECT source_file FROM raw_feed_records WHERE id = NEW.source_row_id),
    NEW.deal_date, NEW.heading, NEW.buyer, NEW.target,
    NEW.dominant_sector, NEW.dominant_geography, NEW.deal_type,
    COALESCE(NEW.deal_status, 'announced'),
    CASE WHEN NEW.stake_value ~ '^[0-9]+(\.[0-9]+)?$'
         THEN NEW.stake_value::numeric ELSE NULL END,
    NEW.intelligence_size,
    NEW.parse_confidence, NEW.parse_path, NEW.is_digest, NEW.needs_review,
    (SELECT raw_opportunity FROM raw_feed_records WHERE id = NEW.source_row_id)
  ON CONFLICT (canonical_id) DO UPDATE SET
    heading          = EXCLUDED.heading,
    buyer            = EXCLUDED.buyer,
    target           = EXCLUDED.target,
    sector           = EXCLUDED.sector,
    country          = EXCLUDED.country,
    deal_type        = EXCLUDED.deal_type,
    status           = EXCLUDED.status,
    stake_percent    = EXCLUDED.stake_percent,
    value_raw        = EXCLUDED.value_raw,
    parse_confidence = EXCLUDED.parse_confidence,
    parse_pattern    = EXCLUDED.parse_pattern,
    needs_review     = EXCLUDED.needs_review,
    is_digest        = EXCLUDED.is_digest,
    notes            = EXCLUDED.notes;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ON CONFLICT needs a unique index on canonical_id
CREATE UNIQUE INDEX IF NOT EXISTS uniq_deals_canonical_id ON deals (canonical_id) WHERE canonical_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_canonical_to_deals ON canonical_deals;
CREATE TRIGGER trg_canonical_to_deals
  AFTER INSERT OR UPDATE ON canonical_deals
  FOR EACH ROW EXECUTE FUNCTION mirror_canonical_to_deals();

-- ----------------------------------------------------------------------
-- 8. updated_at maintenance
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_canonical_touch ON canonical_deals;
CREATE TRIGGER trg_canonical_touch
  BEFORE UPDATE ON canonical_deals
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_resolution_touch ON resolution_tasks;
CREATE TRIGGER trg_resolution_touch
  BEFORE UPDATE ON resolution_tasks
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ----------------------------------------------------------------------
-- 9. RLS
-- ----------------------------------------------------------------------
ALTER TABLE import_batches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_feed_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_deals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_records      ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolution_tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_examples ENABLE ROW LEVEL SECURITY;

-- Per-user isolation policies
DO $$ BEGIN
  CREATE POLICY p_batches_own        ON import_batches      FOR ALL USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY p_raw_own            ON raw_feed_records    FOR ALL USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY p_canonical_own      ON canonical_deals     FOR ALL USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY p_digest_own         ON digest_records      FOR ALL USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY p_resolution_own     ON resolution_tasks    FOR ALL USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY p_corrections_shared ON correction_examples FOR ALL USING (true) WITH CHECK (created_by = auth.uid());
  -- Corrections are shared read across the user pool so few-shot examples
  -- benefit everyone, but only the author can insert/update their own.
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------
-- 10. Helper RPC for migration-status endpoint
-- ----------------------------------------------------------------------
-- Lets the GET /api/ingestion/migration-status route check whether
-- pg_trgm is installed without needing direct catalog access.
CREATE OR REPLACE FUNCTION ingestion_check_pg_trgm() RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm');
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION ingestion_check_pg_trgm() TO authenticated, anon;
