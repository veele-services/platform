# Website module custom delivery routing

Status: Phase 2C isolated routing proof; no live route or deployment change

## Boundary

`custom_nextjs` is an enterprise delivery mode for an independently deployed
application. It is not a managed-CMS template and it never receives draft CMS
content. The shared server-side host resolver makes one decision from the exact
verified domain binding and active site revision:

1. application paths (`/admin`, `/personeel`, `/klant`, `/api`) retain their
   existing owners;
2. a `managed_cms` site resolves only its exact active immutable publication;
3. a `custom_nextjs` site resolves only an exact approved custom deployment and
   a matching code-owned route registration;
4. every mismatch returns unavailable. It never falls back to the retained
   managed publication.

The database stores only `provider_key`, opaque `route_key`, immutable
`release_id`, exact `expected_host` and `health_path`. It cannot store an
upstream URL, credentials or routing headers. The infrastructure origin exists
only in reviewed application code/configuration and must be an origin-only
public HTTPS hostname. Literal IP addresses, credentials, non-HTTPS schemes,
nonstandard ports, paths, queries, fragments and local/internal names are
rejected.

## Runtime acceptance contract

A custom decision is routable only when all of these facts agree:

- request host has one active verified binding to the exact tenant and site;
- tenant is active, has the website entitlement and uses the Enterprise plan;
- site is active in `custom_nextjs` mode and points at the exact deployment;
- canonical binding and deployment `expected_host` are equal and verified;
- approved deployment identity exactly matches a code-owned provider, route,
  release, host and health-path registration;
- registration status is `routable` rather than `non_live`;
- the latest health observation is at most five minutes old;
- strict health evidence reports the same provider, route, release and host,
  plus successful TLS validation.

Health evidence schema version 1 is deliberately closed:

```json
{
  "schemaVersion": 1,
  "status": "healthy",
  "providerKey": "fieldgrid_vps",
  "routeKey": "opaque_code_owned_route",
  "releaseId": "immutable-release-id",
  "expectedHost": "tenant.staging.fieldgrid.nl",
  "tls": { "valid": true },
  "network": { "publicAddressesOnly": true }
}
```

Unknown fields are rejected so origins, tokens and provider response bodies do
not drift into the database or logs. The checker that records this evidence
must resolve every upstream address and reject private, loopback, link-local,
carrier-grade NAT, metadata and other non-public ranges before connecting.

## Veele non-live candidate

The existing Veele marketing application is registered for review, not for
routing or activation:

- source package: `artifacts/marketing-website` on `marketing/website`;
- source commit: `37bbe5d6999b0d11505454d1ab3759e8caa6b6e3`;
- immutable source tree: `4bbc345fd18393f2de32bb29a25fb5e909e2792b`;
- candidate release ID: `git-tree:4bbc345fd18393f2de32bb29a25fb5e909e2792b`;
- production host: `veeleservices.fieldgrid.nl`;
- staging host: `veeleservices.staging.fieldgrid.nl`;
- exact public route count: 44;
- canonical route-list SHA-256:
  `6fe45e341f4f0776b512e9ca0f9546b08e2a1e1723383101d7b57c60bfd91e4b`.

Its registration remains `non_live`: there is no reviewed immutable deployment
origin, no release-bound health endpoint and no applied staging edge route.
Those blockers are intentional and prevent accidental traffic activation. The
44-route marketing contract is copied exactly into the code-owned registration
and is unchanged by this phase.

## Planned staging edge change — not applied

After a separate review and explicit staging authorization, the edge change is:

1. preserve current application-prefix routing before website routing;
2. resolve the exact public host through `resolveWebsiteDeliveryByHost`;
3. reject unknown, unavailable, stale or non-live decisions with a neutral
   `404` or `503` response;
4. for `managed_cms`, continue forwarding to the isolated managed runtime;
5. for `custom_nextjs`, select only the returned code-owned HTTPS origin while
   preserving the public host and path;
6. strip application cookies before forwarding public website requests;
7. set no deployment or routing state from cookies, query parameters, request
   headers or tenant-authored data;
8. emit only tenant/site/deployment/revision identifiers in audit telemetry,
   never origins, health bodies or credentials.

Pre-activation must deploy the immutable candidate, add its strict health
endpoint, verify DNS/TLS and public address resolution, record fresh health,
register the exact routable origin in reviewed code, rehearse explicit rollback
and then run exact-host HTTP/SEO/asset/form smoke tests. Rollback is an audited
delivery-revision switch to the recorded previous target; it is never automatic
fallback.

No DNS, Caddy, staging, production, database row or deployment was changed by
Phase 2C.
