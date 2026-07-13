-- Phase A.1: least-privilege ACL hardening.
-- Keep authenticated SELECT temporarily for rollback compatibility.

REVOKE ALL ON TABLE public.assignment_personnel
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.assignment_personnel
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.assignment_personnel
TO service_role;
