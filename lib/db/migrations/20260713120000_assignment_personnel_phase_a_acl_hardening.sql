-- Phase A.1: least-privilege ACL hardening.
-- Keep authenticated SELECT temporarily for rollback compatibility.

REVOKE ALL ON TABLE public.assignment_personnel
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.assignment_personnel
TO authenticated;
