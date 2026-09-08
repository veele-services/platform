import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  CustomWebsiteHealthCheckError,
  requestCustomWebsiteHealthEvidence,
} from "../../lib/db/src/website-custom-health.ts";
import {
  type CustomWebsiteHealthEvidence,
  type CustomWebsiteRouteIdentity,
  type RoutableCustomWebsiteRouteRegistration,
} from "../../lib/website-core/src/index.ts";

const identity: CustomWebsiteRouteIdentity = {
  providerKey: "fieldgrid_vps",
  routeKey: "proof_route",
  releaseId: `git-commit:${"a".repeat(40)}`,
  expectedHost: "veeleservices.staging.fieldgrid.nl",
  healthPath: "/api/health",
};

const registration: RoutableCustomWebsiteRouteRegistration = {
  ...identity,
  expectedHosts: [identity.expectedHost],
  status: "routable",
  upstreamOrigin: "https://origin.staging.fieldgrid.nl",
};

const evidence: CustomWebsiteHealthEvidence = {
  schemaVersion: 3,
  status: "healthy",
  providerKey: identity.providerKey,
  routeKey: identity.routeKey,
  releaseId: identity.releaseId,
  expectedHost: identity.expectedHost,
  tls: { valid: true },
  network: { publicAddressesOnly: true },
  seo: {
    canonical: true,
    robots: true,
    sitemap: true,
    structuredData: true,
  },
  assets: { healthy: true },
  forms: { platformEndpoint: true },
};

function fakeHttpsRequest(payload: string, contentType = "application/json") {
  return ((options: unknown, callback: (response: PassThrough) => void) => {
    const request = new EventEmitter() as EventEmitter & {
      end(): void;
      destroy(error: Error): void;
    };
    request.destroy = (error) => request.emit("error", error);
    request.end = () => {
      const response = new PassThrough() as PassThrough & {
        statusCode: number;
        headers: Record<string, string>;
      };
      response.statusCode = 200;
      response.headers = { "content-type": contentType };
      callback(response);
      response.end(payload);
    };
    void options;
    return request;
  }) as never;
}

test("shared custom health check pins public DNS and validates exact evidence", async () => {
  const actual = await requestCustomWebsiteHealthEvidence(
    registration,
    identity,
    {
      lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      httpsRequest: fakeHttpsRequest(JSON.stringify(evidence)),
    },
  );
  assert.deepEqual(actual, evidence);
});

test("shared custom health check fails closed for identity and private DNS", async () => {
  await assert.rejects(
    requestCustomWebsiteHealthEvidence(
      registration,
      { ...identity, releaseId: `git-commit:${"b".repeat(40)}` },
      { lookup: async () => [{ address: "8.8.8.8", family: 4 }] },
    ),
    (error) =>
      error instanceof CustomWebsiteHealthCheckError &&
      error.code === "route_identity_mismatch",
  );
  await assert.rejects(
    requestCustomWebsiteHealthEvidence(registration, identity, {
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    }),
    (error) =>
      error instanceof CustomWebsiteHealthCheckError &&
      error.code === "dns_non_public",
  );

  await assert.rejects(
    requestCustomWebsiteHealthEvidence(registration, identity, {
      lookup: async () => [{ address: "::ffff:7f00:1", family: 6 }],
    }),
    (error: unknown) =>
      error instanceof CustomWebsiteHealthCheckError &&
      error.code === "dns_non_public",
  );
});
