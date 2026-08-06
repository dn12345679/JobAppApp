-- Add whether the pay is an hourly rate (1) vs an annual salary (0, default).
ALTER TABLE job_applications ADD COLUMN hourly INTEGER NOT NULL DEFAULT 0;
