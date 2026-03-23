-- ============================================================
-- CramRoom: Content Knowledge Integration Migration
-- Extends 'files' and 'session_ai_chunks' tables to support
-- markdown knowledge file ingestion from content/
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. Extend the 'files' table
--    - Make session_id and uploaded_by nullable so that
--      knowledge files (not session-scoped) can be inserted.
--    - Add columns for knowledge file metadata.
-- ============================================================

ALTER TABLE files
    ALTER COLUMN session_id DROP NOT NULL,
    ALTER COLUMN uploaded_by DROP NOT NULL;

ALTER TABLE files
    ADD COLUMN IF NOT EXISTS title       VARCHAR(500),
    ADD COLUMN IF NOT EXISTS topic       VARCHAR(255),
    ADD COLUMN IF NOT EXISTS content_type VARCHAR(50),
    ADD COLUMN IF NOT EXISTS file_path   TEXT;

-- ============================================================
-- 2. Extend the 'session_ai_chunks' table
--    - Add file_id to link a chunk back to its source file.
--    - Add topic for semantic label.
--    - Add chunk_text for raw paragraph content (distinct from
--      summary_text which is used by the AI message compressor).
--    - Make start_index, end_index, summary_text nullable so
--      knowledge chunks don't need to fill AI-summary fields.
-- ============================================================

ALTER TABLE session_ai_chunks
    ADD COLUMN IF NOT EXISTS file_id    INTEGER REFERENCES files(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS topic      VARCHAR(255),
    ADD COLUMN IF NOT EXISTS chunk_text TEXT;

-- Make AI-summary-specific columns nullable to allow knowledge chunk rows
ALTER TABLE session_ai_chunks
    ALTER COLUMN start_index  DROP NOT NULL,
    ALTER COLUMN end_index    DROP NOT NULL,
    ALTER COLUMN summary_text DROP NOT NULL;

-- ============================================================
-- Index for fast per-session knowledge chunk retrieval
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_session_ai_chunks_file_id
    ON session_ai_chunks(session_id, file_id)
    WHERE file_id IS NOT NULL;
