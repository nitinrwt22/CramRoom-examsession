-- ============================================================
-- CramRoom V2: topic_progress_history migration
-- Creates the V2 weak-topic snapshot table.
-- This replaces the legacy session_topic_progress table.
-- Run before starting Phase 2 services.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS topic_progress_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    topic_id    UUID    NOT NULL REFERENCES topics(id)   ON DELETE CASCADE,
    score       NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for efficient per-session, per-topic lookups (used by progress trend service)
CREATE INDEX IF NOT EXISTS idx_tph_session_topic
    ON topic_progress_history(session_id, topic_id, recorded_at DESC);

COMMIT;
