-- Add missing attachments column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachments JSONB;
