import assert from "node:assert/strict";
import { test } from "node:test";

import {
  sanitizeCustomerPortalHref,
  sanitizePersonnelPortalHref,
} from "../../lib/db/src/portal-routes.ts";

const portalSanitizers = [
  ["customer", sanitizeCustomerPortalHref, "/meldingen"],
  ["personnel", sanitizePersonnelPortalHref, "/meldingen"],
] as const;

for (const [audience, sanitize, fallback] of portalSanitizers) {
  test(`${audience} support deeplinks retain their route, query and fragment`, () => {
    assert.equal(sanitize("/help/veilig-werken"), "/help/veilig-werken");
    assert.equal(
      sanitize("/releases/zomer-release?bron=melding#planning"),
      "/releases/zomer-release?bron=melding#planning",
    );
    assert.equal(sanitize("/roadmap/new"), "/roadmap/new");
  });

  test(`${audience} base-path deeplinks are normalized to portal-relative routes`, () => {
    const basePath = audience === "customer" ? "/klant" : "/personeel";
    assert.equal(
      sanitize(`${basePath}/help/inloggen?bron=push`),
      "/help/inloggen?bron=push",
    );
    assert.equal(
      sanitize(`${basePath}/releases/nieuwe-app`),
      "/releases/nieuwe-app",
    );
    assert.equal(sanitize(`${basePath}/roadmap/new`), "/roadmap/new");
  });

  test(`${audience} rejects external, protocol-relative and unauthorized URLs`, () => {
    for (const href of [
      "https://fieldgrid.example/help/artikel",
      "javascript:alert(1)",
      "//attacker.example/releases",
      "/platform/security",
      "/admin",
      "/api/auth/session",
      "",
    ]) {
      assert.equal(sanitize(href), fallback, href);
    }
    assert.equal(sanitize(null), fallback);
    assert.equal(sanitize(undefined), fallback);
  });
}
