---
name: Replit workflow port detection for Next.js
description: restart_workflow fails for Next.js dev unless --turbopack is used and the health check can get a 200 response.
---

## The rule
Next.js dev servers in Replit workflows MUST use `--turbopack` and bind to `0.0.0.0`. Without turbopack, `restart_workflow` always reports "DIDNT_OPEN_A_PORT" even when the server is actually running.

**Why:** The Replit workflow health checker makes an HTTP request to verify the service is up. The first page compile in standard Next.js webpack mode takes ~1.4s, but the health checker may time out or fail before the response returns. With `--turbopack`, the middleware and initial compile happen fast enough that the check succeeds. Binding to `0.0.0.0` (not `127.0.0.1`) is also required so the Replit probe can reach the port.

**How to apply:**
1. `package.json` dev script: `next dev --turbopack -H 0.0.0.0 -p $PORT`
2. `package.json` start script: `next start -H 0.0.0.0 -p $PORT` (for prod, turbopack not needed)
3. Add a public health check route at `src/app/healthz/route.ts` that returns `new Response("OK", { status: 200 })`
4. Exclude `/healthz` from middleware matcher (add `healthz` to the negative lookahead)
5. In `artifact.toml`, add: `[services.development.health.startup] path = "/personeel/healthz"` (adjust path to your basePath)
6. Set `localPort` to a value from the supported list: 3000, 3001, 3002, 3003, 4200, 5000, 5173, 6000, 6800, 8000, 8008, 8080, 8099, 9000
7. Install `pg` directly in the artifact package to suppress Turbopack externals warnings: `pnpm --filter @workspace/<slug> add pg`

The backoffice (port 22138) works without turbopack because it was already running before the session — it was never started via `restart_workflow` in this session.
