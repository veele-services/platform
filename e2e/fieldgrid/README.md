# Fieldgrid Playwright golden path

This foundation starts the real Fieldgrid browser surfaces against local-only E2E infrastructure: local Supabase-compatible gateway, pinned PostgREST, and disposable PostgreSQL 17 fixtures. External providers may be mocked, but application data must flow through the Supabase/PostgREST data path and the browser must not use service-role credentials.

The E2E authentication seam is identity-only: `auth.getUser()` may return an allowlisted fixture identity when `FIELDGRID_E2E_AUTH_ENABLED=true` outside production. All other Supabase members (`from`, `rpc`, `storage`, `functions`, and `realtime`) are delegated to the original client.

Run with:

```sh
pnpm fieldgrid:playwright
```
