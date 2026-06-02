-- ============================================================
-- Migration 020: Add is_approved flag to assignment_photos
-- Run manually via Supabase SQL Editor
--
-- This flag allows management (backoffice) to mark individual
-- photos as approved for customer visibility.
-- Defaults to false — photos are private until explicitly approved.
-- ============================================================

ALTER TABLE assignment_photos
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── RLS update: customers may read approved photos ─────────

DROP POLICY IF EXISTS "customer_read_approved_photos" ON assignment_photos;

CREATE POLICY "customer_read_approved_photos" ON assignment_photos
  FOR SELECT TO authenticated
  USING (
    is_approved = TRUE
    AND EXISTS (
      SELECT 1
        FROM assignments a
        JOIN customers c ON c.id = a.customer_id
       WHERE a.id             = assignment_photos.assignment_id
         AND c.contact_email  = auth.email()
    )
  );
