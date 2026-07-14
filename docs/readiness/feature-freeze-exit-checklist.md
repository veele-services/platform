# Fieldgrid feature-freeze exit checklist

Current main SHA: `42edb5664ed507ed914b8bebf8847ab1f6e39f74`.

All hard gates below must be satisfied before exiting feature freeze. Do not merge to production, deploy, or access live databases/secrets from this documentation PR.

| gate | status required to exit | required proof |
|---|---|---|
| P0 security | all P0 security register items closed | source tests plus runtime security harness evidence |
| P0 data/finance | finance/payment/report-to-invoice correctness closed | ledger invariants, transaction tests, reconciliation evidence |
| auth/invite/reset | end-to-end flow closed | invite, reset issuance, delivery, expiry, browser completion proof |
| assignment IDOR | remaining bare-ID assignment/planning actions closed | Tenant A/B runtime tests for every action |
| status state machine | centralized workflow state machine closed | positive and negative transition tests |
| Storage/signed URLs | documents, attachments, PDFs, and signed URLs closed | tenant-scoped storage and signed URL tests |
| support access | audited least-privilege support model closed | role policy, audit log, tenant isolation tests |
| payment ledger | immutable ledger behavior closed | append-only and reconciliation tests |
| report-to-invoice atomicity | atomic report-to-invoice flow closed | transaction rollback and concurrency tests |
| browser golden paths | automated portal golden paths closed | Playwright or equivalent customer/personnel/backoffice paths |
| test baseline | current branch validation green | install, migration order, layer check, register tests, typecheck, build, diff check |
| staging proof | staging post-deploy smoke accepted | release SHA marker, health gate, diagnostics, rollback readiness |
| production go/no-go | human release decision recorded | go/no-go packet, blocker count zero, rollback plan |
