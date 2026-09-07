-- Migration: 006_add_logo_url_to_employer.sql
BEGIN;
ALTER TABLE employer ADD COLUMN IF NOT EXISTS logo_url TEXT;
COMMIT;
