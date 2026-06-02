---
name: Supabase TCP connectivity in Replit
description: Whether direct Postgres connections work from the Replit sandbox.
---

## Rule
Direct psql connections to Supabase via DATABASE_URL **do work** from the Replit bash environment. Drizzle-kit commands (`pnpm --filter @workspace/db run push`) may still fail for other reasons, but raw psql and SQL file execution via `psql "$DATABASE_URL" -f migrations/xxx.sql` succeeds.

**Why:** Earlier sessions observed TCP timeouts, but as of June 2026 the connection works fine. Likely a transient Replit sandbox networking issue in earlier sessions.

**How to apply:** Migrations can be applied directly from bash:
```bash
psql "$DATABASE_URL" -f migrations/00N_<name>.sql
```
Verify with a follow-up SELECT after applying. No need to route through Supabase SQL Editor unless psql fails.
