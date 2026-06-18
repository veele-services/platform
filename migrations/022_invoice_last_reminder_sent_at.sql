-- Migration 022: Add last_reminder_sent_at to invoices for payment-reminder deduplication
-- Run via Supabase SQL Editor (TCP port 5432/6543 unreachable from Replit).

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN invoices.last_reminder_sent_at
  IS 'Set to now() each time a payment reminder e-mail is sent. Used by the cron to prevent duplicate reminders within the configured interval.';
