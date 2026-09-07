-- Migration 008: Drop ComplaintReport table and associated types
-- Reason: Proactively removed feature because there is no user-facing UI to create reports.

DROP TABLE IF EXISTS complaint_report CASCADE;
DROP TYPE IF EXISTS complaint_processing_status CASCADE;
