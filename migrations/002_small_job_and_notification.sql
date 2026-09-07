-- Migration: 002_small_job_and_notification.sql
-- Description: Add metadata to notification and is_closed to small_job_posting

BEGIN;

ALTER TABLE notification 
ADD COLUMN IF NOT EXISTS metadata JSONB NULL;

ALTER TABLE small_job_posting 
ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
