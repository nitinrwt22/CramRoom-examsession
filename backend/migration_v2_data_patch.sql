-- =============================================================
-- CramRoom: V2 Data Migration Schema Patch
-- Adds tracking columns to V2 tables for idempotent migration.
-- Run BEFORE runDataMigration.ts.
--
-- These columns store the source chunk ID from the legacy
-- session_ai_chunks table, allowing the migration to be safely
-- re-run without creating duplicate rows.
-- =============================================================

BEGIN;

-- Add migration tracking column to raw_questions
ALTER TABLE raw_questions
    ADD COLUMN IF NOT EXISTS migrated_from_chunk_id TEXT;

-- Add migration tracking column to topics
ALTER TABLE topics
    ADD COLUMN IF NOT EXISTS migrated_from_chunk_id TEXT;

-- Index for idempotency checks (fast look up by source chunk id)
CREATE INDEX IF NOT EXISTS idx_raw_questions_migrated_from
    ON raw_questions(migrated_from_chunk_id)
    WHERE migrated_from_chunk_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topics_migrated_from
    ON topics(migrated_from_chunk_id)
    WHERE migrated_from_chunk_id IS NOT NULL;

COMMIT;
