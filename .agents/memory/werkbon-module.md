---
name: Werkbon-module implementation
description: Extra work (meerwerk) and photo storage pattern for assignment execution
---

# Werkbon-module

## New tables
- `assignment_extra_work` — extra work logged by personnel during/after execution
- `assignment_photos` — photos linked to an assignment (optionally to an extra work item)
- Both have RLS policies; migration at `migrations/019_werkbon_extra_work_photos.sql`
- Storage bucket: `assignment-photos` — must be created manually in Supabase dashboard

## Photo upload pattern
- Client-side upload via Supabase browser client directly to Storage
- Path format: `{assignmentId}/{extraWorkId}/{timestamp}.{ext}`
- After upload, call `savePhotoPath` server action to persist the path to DB
- Signed URLs generated server-side via `createAdminClient().storage.from('assignment-photos').createSignedUrl(path, 3600)`
- Newly uploaded photos shown via `URL.createObjectURL(file)` (no need to wait for signed URL)

**Why:** Large file uploads via server actions cause memory and timeout issues on edge runtimes. Direct-to-storage upload from the browser is the canonical pattern for file handling in Next.js + Supabase apps.

## Authorization pattern for extra-work actions
- Uses `db` from `@workspace/db` (drizzle, bypasses RLS)
- Application-level auth: `getAuthAndPersonnel()` → `isLinked(personnelId, assignmentId)`
- Same pattern as `artifacts/personeel-pwa/src/actions/reports.ts`

## Meerwerk editability
- `canEdit = true` while status is not in the "reporting done" set
- Locked after: `report_submitted`, `report_approved`, `invoice_ready`, `invoiced`, `paid`, `closed`

## klant-pwa basePath
- `basePath: "/klant"` in next.config.ts
- Next.js Link automatically prepends basePath — internal hrefs should NOT include `/klant/` prefix
- Existing code incorrectly uses full `/klant/...` paths in some Link hrefs (legacy inconsistency)
