-- Migration for adding tags to chat messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
