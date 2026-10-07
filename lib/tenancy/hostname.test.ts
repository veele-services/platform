import { afterEach, describe, expect, it } from "vitest";
import { resolveHostContext, tenantAppUrl } from "./hostname";

const appUrl = "https://staging.fieldgrid.nl";
const originalAppUrl = process.env.APP_URL;
const originalDeployTarget = process.env.DEPLOY_TARGET;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalAppUrl;
  if (originalDeployTarget === undefined) delete process.env.DEPLOY_TARGET;
  else process.env.DEPLOY_TARGET = originalDeployTarget;
});

describe("resolveHostContext", () => {
  it("keeps production tenant links on the confirmed origin and rejects staging or nested hosts", () => {
    process.env.APP_URL = "https://fieldgrid.nl"; process.env.DEPLOY_TARGET = "production";
    expect(resolveHostContext("fieldgrid.nl", process.env.APP_URL, "production").kind).toBe("platform");
    expect(resolveHostContext("voorbeeld-tenant.fieldgrid.nl", process.env.APP_URL, "production")).toMatchObject({ kind: "tenant", slug: "voorbeeld-tenant" });
    expect(resolveHostContext("voorbeeld-tenant.staging.fieldgrid.nl", process.env.APP_URL, "production").kind).toBe("invalid");
    expect(resolveHostContext("localhost:3302", process.env.APP_URL, "production").kind).toBe("invalid");
    for (const workspace of ["app", "staff", "klant"]) expect(tenantAppUrl("voorbeeld-tenant", `/${workspace}`)).toBe(`https://voorbeeld-tenant.fieldgrid.nl/${workspace}`);
  });
  it("keeps the platform hostname tenant-neutral", () => {
    expect(resolveHostContext("staging.fieldgrid.nl", appUrl, "staging")).toEqual({
      kind: "platform",
      hostname: "staging.fieldgrid.nl",
    });
  });

  it("extracts exactly one valid tenant label", () => {
    expect(resolveHostContext("voorbeeld-tenant.staging.fieldgrid.nl", appUrl, "staging")).toEqual({
      kind: "tenant",
      hostname: "voorbeeld-tenant.staging.fieldgrid.nl",
      slug: "voorbeeld-tenant",
    });
  });

  it.each([
    "fieldgrid.nl",
    "a.b.staging.fieldgrid.nl",
    "UPPER.staging.fieldgrid.nl,proxy.invalid",
    "-ongeldig.staging.fieldgrid.nl",
  ])("rejects an unexpected host: %s", (host) => {
    expect(resolveHostContext(host, appUrl, "staging").kind).toBe("invalid");
  });

  it("accepts the local dev listener as platform context", () => {
    expect(resolveHostContext("localhost:3000", "http://127.0.0.1:3000", "local").kind).toBe("platform");
  });

  it("builds tenant links on the staging subdomain", () => {
    process.env.APP_URL = appUrl;
    process.env.DEPLOY_TARGET = "staging";
    expect(tenantAppUrl("voorbeeld-tenant", "/staff")).toBe("https://voorbeeld-tenant.staging.fieldgrid.nl/staff");
  });

  it("keeps local links on the local listener", () => {
    process.env.APP_URL = "http://127.0.0.1:3000";
    process.env.DEPLOY_TARGET = "local";
    expect(tenantAppUrl("voorbeeld-tenant", "/app")).toBe("http://127.0.0.1:3000/app");
  });

  it("preserves scoped document queries without allowing another origin", () => {
    process.env.APP_URL = appUrl;
    process.env.DEPLOY_TARGET = "staging";
    expect(tenantAppUrl("voorbeeld-tenant", "/api/files/commercial/example?asset=logo&token=fictional")).toBe("https://voorbeeld-tenant.staging.fieldgrid.nl/api/files/commercial/example?asset=logo&token=fictional");
    expect(() => tenantAppUrl("voorbeeld-tenant", "//other.invalid/")).toThrow();
    expect(() => tenantAppUrl("voorbeeld-tenant", "/\\other.invalid/")).toThrow();
  });
});
