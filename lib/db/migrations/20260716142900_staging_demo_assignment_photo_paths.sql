-- Reconcile assignment-photo metadata created by the staging demo seed before
-- participant-execution backfills touch those rows. The seed never uploads or
-- moves storage objects; these paths are metadata-only examples. Preserve the
-- original value in the tenant audit trail and move only that explicit seed
-- namespace to the canonical tenant/assignment path contract.

lock table public.assignment_photos in share row exclusive mode;

insert into public.audit_log (
  tenant_id,
  user_id,
  action,
  resource,
  resource_id,
  metadata
)
select
  photo.tenant_id,
  coalesce(photo.uploaded_by, '00000000-0000-0000-0000-000000000000'::uuid),
  'migration_storage_path_reconciled',
  'assignment_photos',
  photo.id::text,
  jsonb_build_object(
    'migration', '20260716142900_staging_demo_assignment_photo_paths.sql',
    'reason', 'staging_demo_metadata_requires_tenant_assignment_context',
    'oldStoragePath', photo.storage_path,
    'newStoragePath',
      'tenant/' || photo.tenant_id::text || '/assignments/' ||
      photo.assignment_id::text || '/' ||
      regexp_replace(photo.storage_path, '^staging-demo/photos/', '')
  )
from public.assignment_photos photo
where photo.tenant_id is not null
  and photo.storage_path like 'staging-demo/photos/%';

update public.assignment_photos photo
set storage_path =
  'tenant/' || photo.tenant_id::text || '/assignments/' ||
  photo.assignment_id::text || '/' ||
  regexp_replace(photo.storage_path, '^staging-demo/photos/', '')
where photo.tenant_id is not null
  and photo.storage_path like 'staging-demo/photos/%';
