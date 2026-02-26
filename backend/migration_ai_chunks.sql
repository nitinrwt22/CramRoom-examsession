-- Ensure pgcrypto extension exists for UUID functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Add is_chunked column to session_ai_messages
ALTER TABLE session_ai_messages 
ADD COLUMN IF NOT EXISTS is_chunked BOOLEAN DEFAULT false;

-- Create session_ai_chunks table
CREATE TABLE IF NOT EXISTS session_ai_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    start_index INTEGER NOT NULL,
    end_index INTEGER NOT NULL,
    summary_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
