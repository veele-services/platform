# Storage Policy & Upload Audit v1

Date: 2026-06-23
Scope: TAAK-23 - storage policies en server-side uploadvalidatie.

## Code changes

- Backoffice document uploads are validated server-side before storage write:
  - authenticated backoffice permission check;
  - tenant/entity ownership check;
  - allowlisted MIME types;
  - max 20 MB;
  - safe server-generated storage path;
  - upload through the server-side admin client after validation.
- Backoffice document downloads and deletes validate tenant/entity scope before issuing signed URLs or deleting objects.
- Customer document downloads validate `customer_users + tenant_id` through the customer identity path before a signed URL is issued.
- Personnel document downloads validate `personnel.user_id` before a signed URL is issued.
- Personnel report-note media and extra-work photos use signed upload URLs only after assignment/personnel/tenant validation.
- Personnel report-note media is only registered after the storage object exists at the expected path.
- Extra-work photos are only registered after the storage object exists at the expected path.
- Customer work order photos remain limited to `assignment_photos.is_approved = true`.

## Migration added

`lib/db/migrations/050_storage_upload_hardening.sql`

This migration:

- removes legacy broad document policies:
  - `documents_authenticated_read`
  - `documents_authenticated_insert`
  - `documents_delete`
- adds explicit document RLS:
  - management all access;
  - customer own select via `customer_users`;
  - personnel own select via `personnel.user_id`;
- makes storage buckets explicit:
  - `documents`: private;
  - `assignment-photos`: private;
  - `personnel-avatars`: public read only for profile avatars;
- drops legacy broad assignment-photo storage policies:
  - `authenticated_upload`
  - `owner_select`
  - `owner_delete`;
- recreates assignment-photo policies with assigned-personnel + tenant checks.

## Expected Supabase policy state after deploy

Run Database Inspect after staging deploy and confirm:

### Buckets

- `documents.public = false`
- `assignment-photos.public = false`
- `personnel-avatars.public = true`
- `documents.allowed_mime_types` does not include SVG.
- `assignment-photos.allowed_mime_types` includes allowed image/video types only.

### `storage.objects` policies

- `documents_management_all`
- `assignment_photos_management_all`
- `assignment_photos_assigned_personnel`
- `assignment_photos_assigned_personnel_insert`
- `assignment_photos_assigned_personnel_delete`
- `personnel_avatars_public_read`

The following legacy policies must be absent:

- `authenticated_upload`
- `owner_select`
- `owner_delete`

### `public.documents` policies

- `documents_management_all`
- `documents_customer_own_select`
- `documents_personnel_own_select`

The following legacy policies must be absent:

- `documents_authenticated_read`
- `documents_authenticated_insert`
- `documents_delete`

## Remaining operational note

Report PDFs and invoice PDFs are generated server-side and returned through authenticated application routes. They are not stored publicly by this task. If they are later persisted to Supabase Storage, they must use the private `documents` bucket with a `documents` metadata row and the same tenant/entity authorization checks.
