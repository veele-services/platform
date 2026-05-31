---
name: Supabase TCP blocked in Replit
description: Direct Postgres connections (port 5432/6543) are blocked in the Replit sandbox.
---

## Rule
Never attempt to run `pnpm --filter @workspace/db run push` or any drizzle-kit command that requires a direct DB connection inside the Replit environment — they will timeout/fail silently.

**Why:** Replit sandboxes block outbound TCP on standard Postgres ports. The DATABASE_URL connects via Supabase connection pooler but the sandbox firewall blocks it.

**How to apply:** All schema migrations must be provided as raw SQL files and run manually by the user in the Supabase project dashboard → SQL Editor. Name files `migrations/00N_<sprint>.sql` and instruct the user to run them there.
