/** Read-only prerequisite shared by domain repair and website proof preparation.
 * Existing membership is authoritative; the bootstrap email is never a selector.
 * Only closed, source-owned expressions are accepted, never operator input.
 */
export function fieldDemoExistingOwnerQuery(
  tenantIdSql: "$1" | "tenant.id" | "target.id",
): string {
  if (!["$1", "tenant.id", "target.id"].includes(tenantIdSql)) {
    throw new Error("Unsupported existing-owner tenant selector");
  }
  return `WITH owner_memberships AS (
    SELECT membership.tenant_id, membership.user_id, membership.status
      FROM public.tenant_users AS membership
     WHERE membership.tenant_id = ${tenantIdSql}
       AND membership.role = 'owner'
  ), eligible_owner AS (
    SELECT membership.tenant_id, membership.user_id
      FROM owner_memberships AS membership
      JOIN auth.users AS owner ON owner.id = membership.user_id
     WHERE (SELECT COUNT(*) FROM owner_memberships) = 1
       AND membership.status = 'active'
       -- Match the repository's z.string().email() syntax. Stored Auth email
       -- must already be usable; never trim or repair an account here.
       AND owner.email ~* '^(?![.])(?!.*[.][.])[A-Z0-9_''+.-]*[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*[.])+[A-Z]{2,}$'
       AND owner.email_confirmed_at IS NOT NULL
       AND length(owner.encrypted_password) > 0
       AND owner.is_anonymous = false
       AND owner.aud = 'authenticated'
       AND owner.role = 'authenticated'
       AND owner.deleted_at IS NULL
       AND (owner.banned_until IS NULL OR owner.banned_until <= now())
       AND coalesce(owner.raw_app_meta_data ->> 'portal', 'tenant-admin')
         = 'tenant-admin'
       AND (SELECT COUNT(*) FROM auth.users AS same_email
             WHERE lower(same_email.email) = lower(owner.email)) = 1
       AND (SELECT COUNT(*) FROM auth.identities AS identity
             WHERE identity.user_id = owner.id
               AND identity.provider = 'email'
               AND lower(identity.identity_data ->> 'email')
                 = lower(owner.email)) = 1
       AND (SELECT COUNT(*) FROM public.tenant_users AS all_memberships
             WHERE all_memberships.user_id = owner.id) = 1
       AND NOT EXISTS (
         SELECT 1 FROM public.platform_users AS platform_user
          WHERE platform_user.user_id = owner.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.user_roles AS legacy_role
          WHERE legacy_role.user_id = owner.id
       )
  )
  SELECT
    (SELECT COUNT(*)::integer FROM eligible_owner) AS expected_owner_count,
    (SELECT COUNT(*)::integer
       FROM eligible_owner AS membership
       JOIN public.tenant_user_roles AS user_role
         ON user_role.user_id = membership.user_id
        AND user_role.tenant_id = membership.tenant_id
       JOIN public.tenant_roles AS tenant_role
         ON tenant_role.id = user_role.tenant_role_id
        AND tenant_role.tenant_id = user_role.tenant_id
       JOIN public.roles AS template_role
         ON template_role.id = tenant_role.template_role_id
      WHERE template_role.name = 'Management'
        AND template_role.is_system = true
        AND tenant_role.name = 'Management'
        AND tenant_role.is_system = true
        AND tenant_role.is_custom = false
        AND (SELECT COUNT(*) FROM public.tenant_user_roles AS all_roles
              WHERE all_roles.user_id = membership.user_id) = 1
        AND EXISTS (
          SELECT 1 FROM public.role_permissions AS expected_permission
           WHERE expected_permission.role_id = template_role.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.role_permissions AS expected_permission
           WHERE expected_permission.role_id = template_role.id
             AND NOT EXISTS (
               SELECT 1 FROM public.tenant_role_permissions AS actual_permission
                WHERE actual_permission.tenant_role_id = tenant_role.id
                  AND actual_permission.permission_id = expected_permission.permission_id
             )
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.tenant_role_permissions AS actual_permission
           WHERE actual_permission.tenant_role_id = tenant_role.id
             AND NOT EXISTS (
               SELECT 1 FROM public.role_permissions AS expected_permission
                WHERE expected_permission.role_id = template_role.id
                  AND expected_permission.permission_id = actual_permission.permission_id
             )
        )) AS expected_owner_management_role_count`;
}
