-- Migration 014: Add status column to leave_periods
-- Enables personnel to request leave via the PWA (status='pending')
-- while backoffice-created leave defaults to 'approved'.
--
-- Run in Supabase SQL Editor (TCP from Replit is blocked).

ALTER TABLE leave_periods
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'approved';

-- Back-fill: all existing leave periods are considered approved.
-- (DEFAULT 'approved' handles this automatically for existing rows via ADD COLUMN.)

COMMENT ON COLUMN leave_periods.status IS
  'pending = awaiting management approval (PWA requests), approved = accepted, rejected = declined';
