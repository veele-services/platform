import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
// @ts-expect-error The release ledger verifier is a Node-only JavaScript module.
import { validateAuthorizationReview } from "../../scripts/check-authorization-review.mjs";

const surfaces = { surfaces: [{ id: "code:app/example/route.ts" }, { id: "db:public.records" }] };
const fingerprint = (surface: object) => createHash("sha256").update(JSON.stringify(surface)).digest("hex");
const reviewed = (id: string, status = "controlled", evidence = ["test"]) => ({
  id,
  surfaceFingerprint: fingerprint(surfaces.surfaces.find((surface) => surface.id === id)!),
  status,
  evidence,
});

describe("authorization review ledger", () => {
  it("requires exactly one finished, evidenced review for every discovered surface", () => {
    expect(validateAuthorizationReview(surfaces, {
      version: 1,
      entries: [
        reviewed("code:app/example/route.ts", "controlled", ["handler-test"]),
        reviewed("db:public.records", "corrected-and-rechecked", ["rls-test"]),
      ],
    })).toEqual({ reviewed: 2 });
  });

  it.each([
    ["missing", [reviewed("code:app/example/route.ts", "controlled", ["handler-test"])]],
    ["pending", [
      reviewed("code:app/example/route.ts", "pending", ["source-review"]),
      reviewed("db:public.records", "controlled", ["rls-test"]),
    ]],
    ["without evidence", [
      reviewed("code:app/example/route.ts", "controlled", []),
      reviewed("db:public.records", "controlled", ["rls-test"]),
    ]],
    ["stale", [
      reviewed("code:app/example/route.ts", "controlled", ["handler-test"]),
      reviewed("db:public.records", "controlled", ["rls-test"]),
      { id: "rpc:public.removed()", surfaceFingerprint: "0".repeat(64), status: "controlled", evidence: ["old-test"] },
    ]],
  ])("fails closed for a %s ledger", (_name, entries) => {
    expect(() => validateAuthorizationReview(surfaces, { version: 1, entries })).toThrow();
  });

  it("invalidates an otherwise completed review when the current surface changes", () => {
    const entries = [reviewed("code:app/example/route.ts"), reviewed("db:public.records")];
    entries[0].surfaceFingerprint = "0".repeat(64);
    expect(() => validateAuthorizationReview(surfaces, { version: 1, entries })).toThrow(/changed since review/);
  });
});
