import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractNavigationHrefs,
  findBrokenLocalNavigationHrefs,
  normalizeNavigationHref,
} from "../scripts/lib/fieldgrid-navigation-href-contract.mjs";

const routePatterns = [/^\/opdrachten\/[^/]+\/?$/u];
const neverSkip = () => false;

test("navigation href parser includes JSX template expressions", () => {
  const content = [
    '<Link href="/opdrachten">Statisch</Link>',
    "<Link href={`/opdrachten/${assignment.id}`}>Dynamisch</Link>",
    "const action = { href: `/opdrachten/${assignment.id}` };",
  ].join("\n");

  assert.deepEqual(extractNavigationHrefs(content), [
    "/opdrachten",
    "/opdrachten/${assignment.id}",
    "/opdrachten/${assignment.id}",
  ]);
  assert.equal(
    normalizeNavigationHref("/opdrachten/${assignment.id}?tab=planning"),
    "/opdrachten/:param",
  );
});

test("navigation href contract rejects a broken JSX dynamic route prefix", () => {
  const valid = findBrokenLocalNavigationHrefs({
    content: "<Link href={`/opdrachten/${assignment.id}`}>Open</Link>",
    file: "ValidLink.tsx",
    routePatterns,
    shouldSkipHref: neverSkip,
  });
  const broken = findBrokenLocalNavigationHrefs({
    content: "<Link href={`/opdracht/${assignment.id}`}>Open</Link>",
    file: "BrokenLink.tsx",
    routePatterns,
    shouldSkipHref: neverSkip,
  });

  assert.deepEqual(valid.failures, []);
  assert.deepEqual(broken.failures, [
    {
      id: "broken-local-href",
      file: "BrokenLink.tsx",
      href: "/opdracht/${assignment.id}",
    },
  ]);
});
