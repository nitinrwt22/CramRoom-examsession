-- =============================================================
-- CramRoom: V2 Legacy Cleanup Migration
-- Executes AFTER all code has been deployed to V2-only paths.
--
-- What this script does:
--  1. Creates topic_progress_history (V2 replacement for session_topic_progress)
--  2. Migrates existing progress data (best-effort by topic name match)
--  3. Drops participants VIEW
--  4. Drops migration_file_uuid_map TABLE
--  5. Drops V1 columns from session_ai_chunks
--  6. Drops session_topic_progress TABLE
--  7. Drops files TABLE
--
-- Run via: npx ts-node scripts/runCleanup.ts
-- =============================================================

BEGIN;

-- =============================================================
-- 1. Create V2 topic progress history table
--    Replaces session_topic_progress with a UUID-keyed version.
-- =============================================================
CREATE TABLE IF NOT EXISTS topic_progress_history (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    topic_id     UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    score        INTEGER NOT NULL,
    recorded_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topic_progress_history_session
    ON topic_progress_history(session_id, recorded_at DESC);

-- =============================================================
-- 2. Migrate existing session_topic_progress → topic_progress_history
--    Best-effort: matches topic text to topics.name (case-insensitive).
--    Rows that cannot be matched are intentionally skipped.
-- =============================================================
INSERT INTO topic_progress_history (session_id, topic_id, score, recorded_at)
SELECT
    stp.session_id,
    t.id AS topic_id,
    stp.score,
    stp.recorded_at
FROM session_topic_progress stp
JOIN syllabi s  ON s.session_id = stp.session_id
JOIN topics  t  ON t.syllabus_id = s.id AND LOWER(t.name) = LOWER(stp.topic)
ON CONFLICT DO NOTHING;

-- =============================================================
-- 3. Drop participants compatibility VIEW
--    All application SQL now targets session_members directly.
-- =============================================================
DROP VIEW IF EXISTS participants;

-- =============================================================
-- 4. Drop migration_file_uuid_map TABLE
--    No longer referenced by any code path.
-- =============================================================
DROP TABLE IF EXISTS migration_file_uuid_map;

-- =============================================================
-- 5. Prune V1 knowledge-chunking columns from session_ai_chunks
--    Only rows where file_id IS NOT NULL were V1 document chunks.
--    The table itself is preserved for the chat summariser.
-- =============================================================

-- Drop the index that references file_id first
DROP INDEX IF EXISTS idx_session_ai_chunks_file_id;

-- Delete V1 document chunk rows before dropping their columns
DELETE FROM session_ai_chunks WHERE file_id IS NOT NULL;

-- Drop the three V1 columns
ALTER TABLE session_ai_chunks
    DROP COLUMN IF EXISTS file_id,
    DROP COLUMN IF EXISTS topic,
    DROP COLUMN IF EXISTS chunk_text;

-- =============================================================
-- 6. Drop legacy session_topic_progress TABLE
-- =============================================================
DROP TABLE IF EXISTS session_topic_progress;

-- =============================================================
-- 7. Drop legacy files TABLE
--    All data already lives in papers / syllabi / uploaded_notes.
-- =============================================================
DROP TABLE IF EXISTS files;

COMMIT;
