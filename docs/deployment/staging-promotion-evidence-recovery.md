# Staging promotion evidence recovery

A successful database rehearsal does not by itself prove that staging is ready
for promotion. The preflight also validates its complete semantic evidence before
reporting success. Its live smoke must identify the running release, including
when a proven rollback means the active release differs from the staging Git ref.
The candidate SHA, staging ref and active release remain separate identities.

The smoke runner accepts the expected active SHA and an explicit canonical-marker
bootstrap for older releases whose dashboard does not yet report its SHA. This
bootstrap reads the fixed staging `current` release marker before and after the
HTTP snapshot. It cannot override a conflicting API identity. The promotion gate
continues to require the independently verified rollback evidence whenever the
active release differs from the staging ref.

## Legacy document references

Run `fieldgrid-staging-document-storage-backfill.yml` from reviewed `main`, with
the exact current SHA, operation `diagnose`, and confirmation
`fieldgrid-staging-document-storage-backfill-v1`. The workflow uses the staging
environment and emits bounded counts and fixed failure codes. It does not publish
document identifiers, filenames, object paths, tokens or file contents.

Only after diagnosis establishes that the source objects exist and belong to the
document's tenant, run the same exact workflow with operation `apply`. A successful
Main Exact Head Validation for that SHA is required before mutation. The runner
copies each supported legacy object to a deterministic tenant-prefixed destination,
verifies the source and destination bytes, then updates the matching document
reference. It preserves original objects and all document metadata. A destination
collision, changed reference, unsupported path or missing object stops the repair.
Reruns verify existing copies instead of overwriting them.

Before any reference update, the runner retains a private manifest below the
fixed directory `/var/www/veele/staging/shared/document-storage-backfill`.
Directories are owned by the runner and mode `0700`; manifest files use `0600`.
This location survives Actions temporary-directory cleanup. Only its opaque
manifest identifier and content hash appear in the uploaded report.

This operation changes document references, not schema, policies or roles. It does
not delete files or synthesize missing test documents. Retain the latest verified
staging database backup and original objects through acceptance. Use the retained
private recovery manifest to reconcile references if necessary. The existing
canonical-path constraint also applies to updates of older rows: writing the old
legacy path back is not a valid ordinary rollback. Prefer a verified canonical
replacement and compare-and-swap recovery. A full historical database restore
requires the separate backup recovery procedure. Reverting code does not undo
document changes. Do not delete canonical copies or weaken constraints to reverse
this operation.

Run the Phase 2E preflight again after recovery. The storage check must be green,
and the authenticated smoke, migration rehearsal and rollback identity must all
pass semantic validation before the exact-SHA staging promotion runs.
