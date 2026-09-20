# Runtime health identity

The four core services expose their own immutable release identity on health
responses: `X-Fieldgrid-Environment`, `X-Fieldgrid-Release`, and
`X-Fieldgrid-Service`. Responses use `Cache-Control: no-store, max-age=0`.
The services are `backoffice`, `personnel`, `customer`, and `api`.

The identity is captured from the process's physical working directory and
the bounded, regular, non-symlink `../../.fieldgrid-release-sha` marker. It
never follows the mutable deployment `current` symlink after capture. The
environment is the process's validated `APP_ENV` (`staging` or `production`).
Missing markers or other local development configurations produce `unknown`
identity while preserving the existing health response body and HTTP 200.
The hosted deploy gate rejects unknown or mismatched identity.

The existing personnel, customer and API health URLs retain their bodies.
Backoffice adds `/admin/healthz`; only exact GET and HEAD requests bypass
session middleware for this metadata endpoint. No user, tenant, database,
credentials or configuration values are returned.

For both staging and production, each of the four local and public service
probes must match the expected environment, full commit SHA and service.
Backoffice login retains its page probe and additionally requires the same
host's `/admin/healthz` identity. A staging response with the same commit and
HTTP 200 therefore cannot satisfy production health.

The configured public `API_PUBLIC_ROOT_URL` must end in `/api/`. Its exact expected
unauthenticated response is HTTP 401 with JSON
`{"error":"Authenticatie vereist"}`, from `requireAuth` in
`artifacts/api-server/src/middleware/auth.ts`. It must also carry the expected
API identity. The private API process root `/` still requires HTTP 404.
Public `/api` without the trailing slash and a generic backoffice 404 are not
accepted as evidence of the API route.

Staging promotion preflight also requires the public root's HTTP 401. A redirect
from the unrelated `/rest/v1/` path is not API routing evidence.

Rollback checks use the restored release's marker. A legacy release without
identity headers may be restored but cannot be reported as a proven healthy
rollback by the new gate. Runtime identity proves routing and deployed code;
it does not replace the database principal/migration gates or authenticated
functional acceptance.

Validation:

```sh
node --test tests/security/fieldgrid-runtime-health-identity.test.mjs
node --test tests/fieldgrid-deploy-health-gate.test.mjs
```
