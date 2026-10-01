import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error Build-time inventory uses the Node-only JavaScript harness.
import { codeSurfaces, operationalPaths, operationSurface } from "../../scripts/check-security-surface.mjs";

describe("authorization surface change detector", () => {
  it("records exported actions, resources and observed controls without calling them", () => {
    const rows = codeSurfaces("app/app/actions.ts", '"use server"; export async function update(){const db=await createClient(); await getAuthContext();return db.rpc("guarded_command",{});}');
    expect(rows).toEqual([{id:"code:app/app/actions.ts",exports:["update"],classification:"server-action",observedControls:["createClient","getAuthContext"],resources:["rpc:guarded_command"],source_sha256:expect.stringMatching(/^[a-f0-9]{64}$/)}]);
  });
  it("detects arrow handlers and default RSC entrypoints without a known auth helper", () => {
    expect(codeSurfaces("app/api/new/route.ts", "export const POST=async()=>new Response('');")[0]).toMatchObject({id:"code:app/api/new/route.ts",exports:["POST"],observedControls:[]});
    expect(codeSurfaces("app/new/page.tsx", "export default async function Page(){return null;}")[0].exports).toEqual(["default"]);
  });
  it("tracks literal table/RPC dependencies but does not serialize source values", () => {
    const rows = codeSurfaces("lib/loader.ts", 'export async function data(){const db=createAdminClient();return db.from("private_records").select("*").eq("secret","DO-NOT-CAPTURE");}');
    expect(rows[0].resources).toEqual(["from:private_records"]);
    expect(JSON.stringify(rows)).not.toContain("DO-NOT-CAPTURE");
  });
  it("ignores ordinary presentation modules and retains module-level data access", () => {
    expect(codeSurfaces("lib/view.ts", "export const label='Hello';")).toEqual([]);
    expect(codeSurfaces("lib/writer.ts", 'db.from("records").update({});')[0].exports).toEqual(["module"]);
  });
  it("retains indirect authorization helpers and server components", () => {
    expect(codeSurfaces("lib/guard.ts", "export async function guard(){return getAuthContext();}")[0]).toMatchObject({
      classification: "data-access-module",
      observedControls: ["getAuthContext"],
    });
    expect(codeSurfaces("components/secure-route.tsx", "export async function Secure(){await getAuthContext();return null;}")[0]).toMatchObject({
      id: "code:components/secure-route.tsx",
      classification: "data-access-module",
    });
    expect(codeSurfaces("components/browser-data.tsx", "export function Client(){const db=createClient();return null;}")[0]).toMatchObject({
      observedControls: ["createClient"],
    });
  });
  it("fingerprints operational workflow and deployment entrypoints", () => {
    expect(operationSurface(".github/workflows/deploy-staging.yml", "name: deploy\n")).toEqual({
      id: "operation:.github/workflows/deploy-staging.yml",
      classification: "operation",
      source_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(operationalPaths()).toEqual(expect.arrayContaining([
      ".github/workflows/deploy-staging.yml",
      "deploy/clamd-ticket-test.conf",
      "package.json",
      "public/sw.js",
    ]));
  });
  it("makes database lint errors and security-advisor warnings mandatory CI failures", () => {
    const workflow = readFileSync(".github/workflows/_verify.yml", "utf8");
    expect(workflow).toContain("supabase db lint --local --level warning --fail-on error");
    expect(workflow).toContain("supabase db advisors --local --type security --level warn --fail-on warn");
    expect(workflow).not.toContain("continue-on-error: true");
  });
});
