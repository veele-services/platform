import { describe, expect, it } from "vitest";
// @ts-expect-error Node-only source guard intentionally remains JavaScript.
import { secretIndicators } from "../../scripts/check-source-secrets.mjs";
// @ts-expect-error Node-only artifact guard intentionally remains JavaScript.
import { inspectBlob } from "../../scripts/check-release-secrets.mjs";

describe("source credential guard", () => {
  it("reports positions and kinds without returning secret text", () => {
    const token=["SG","A".repeat(22),"B".repeat(43)].join(".");
    const findings=secretIndicators(`first line\nconst key='${token}';`);
    expect(findings).toEqual([{kind:"sendgrid-key",line:2}]);
    expect(JSON.stringify(findings)).not.toContain(token);
  });
  it("detects a service JWT but allows the public anonymous role", () => {
    const jwt=(role:string)=>[Buffer.from('{"alg":"HS256"}').toString("base64url"),Buffer.from(JSON.stringify({role})).toString("base64url"),"X".repeat(43)].join(".");
    expect(secretIndicators(jwt("service_role"))).toEqual([{kind:"supabase-service-jwt",line:1}]);
    expect(secretIndicators(jwt("anon"))).toEqual([]);
  });
  it("accepts public certificates and unmistakable placeholders", () => {
    expect(secretIndicators('-----BEGIN CERTIFICATE-----\nNEXT_KEY=<configure-in-github>\nSUPABASE_SEND_EMAIL_HOOK_SECRET=')).toEqual([]);
  });
  it("scans textual build/history bytes without including values, and explicitly distinguishes binary input",()=>{
    const marker=["live_","Z".repeat(32)].join("");
    expect(inspectBlob(Buffer.from(marker))).toEqual([{kind:"mollie-live-key",line:1}]);
    expect(inspectBlob(Buffer.from([1,0,2]))).toBeNull();
    expect(()=>inspectBlob(Buffer.alloc(16*1024*1024+1))).toThrow();
  });
});
