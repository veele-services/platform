-- Normalize the platform_users role check left behind by the reverted
-- 055_platform_users migration. Current platform roles are owner/admin/support.

UPDATE platform_users
SET role = CASE role
  WHEN 'super_admin' THEN 'owner'
  WHEN 'billing_admin' THEN 'admin'
  ELSE role
END
WHERE role IN ('super_admin', 'billing_admin');

ALTER TABLE platform_users
  DROP CONSTRAINT IF EXISTS platform_users_role_check;

ALTER TABLE platform_users
  ADD CONSTRAINT platform_users_role_check
  CHECK (role IN ('owner', 'admin', 'support'));
