import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("FG-WEBSITE-PUBLIC-RUNTIME resolver is exact-host and active-publication only", () => {
  const source = read("lib/db/src/website-public-runtime.ts");
  assert.match(source, /WHERE binding\.hostname = \$1/u);
  assert.match(source, /binding_status !== "active"/u);
  assert.match(source, /tenant_domain_verification_status/u);
  assert.match(source, /tenant_is_active/u);
  assert.match(source, /module_enabled/u);
  assert.match(source, /site_status !== "active"/u);
  assert.match(source, /delivery_mode !== "managed_cms"/u);
  assert.match(source, /publication_status !== "active"/u);
  assert.match(source, /publication_target_delivery_revision/u);
  assert.match(source, /websitePublicationCacheIdentity/u);
  assert.doesNotMatch(
    source,
    /public\.website_(pages|page_sections|navigation_items)/u,
  );
});

test("FG-WEBSITE-PUBLIC-RUNTIME has no session client and strips application cookies", () => {
  const packageJson = read("artifacts/website-runtime/package.json");
  const middleware = read("artifacts/website-runtime/src/middleware.ts");
  assert.doesNotMatch(packageJson, /supabase/u);
  assert.match(packageJson, /@workspace\/shared-ui/u);
  assert.match(middleware, /filterWebsiteCookieHeader/u);
  assert.match(middleware, /requestHeaders\.delete\("cookie"\)/u);
  assert.doesNotMatch(middleware, /console\.|cookie.*log/iu);
});

test("FG-WEBSITE-PUBLIC-RUNTIME fails closed and never serves application prefixes", () => {
  const responses = read(
    "artifacts/website-runtime/src/lib/public-responses.ts",
  );
  const context = read("artifacts/website-runtime/src/lib/runtime-context.ts");
  const middleware = read("artifacts/website-runtime/src/middleware.ts");
  const page = read("artifacts/website-runtime/src/app/[[...slug]]/page.tsx");
  const http = read("artifacts/website-runtime/src/lib/http.ts");
  const renderer = read("lib/shared-ui/src/website-renderer.tsx");
  assert.match(context, /requestPathOwner\(host, pathname\) !== "website"/u);
  assert.match(page, /notFound\(\)/u);
  assert.match(
    page,
    /https:\/\/\$\{resolution\.canonicalHostname\}\$\{context\.page\.path\}/u,
  );
  assert.match(page, /context\.kind === "blog_post"/u);
  assert.match(page, /context\.kind === "blog_category"/u);
  assert.match(page, /alternates: \{ canonical \}/u);
  assert.match(page, /robots: \{ index: indexable, follow: indexable \}/u);
  assert.match(responses, /neutralErrorResponse\(404\)/u);
  assert.match(responses, /neutralErrorResponse\(503\)/u);
  assert.match(http, /script-src 'none'/u);
  assert.match(http, /form-action 'none'/u);
  assert.match(http, /Vary/u);
  assert.match(middleware, /script-src 'nonce-\$\{nonce\}' 'strict-dynamic'/u);
  assert.match(middleware, /private, no-store/u);
  assert.doesNotMatch(renderer, /dangerouslySetInnerHTML/u);
  assert.match(renderer, /<button type="button" disabled>/u);
});
