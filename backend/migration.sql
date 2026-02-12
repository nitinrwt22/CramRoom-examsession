-- Ensure pgcrypto extension exists for UUID functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create session_ai_messages table safely
-- NOTE: session_id and user_id are INTEGER to match existing tables, despite UUID request.
CREATE TABLE IF NOT EXISTS session_ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    intent VARCHAR(100) NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
