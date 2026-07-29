# Website shared-host routing contract

Status: Phase 9 staging activation contract implemented; live configuration
still requires the guarded operator runbook.

The public tenant host is shared by the marketing website and three
authenticated applications. Production uses `{tenant}.fieldgrid.nl`, staging
uses `{tenant}.staging.fieldgrid.nl`, and a custom domain is accepted only
after the existing trusted domain resolver marks it verified for the exact
tenant and site.

`artifacts/website-runtime` implements the managed renderer and the
operator-allowlisted custom proxy. The independent custom application is a
sixth process. The deploy health gate accepts each only as a complete
service/port/health pair. No service unit, Caddy route, staging ref or
production ref is changed merely by merging this code.

## Precedence

The edge must evaluate routes in this exact order and preserve every prefix:

1. exact legacy entry path `/login` -> permanent same-host redirect to
   `/admin/login`, preserving its query string;
2. `/admin` and `/admin/*` -> backoffice;
3. `/personeel` and `/personeel/*` -> personnel PWA;
4. `/klant` and `/klant/*` -> customer PWA;
5. `/api` and `/api/*` -> platform/API runtime;
6. every remaining public path -> the active managed or approved custom
   website runtime;
7. an unknown, reserved or unverified host -> neutral rejection, never a
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
The website runtime additionally applies
`filterWebsiteCookieHeader` from `@workspace/website-core/shared-host-routing`
before forwarding a public website request. That defense removes legacy
application cookies while retaining unrelated website cookies. It must never
log the incoming or filtered cookie value.

## Activation gate

Before staging activation, operations must:

- treat wildcard DNS as provisioned based on the operator confirmation, while
  still proving exact host resolution from the staging runner;
- set `BACKOFFICE_PUBLIC_LOGIN_URL` to the tenant staging URL ending in
  `/admin/login`;
- validate wildcard DNS and TLS for `*.staging.fieldgrid.nl`;
- configure prefix-preserving routes in the order above;
- configure the public website fallback last;
- prove root requests contain no forwarded application cookie;
- retain the exact prior proxy configuration as rollback target.

The exact service, route, health and rollback procedure is in
`docs/website-module-enterprise-activation.md`. Production remains excluded.
