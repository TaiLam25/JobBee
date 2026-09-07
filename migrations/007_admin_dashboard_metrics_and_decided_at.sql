-- Migration: 007_admin_dashboard_metrics_and_decided_at.sql
-- Description: Add decided_at to employer and job_posting, and source to complaint_report

BEGIN;

-- 1. Add decided_at to employer
DO 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'employer' AND column_name = 'decided_at'
    ) THEN
        ALTER TABLE employer ADD COLUMN decided_at TIMESTAMPTZ NULL;
    END IF;
END ;

-- 2. Add decided_at to job_posting
DO 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'job_posting' AND column_name = 'decided_at'
    ) THEN
        ALTER TABLE job_posting ADD COLUMN decided_at TIMESTAMPTZ NULL;
    END IF;
END ;

-- 3. Add source column to complaint_report if not exists
DO 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'complaint_report' AND column_name = 'source'
    ) THEN
        ALTER TABLE complaint_report ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'user_reported';
        ALTER TABLE complaint_report ADD CONSTRAINT chk_complaint_source CHECK (source IN ('user_reported', 'system_auto'));
    END IF;
END ;

-- 4. Backfill decided_at for existing records
UPDATE employer
SET decided_at = CURRENT_TIMESTAMP
WHERE verification_status IN ('verified', 'rejected') AND decided_at IS NULL;

UPDATE job_posting
SET decided_at = posted_date
WHERE approval_status IN ('approved', 'rejected', 'hidden') AND decided_at IS NULL;

COMMIT;