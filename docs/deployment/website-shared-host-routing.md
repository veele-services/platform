# Website shared-host routing contract

Status: Phase 2A isolation and Phase 2B managed-runtime code contract; not a live proxy change.

The public tenant host is shared by the marketing website and three
authenticated applications. Production uses `{tenant}.fieldgrid.nl`, staging
uses `{tenant}.staging.fieldgrid.nl`, and a custom domain is accepted only
after the existing trusted domain resolver marks it verified for the exact
tenant and site.

`artifacts/website-runtime` now implements the managed fallback target. It is a
buildable service candidate only: no service unit, port, Caddy route, DNS record,
staging ref or production ref is changed in Phase 2B.

## Precedence

The edge must evaluate routes in this exact order and preserve every prefix:

1. `/admin` and `/admin/*` -> backoffice;
2. `/personeel` and `/personeel/*` -> personnel PWA;
3. `/klant` and `/klant/*` -> customer PWA;
4. `/api` and `/api/*` -> platform/API runtime;
5. every remaining public path -> the active managed or approved custom
   website runtime;
6. an unknown, reserved or unverified host -> neutral rejection, never a
   default tenant.

Do not use prefix-stripping proxy directives. Next.js owns the real `/admin`,
`/personeel` and `/klant` base paths, including assets, route handlers and
Server Actions. Website assets remain at the root `/_next` namespace; each
authenticated application's assets remain below its own prefix.

## Cookie boundary

New Fieldgrid/Supabase cookies are host-only and use the exact owning path:

- backoffice: `/admin`;
- personnel: `/personeel`;
- customer: `/klant`.

Recovery, tenant-selection and support-mode cookies use the same owning path.
The future website edge adapter must additionally apply
`filterWebsiteCookieHeader` from `@workspace/website-core/shared-host-routing`
before forwarding a public website request. That defense removes legacy
application cookies while retaining unrelated website cookies. It must never
log the incoming or filtered cookie value.

## Activation gate

Phase 2A does not change DNS, Caddy, staging, production or deployments. Before
later staging activation, operations must:

- treat wildcard DNS as provisioned based on the operator confirmation, while
  still proving exact host resolution from the staging runner;
- set `BACKOFFICE_PUBLIC_LOGIN_URL` to the tenant staging URL ending in
  `/admin/login`;
- validate wildcard DNS and TLS for `*.staging.fieldgrid.nl`;
- configure prefix-preserving routes in the order above;
- configure the public website fallback last;
- prove root requests contain no forwarded application cookie;
- retain the exact prior proxy configuration as rollback target.
