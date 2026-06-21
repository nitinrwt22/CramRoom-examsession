-- =============================================================
-- CramRoom: PYQ Intelligence V2 Schema Migration
-- Creates all new V2 tables.
-- Existing tables (users, sessions, participants, messages,
-- files, session_files, session_ai_chunks, session_ai_messages,
-- session_topic_progress) are NOT modified or dropped here.
-- Run: ts-node scripts/runMigrationV2.ts
-- =============================================================

BEGIN;

-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- 1. papers
-- Stores metadata for uploaded PYQ exam papers (PDFs).
-- References sessions(id) and users(id) as INTEGER (keeping
-- backward-compatible FK types that match existing tables).
-- =============================================================
CREATE TABLE IF NOT EXISTS papers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    title         VARCHAR(255) NOT NULL,
    year          INTEGER NOT NULL,
    exam_type     VARCHAR(50) NOT NULL
                  CHECK (exam_type IN ('midsem', 'endsem', 'quiz')),
    pdf_url       TEXT NOT NULL,
    status        VARCHAR(50) NOT NULL DEFAULT 'uploaded'
                  CHECK (status IN ('uploaded', 'processing', 'ready', 'failed')),
    uploaded_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    uploaded_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 2. syllabi
-- Stores metadata for uploaded syllabus documents per session.
-- raw_text holds the full extracted text so services can work
-- without hitting disk/Firebase again during topic extraction.
-- =============================================================
CREATE TABLE IF NOT EXISTS syllabi (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    file_name     VARCHAR(255) NOT NULL,
    file_url      TEXT NOT NULL,
    raw_text      TEXT NOT NULL,
    uploaded_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    uploaded_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 3. topics
-- Stores individual topics extracted from a syllabus.
-- Cascades from syllabi so deleting a syllabus clears its topics.
-- =============================================================
CREATE TABLE IF NOT EXISTS topics (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    syllabus_id   UUID NOT NULL REFERENCES syllabi(id) ON DELETE CASCADE,
    name          VARCHAR(255) NOT NULL,
    subtopics     TEXT[] DEFAULT '{}',
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 4. canonical_questions
-- The grouping entity. Many raw question phrasings map to one
-- canonical question which represents the underlying concept.
-- Must be created BEFORE raw_questions (which references it).
-- =============================================================
CREATE TABLE IF NOT EXISTS canonical_questions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id      UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    text          TEXT NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 5. raw_questions
-- Verbatim question text extracted from exam papers.
-- original_text is immutable — corrections go in corrected_text.
-- topic_id and canonical_id start NULL and are filled by the
-- TOPIC_MAPPING / CANONICAL_GROUPING jobs.
-- =============================================================
CREATE TABLE IF NOT EXISTS raw_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id        UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    original_text   TEXT NOT NULL,
    corrected_text  TEXT,
    marks           INTEGER,
    page_number     INTEGER,
    topic_id        UUID REFERENCES topics(id) ON DELETE SET NULL,
    canonical_id    UUID REFERENCES canonical_questions(id) ON DELETE SET NULL
);

-- =============================================================
-- 6. question_variants
-- Explicit join table between canonical_questions and the raw
-- questions that represent the same concept.
-- Unique constraint prevents duplicate links.
-- =============================================================
CREATE TABLE IF NOT EXISTS question_variants (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_question_id UUID NOT NULL REFERENCES canonical_questions(id) ON DELETE CASCADE,
    raw_question_id       UUID NOT NULL REFERENCES raw_questions(id) ON DELETE CASCADE,
    created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT question_variants_unique UNIQUE (canonical_question_id, raw_question_id)
);

-- =============================================================
-- 7. generated_answers
-- Caches LLM-generated answers.
-- Cache key: (canonical_question_id, marks, notes_version_hash)
-- The unique constraint ensures one cached answer per combination,
-- preventing redundant LLM calls.
-- =============================================================
CREATE TABLE IF NOT EXISTS generated_answers (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_question_id UUID NOT NULL REFERENCES canonical_questions(id) ON DELETE CASCADE,
    marks                 INTEGER NOT NULL,
    notes_version_hash    VARCHAR(64) NOT NULL,
    exam_focused_answer   TEXT NOT NULL,
    flowchart_suggestion  TEXT,
    important_points      TEXT,
    revision_summary      TEXT,
    created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT generated_answers_cache_key UNIQUE (canonical_question_id, marks, notes_version_hash)
);

-- =============================================================
-- 8. personal_notes
-- Student-typed study notes per session/user pair.
-- One row per student per session (upserted by the notes service).
-- =============================================================
CREATE TABLE IF NOT EXISTS personal_notes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content       TEXT NOT NULL DEFAULT '',
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT personal_notes_unique UNIQUE (session_id, user_id)
);

-- =============================================================
-- 9. uploaded_notes
-- Uploaded reference material (class notes, slides) per session.
-- Separate from papers — these are study aids, not exam papers.
-- =============================================================
CREATE TABLE IF NOT EXISTS uploaded_notes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    title         VARCHAR(255) NOT NULL,
    pdf_url       TEXT NOT NULL,
    uploaded_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    uploaded_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 10. topic_analytics
-- Pre-computed analytics per topic per session.
-- Rebuilt by ANALYTICS_REBUILD job — never updated incrementally.
-- One row per (topic_id, session_id) combination.
-- =============================================================
CREATE TABLE IF NOT EXISTS topic_analytics (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id              UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    session_id            INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    appearance_frequency  INTEGER NOT NULL DEFAULT 0,
    years_appeared        INTEGER[] NOT NULL DEFAULT '{}',
    common_marks          INTEGER,
    priority_score        NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    priority_label        VARCHAR(20) NOT NULL DEFAULT 'Low'
                          CHECK (priority_label IN ('Very High', 'High', 'Medium', 'Low')),
    syllabus_coverage_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    recency_index         NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    last_rebuilt_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT topic_analytics_unique UNIQUE (topic_id, session_id)
);

-- =============================================================
-- 11. question_analytics
-- Pre-computed analytics per canonical question.
-- One row per canonical question (scoped through topic → session).
-- marks_distribution: JSONB map, e.g. {"5": 3, "10": 1}
-- =============================================================
CREATE TABLE IF NOT EXISTS question_analytics (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_question_id UUID NOT NULL REFERENCES canonical_questions(id) ON DELETE CASCADE,
    appearance_frequency  INTEGER NOT NULL DEFAULT 0,
    years_appeared        INTEGER[] NOT NULL DEFAULT '{}',
    marks_distribution    JSONB NOT NULL DEFAULT '{}',
    priority_label        VARCHAR(20) NOT NULL DEFAULT 'Low'
                          CHECK (priority_label IN ('Very High', 'High', 'Medium', 'Low')),
    recency_index         NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    last_rebuilt_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT question_analytics_unique UNIQUE (canonical_question_id)
);

-- =============================================================
-- 12. ai_suggested_questions
-- AI-generated study suggestions per topic.
-- Stored after analytics rebuild — not regenerated per page load.
-- =============================================================
CREATE TABLE IF NOT EXISTS ai_suggested_questions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id       UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    question_text  TEXT NOT NULL,
    reason         TEXT NOT NULL,
    priority_label VARCHAR(20) NOT NULL DEFAULT 'Medium'
                   CHECK (priority_label IN ('High', 'Medium', 'Low')),
    created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 13. jobs
-- Background job queue.
-- Workers poll this table for queued jobs, update status,
-- and log errors. retry_count caps at 3 before marking failed.
-- =============================================================
CREATE TABLE IF NOT EXISTS jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    job_type      VARCHAR(50) NOT NULL
                  CHECK (job_type IN (
                      'UPLOAD_PROCESSING',
                      'SYLLABUS_PROCESSING',
                      'TOPIC_MAPPING',
                      'CANONICAL_GROUPING',
                      'ANALYTICS_REBUILD',
                      'ANSWER_GENERATION',
                      'AI_SUGGESTED_GENERATION'
                  )),
    status        VARCHAR(20) NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    payload       JSONB,
    error_message TEXT,
    retry_count   INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =============================================================
-- INDEXES
-- Added only for columns used in real production queries.
-- See DATABASE_V2_DESIGN.md Section 6: Index Strategy.
-- =============================================================

-- papers
CREATE INDEX IF NOT EXISTS idx_papers_session_id
    ON papers(session_id);

-- syllabi
CREATE INDEX IF NOT EXISTS idx_syllabi_session_id
    ON syllabi(session_id);

-- topics
CREATE INDEX IF NOT EXISTS idx_topics_syllabus_id
    ON topics(syllabus_id);

-- raw_questions
CREATE INDEX IF NOT EXISTS idx_raw_questions_paper_id
    ON raw_questions(paper_id);

CREATE INDEX IF NOT EXISTS idx_raw_questions_topic_id
    ON raw_questions(topic_id)
    WHERE topic_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_raw_questions_canonical_id
    ON raw_questions(canonical_id)
    WHERE canonical_id IS NOT NULL;

-- canonical_questions
CREATE INDEX IF NOT EXISTS idx_canonical_questions_topic_id
    ON canonical_questions(topic_id);

-- question_variants
CREATE INDEX IF NOT EXISTS idx_question_variants_canonical_id
    ON question_variants(canonical_question_id);

-- generated_answers — the unique constraint already acts as an index

-- personal_notes — the unique constraint already acts as an index

-- uploaded_notes
CREATE INDEX IF NOT EXISTS idx_uploaded_notes_session_id
    ON uploaded_notes(session_id);

-- topic_analytics
CREATE INDEX IF NOT EXISTS idx_topic_analytics_session_priority
    ON topic_analytics(session_id, priority_score DESC);

-- question_analytics — the unique constraint already acts as an index

-- ai_suggested_questions
CREATE INDEX IF NOT EXISTS idx_ai_suggested_questions_topic_id
    ON ai_suggested_questions(topic_id);

-- jobs
CREATE INDEX IF NOT EXISTS idx_jobs_session_status
    ON jobs(session_id, status);

CREATE INDEX IF NOT EXISTS idx_jobs_status_created
    ON jobs(status, created_at)
    WHERE status = 'queued';

COMMIT;
