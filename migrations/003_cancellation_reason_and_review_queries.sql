-- Migration: 003_cancellation_reason_and_review_queries.sql
-- Description: Add cancellation_reason to small_job_registration and create helpful index

BEGIN;

ALTER TABLE small_job_registration 
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_review_registration 
ON review(small_job_registration_id);

CREATE INDEX IF NOT EXISTS idx_review_reviewer 
ON review(reviewer_id);

CREATE INDEX IF NOT EXISTS idx_review_reviewee 
ON review(reviewee_id);

COMMIT;
