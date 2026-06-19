-- Personnel PWA work-order execution metadata.
--
-- These fields keep the planned schedule intact while recording what happened
-- in the field: first seen, actual start, completion/not-completion, and
-- optional customer signature capture.

ALTER TABLE assignments ADD COLUMN IF NOT EXISTS seen_at timestamptz;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS actual_started_at timestamptz;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS actual_completed_at timestamptz;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS completion_reason varchar(160);
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS completion_notes text;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS customer_signature_required boolean DEFAULT false NOT NULL;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS customer_signature_data_url text;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS customer_signed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_assignments_seen_at ON assignments(seen_at);
CREATE INDEX IF NOT EXISTS idx_assignments_actual_started_at ON assignments(actual_started_at);
CREATE INDEX IF NOT EXISTS idx_assignments_actual_completed_at ON assignments(actual_completed_at);
