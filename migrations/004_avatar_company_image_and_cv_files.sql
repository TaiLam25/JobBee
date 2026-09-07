-- Migration: 004_avatar_company_image_and_cv_files.sql
-- Description: Add company_image_url to employer and expand avatar/file URL columns

BEGIN;

ALTER TABLE employer 
ADD COLUMN IF NOT EXISTS company_image_url VARCHAR(500) NULL;

-- Ensure avatar_url length in candidate_profile and employer
ALTER TABLE candidate_profile 
ALTER COLUMN avatar_url TYPE VARCHAR(500);

ALTER TABLE employer 
ALTER COLUMN avatar_url TYPE VARCHAR(500);

ALTER TABLE cv_version 
ALTER COLUMN attachment_file TYPE VARCHAR(500);

COMMIT;
