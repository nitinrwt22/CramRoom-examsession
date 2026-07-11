-- Phase 4: API & Integration Layer
-- Adds mapping_confidence to raw_questions.
--
-- mapping_confidence (NUMERIC 0.000 – 1.000):
--   Stores the heuristic or AI-derived confidence that a raw question was
--   correctly mapped to its assigned topic.  Computed during UPLOAD_PROCESSING
--   by the background job worker using keyword-overlap ratio.
--
--   Formula (heuristic):
--     matching_keywords / total_question_keywords
--   clamped to [0.000, 1.000] and rounded to 3 decimal places.
--
--   Values below 0.500 are flagged for manual review per TOPIC_SYSTEM_V2_DESIGN §9.
--
-- Safe to run multiple times (IF NOT EXISTS guard).

ALTER TABLE raw_questions
    ADD COLUMN IF NOT EXISTS mapping_confidence NUMERIC(4,3) DEFAULT 0.000;

-- Update existing rows that have a topic_id already to a default heuristic value
-- of 0.500 (uncertain but assumed mapped) so they are not confused with truly
-- un-mapped rows (which will remain at 0.000 until reprocessed).
UPDATE raw_questions
SET    mapping_confidence = 0.500
WHERE  topic_id IS NOT NULL
  AND  mapping_confidence = 0.000;
