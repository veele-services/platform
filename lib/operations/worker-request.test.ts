import { describe, expect, it } from "vitest";
import { isAuthenticatedWorkerRequest } from "./worker-request";

const secret = "synthetic-worker-test-secret-no-real-credential";
const env = { DEPLOY_TARGET: "staging", PORT: "3301", ADMIN_API_SECRET: secret };
const request = { method: "POST", pathname: "/api/worker", search: "", host: "127.0.0.1:3301", authorization: `Bearer ${secret}` };
describe("existing staging worker ingress", () => {
  it("allows only the authenticated exact existing service invocation", () => expect(isAuthenticatedWorkerRequest(request, env)).toBe(true));
  it.each([
    { method: "GET" }, { pathname: "/api/worker/" }, { pathname: "/api/tickets" },
    { pathname: "/app/meldingen" }, { search: "?tenant=other" }, { host: "localhost:3301" },
    { host: "127.0.0.1:3301, evil.invalid" }, { host: "evil.invalid" }, { authorization: null },
    { authorization: "Bearer another-secret-with-the-same-length-test000000" }, { authorization: `Basic ${secret}` },
  ])("does not relax tenant routing for %o", patch => expect(isAuthenticatedWorkerRequest({ ...request, ...patch }, env)).toBe(false));
  it.each([{ DEPLOY_TARGET: "production" }, { PORT: "3000" }, { ADMIN_API_SECRET: "" }, { ADMIN_API_SECRET: "short" }])("requires the exact staging runtime and service secret: %o", patch => expect(isAuthenticatedWorkerRequest(request, { ...env, ...patch })).toBe(false));
});
