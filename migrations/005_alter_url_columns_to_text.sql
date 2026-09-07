-- Migration: 005_alter_url_columns_to_text.sql
-- Description: Alter attachment_file, avatar_url, company_image_url to TEXT to prevent 'value too long' errors

BEGIN;

ALTER TABLE cv_version 
ALTER COLUMN attachment_file TYPE TEXT;

ALTER TABLE candidate_profile 
ALTER COLUMN avatar_url TYPE TEXT;

ALTER TABLE employer 
ALTER COLUMN avatar_url TYPE TEXT;

ALTER TABLE employer 
ALTER COLUMN company_image_url TYPE TEXT;

ALTER TABLE employer 
ALTER COLUMN verification_document TYPE TEXT;

COMMIT;
