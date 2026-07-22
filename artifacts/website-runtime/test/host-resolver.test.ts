import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveManagedWebsiteByHost,
  type WebsiteRuntimeQuery,
} from "@workspace/db/website-public-runtime";
import { databaseRow, TEST_IDS } from "./fixtures";

test("host resolver loads only the active publication boundary", async () => {
  let sql = "";
  let values: readonly unknown[] = [];
  const query: WebsiteRuntimeQuery = async (statement, parameters) => {
    sql = statement;
    values = parameters;
    return { rows: [databaseRow()] };
  };

  const result = await resolveManagedWebsiteByHost(
    "ALPHA.fieldgrid.nl:443",
    query,
  );
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.tenantId, TEST_IDS.tenant);
    assert.equal(result.deliveryRevision, 3);
    assert.match(result.etag, /^"fgw-v1-r3-[a-f0-9]{64}"$/u);
  }
  assert.deepEqual(values, ["alpha.fieldgrid.nl"]);
  assert.match(sql, /website_publications publication/u);
  assert.doesNotMatch(
    sql,
    /website_pages|website_page_sections|website_navigation_items/u,
  );
});

test("unknown and malformed hosts fail closed", async () => {
  let calls = 0;
  const query: WebsiteRuntimeQuery = async () => {
    calls += 1;
    return { rows: [] };
  };
  assert.deepEqual(
    await resolveManagedWebsiteByHost("unknown.fieldgrid.nl", query),
    {
      status: "not_found",
    },
  );
  assert.deepEqual(
    await resolveManagedWebsiteByHost("platform.fieldgrid.nl", query),
    {
      status: "not_found",
    },
  );
  assert.equal(calls, 1);
});

test("disabled domains, custom mode and stale publication revisions are unavailable", async () => {
  for (const [overrides, reason] of [
    [{ binding_status: "disabled" }, "domain_inactive"],
    [{ delivery_mode: "custom_nextjs" }, "delivery_mode_mismatch"],
    [
      { publication_target_delivery_revision: 2 },
      "publication_revision_mismatch",
    ],
    [{ module_enabled: false }, "module_disabled"],
  ] as const) {
    const result = await resolveManagedWebsiteByHost(
      "alpha.fieldgrid.nl",
      async () => ({
        rows: [databaseRow(overrides)],
      }),
    );
    assert.deepEqual(result, { status: "unavailable", reason });
  }
});

test("snapshot, canonical host and cache identities must match the selected row", async () => {
  for (const overrides of [
    { canonical_hostname: "other.fieldgrid.nl" },
    { canonical_domain_disabled_at: "2026-07-22T01:00:00.000Z" },
    { publication_cache_key: "website-publication:wrong" },
    { publication_schema_version: 2 },
  ]) {
    const result = await resolveManagedWebsiteByHost(
      "alpha.fieldgrid.nl",
      async () => ({
        rows: [databaseRow(overrides)],
      }),
    );
    assert.equal(result.status, "unavailable");
  }
});
