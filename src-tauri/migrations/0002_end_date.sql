-- Add an optional employment end date (when a role/engagement ended).
ALTER TABLE job_applications ADD COLUMN end_date TEXT;
