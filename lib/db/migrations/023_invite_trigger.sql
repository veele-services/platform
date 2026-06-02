-- Migration 023: Auto-link personnel record when invite is accepted
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Supabase TCP is unreachable from Replit; all migrations are manual.
--
-- When a user signs up / accepts a magic-link invitation, the trigger
-- checks whether the new auth.users email matches an unlinked personnel
-- record and writes the user_id back automatically.

-- ── Function ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.link_personnel_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Match by email (case-insensitive); only update records that haven't been
  -- linked yet to prevent overwriting an existing user_id.
  UPDATE public.personnel
  SET
    user_id        = NEW.id,
    updated_at     = now()
  WHERE
    lower(email) = lower(NEW.email)
    AND user_id IS NULL;

  RETURN NEW;
END;
$$;

-- ── Trigger ───────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_personnel_on_signup();
