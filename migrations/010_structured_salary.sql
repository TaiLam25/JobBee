-- ============================================================================
-- Migration: 010_structured_salary.sql
-- Description: Thêm 3 cột salary_min, salary_max, is_negotiable vào job_posting
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'job_posting' AND column_name = 'salary_min'
    ) THEN
        ALTER TABLE job_posting ADD COLUMN salary_min INT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'job_posting' AND column_name = 'salary_max'
    ) THEN
        ALTER TABLE job_posting ADD COLUMN salary_max INT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'job_posting' AND column_name = 'is_negotiable'
    ) THEN
        ALTER TABLE job_posting ADD COLUMN is_negotiable BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_job_posting_salary_range ON job_posting(salary_min, salary_max);
CREATE INDEX IF NOT EXISTS idx_job_posting_is_negotiable ON job_posting(is_negotiable);
