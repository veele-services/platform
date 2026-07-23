import assert from "node:assert/strict";
import { test } from "node:test";

import {
  websiteCanonicalPathSchema,
  websiteRedirectDraftSchema,
  websiteRedirectExternalUrlSchema,
  websiteRouteKey,
} from "../src/index";

const redirectId = "50000000-0000-4000-8000-000000000001";

test("canonical website paths are locale-ready and reject reserved or ambiguous routes", () => {
  assert.equal(
    websiteCanonicalPathSchema.parse("/diensten/glas"),
    "/diensten/glas",
  );
  assert.equal(websiteRouteKey("nl-NL", "/diensten"), "nl-NL:/diensten");
  assert.equal(websiteRouteKey("en-GB", "/diensten"), "en-GB:/diensten");
  for (const invalid of [
    "diensten",
    "/Diensten",
    "/diensten/",
    "/diensten//glas",
    "/api/form",
    "/_next/static",
    "/pad?query=1",
  ]) {
    assert.equal(websiteCanonicalPathSchema.safeParse(invalid).success, false);
  }
});

test("external redirect destinations require credential-free HTTPS", () => {
  assert.equal(
    websiteRedirectExternalUrlSchema.parse("https://example.test/pad"),
    "https://example.test/pad",
  );
  for (const invalid of [
    "http://example.test",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "https://user:secret@example.test",
  ]) {
    assert.equal(
      websiteRedirectExternalUrlSchema.safeParse(invalid).success,
      false,
    );
  }
});

test("redirect drafts reject duplicate sources, self redirects, loops and chains", () => {
  const base = {
    id: redirectId,
    locale: "nl-NL",
    sourcePath: "/oud",
    destinationType: "path" as const,
    destination: "/nieuw",
    statusCode: 308 as const,
    isActive: true,
  };
  assert.equal(websiteRedirectDraftSchema.parse([base]).length, 1);
  assert.equal(
    websiteRedirectDraftSchema.safeParse([
      base,
      { ...base, id: "50000000-0000-4000-8000-000000000002" },
    ]).success,
    false,
  );
  assert.equal(
    websiteRedirectDraftSchema.safeParse([{ ...base, destination: "/oud" }])
      .success,
    false,
  );
  assert.equal(
    websiteRedirectDraftSchema.safeParse([
      base,
      {
        ...base,
        id: "50000000-0000-4000-8000-000000000003",
        sourcePath: "/nieuw",
        destination: "/eind",
      },
    ]).success,
    false,
  );
});

test("inactive historical redirects do not create a live chain", () => {
  assert.equal(
    websiteRedirectDraftSchema.safeParse([
      {
        id: redirectId,
        locale: "nl-NL",
        sourcePath: "/oud",
        destinationType: "path",
        destination: "/nieuw",
        statusCode: 308,
        isActive: true,
      },
      {
        id: "50000000-0000-4000-8000-000000000004",
        locale: "nl-NL",
        sourcePath: "/nieuw",
        destinationType: "path",
        destination: "/eind",
        statusCode: 308,
        isActive: false,
      },
    ]).success,
    true,
  );
});
