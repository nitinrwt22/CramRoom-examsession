-- Ensure pgcrypto extension exists for UUID functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create session_topic_progress table safely
-- NOTE: session_id is INTEGER to match existing sessions table, despite UUID request.
CREATE TABLE IF NOT EXISTS session_topic_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    topic VARCHAR(255) NOT NULL,
    score INTEGER NOT NULL,
    recorded_at TIMESTAMP DEFAULT NOW()
);
