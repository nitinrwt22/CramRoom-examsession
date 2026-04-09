-- Add JSONB reactions column to messages
ALTER TABLE messages
ADD COLUMN reactions JSONB DEFAULT '{}'::jsonb;
