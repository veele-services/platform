-- W00 / R-002: prevent new cross-tenant role links and role assignments for
-- users who are not members of the same tenant. Existing rows remain available
-- for explicit staging audit and reconciliation before later validation.

CREATE UNIQUE INDEX IF NOT EXISTS tenant_roles_tenant_id_idx
  ON public.tenant_roles (tenant_id, id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenant_user_roles_tenant_role_scope_fk'
      AND conrelid = 'public.tenant_user_roles'::regclass
  ) THEN
    ALTER TABLE public.tenant_user_roles
      ADD CONSTRAINT tenant_user_roles_tenant_role_scope_fk
      FOREIGN KEY (tenant_id, tenant_role_id)
      REFERENCES public.tenant_roles (tenant_id, id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenant_user_roles_tenant_membership_fk'
      AND conrelid = 'public.tenant_user_roles'::regclass
  ) THEN
    ALTER TABLE public.tenant_user_roles
      ADD CONSTRAINT tenant_user_roles_tenant_membership_fk
      FOREIGN KEY (tenant_id, user_id)
      REFERENCES public.tenant_users (tenant_id, user_id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END
$$;

COMMENT ON CONSTRAINT tenant_user_roles_tenant_role_scope_fk
  ON public.tenant_user_roles IS
  'NOT VALID until the Fieldflow W10 staging mismatch audit has reconciled historical rows; enforced for all new writes.';

COMMENT ON CONSTRAINT tenant_user_roles_tenant_membership_fk
  ON public.tenant_user_roles IS
  'NOT VALID until the Fieldflow W10 staging membership audit has reconciled historical rows; enforced for all new writes.';
