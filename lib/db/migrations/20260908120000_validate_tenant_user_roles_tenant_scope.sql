-- W00 / R-002: the read-only Phase 2E readiness check proves that historical
-- tenant-role assignments satisfy both tenant-scoped foreign keys before this
-- forward-only validation migration is allowed to run.

SET LOCAL lock_timeout = '30s';

ALTER TABLE public.tenant_user_roles
  VALIDATE CONSTRAINT tenant_user_roles_tenant_role_scope_fk;

ALTER TABLE public.tenant_user_roles
  VALIDATE CONSTRAINT tenant_user_roles_tenant_membership_fk;

COMMENT ON CONSTRAINT tenant_user_roles_tenant_role_scope_fk
  ON public.tenant_user_roles IS
  'Validated after the Phase 2E tenant-role mismatch readiness proof; enforces tenant-scoped role ownership.';

COMMENT ON CONSTRAINT tenant_user_roles_tenant_membership_fk
  ON public.tenant_user_roles IS
  'Validated after the Phase 2E membership mismatch readiness proof; enforces same-tenant membership.';
