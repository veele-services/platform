import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const migration = read(
  "lib/db/migrations/20260721220000_website_preview_sessions.sql",
);
const service = read("lib/db/src/website-preview-service.ts");
const token = read("lib/website-core/src/preview-token.ts");
const actions = read("artifacts/backoffice/src/app/actions/website.ts");
const previewRoute = read(
  "artifacts/backoffice/src/app/website-preview/[token]/[[...slug]]/page.tsx",
);
const reviewPage = read(
  "artifacts/backoffice/src/app/(dashboard)/website/review/page.tsx",
);
const reviewPanel = read(
  "artifacts/backoffice/src/components/website/WebsitePublicationReviewPanel.tsx",
);
const nextConfig = read("artifacts/backoffice/next.config.ts");
const sharedRenderer = read("lib/shared-ui/src/website-renderer.tsx");

test("preview storage is opaque, bounded, server-only and revision scoped", () => {
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.website_preview_sessions/u,
  );
  assert.match(migration, /token_hash varchar\(64\) NOT NULL/u);
  assert.match(migration, /source_revision integer NOT NULL/u);
  assert.match(migration, /expires_at <= created_at \+ interval '15 minutes'/u);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/u);
  assert.match(migration, /website_guard_preview_session_immutability/u);
  assert.match(migration, /website preview session identity is immutable/u);
  assert.match(
    migration,
    /OLD\.last_used_at IS NOT NULL[\s\S]*NEW\.last_used_at IS NULL/u,
  );
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.website_guard_preview_session_immutability\(\)/u,
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.website_preview_sessions FROM anon, authenticated/u,
  );
  assert.doesNotMatch(
    migration,
    /CREATE POLICY|GRANT (?:SELECT|INSERT|UPDATE|DELETE)/iu,
  );
});

test("preview tokens carry no identity and fail closed through HMAC verification", () => {
  assert.match(token, /randomBytes\(32\)/u);
  assert.match(token, /createHmac\("sha256"/u);
  assert.match(token, /timingSafeEqual/u);
  assert.match(token, /at least 32 bytes/u);
  assert.match(token, /fieldgrid-website-preview:v1/u);
  assert.match(token, /createHash\("sha256"/u);
  assert.doesNotMatch(token, /tenantId|siteId|actorUserId|sourceRevision/u);
});

test("preview consumption binds exact tenant, actor, site revision and expiry", () => {
  for (const predicate of [
    "preview.tenant_id = $1",
    "preview.actor_user_id = $2",
    "preview.token_hash = $3",
    "preview.revoked_at IS NULL",
    "preview.expires_at > now()",
    "site.authoring_revision = preview.source_revision",
  ]) {
    assert.match(service, new RegExp(predicate.replace(/[.$]/gu, "\\$&"), "u"));
  }
  assert.match(service, /websitePublicationSnapshotSchema\.parse/u);
  assert.match(service, /buildWebsiteDraftPreviewSnapshot/u);
  assert.match(service, /website_preview_created/u);
  assert.match(service, /section_media_resolution_pending/u);
  assert.match(service, /form_processing_inactive/u);
});

test("preview route repeats live auth, RBAC and signed-token verification", () => {
  assert.match(previewRoute, /getCurrentBackofficeUser\(\)/u);
  assert.match(previewRoute, /requireCurrentTenantId\(\)/u);
  assert.match(previewRoute, /hasPermission\("website_pages", "read"\)/u);
  assert.match(previewRoute, /verifyWebsitePreviewToken/u);
  assert.match(previewRoute, /hashWebsitePreviewToken/u);
  assert.match(previewRoute, /loadWebsitePreviewSession/u);
  assert.match(previewRoute, /notFound\(\)/u);
  assert.match(previewRoute, /Conceptpreview/u);
});

test("preview responses cannot be cached, indexed or leak their token as a referrer", () => {
  assert.match(nextConfig, /source: "\/website-preview\/:path\*"/u);
  assert.match(nextConfig, /private, no-store, max-age=0/u);
  assert.match(nextConfig, /X-Robots-Tag/u);
  assert.match(nextConfig, /noindex, nofollow, noarchive/u);
  assert.match(nextConfig, /Referrer-Policy", value: "no-referrer"/u);
  assert.match(
    previewRoute,
    /robots: \{ index: false, follow: false, nocache: true \}/u,
  );
});

test("public and preview rendering share one escaped renderer boundary", () => {
  assert.match(previewRoute, /@workspace\/shared-ui\/website-renderer/u);
  assert.match(
    read("artifacts/website-runtime/src/lib/render-document.tsx"),
    /@workspace\/shared-ui\/website-renderer/u,
  );
  assert.match(sharedRenderer, /internalPathPrefix/u);
  assert.doesNotMatch(
    sharedRenderer,
    /dangerouslySetInnerHTML|innerHTML\s*=|eval\(|new Function/iu,
  );
});

test("publication review is read-derived and activation remains explicit exact-head RBAC", () => {
  assert.match(reviewPage, /hasPermission\("website_pages", "publish"\)/u);
  assert.match(reviewPanel, /Immutable kandidaat voorbereiden/u);
  assert.match(reviewPanel, /Gereviewde publicatie activeren/u);
  assert.match(reviewPanel, /confirmation: "PUBLICEREN"/u);
  assert.match(
    actions,
    /prepareWebsitePublicationAction[\s\S]*requirePermission\("website_pages", "publish"\)/u,
  );
  assert.match(
    actions,
    /activateWebsitePublicationAction[\s\S]*review\.deliveryMode !== "managed_cms"/u,
  );
  assert.match(
    actions,
    /candidate\.sourceRevision !== input\.expectedAuthoringRevision/u,
  );
  assert.match(
    actions,
    /candidate\.targetDeliveryRevision !== input\.expectedDeliveryRevision \+ 1/u,
  );
  assert.match(actions, /confirmation !== "PUBLICEREN"/u);
  assert.doesNotMatch(
    `${actions}\n${service}\n${reviewPanel}`,
    /custom_deployments|route_key|provider_key|upstream|force-push|production|staging/iu,
  );
});
