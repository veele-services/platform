import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const workflows=[".github/workflows/_verify.yml",".github/workflows/deploy-staging.yml",".github/workflows/bootstrap-staging-admin.yml"];
const actionReference=/uses:\s+([^\s#]+)/g;

describe("release workflow credential boundary",()=>{
 it.each(workflows)("pins every external action in %s to a full commit",file=>{
  const source=readFileSync(file,"utf8");
  const references=[...source.matchAll(actionReference)];
  expect(references.length).toBeGreaterThan(0);
  for(const reference of references){
   if(reference[1].startsWith("./"))continue;
   expect(reference[1]).toMatch(/^[^@\s]+@[a-f0-9]{40}$/);
  }
 });

 it.each([".github/workflows/deploy-staging.yml",".github/workflows/bootstrap-staging-admin.yml"])("does not expose Environment secrets at job scope in %s",file=>{
  const source=readFileSync(file,"utf8");
  const jobEnvironment=source.slice(source.indexOf("    env:"),source.indexOf("    steps:"));
  expect(jobEnvironment).not.toContain("${{ secrets.");
  const install=source.indexOf("pnpm install --frozen-lockfile");
  expect(install).toBeGreaterThan(source.indexOf("    steps:"));
  expect(source.indexOf("${{ secrets.")).toBeGreaterThan(install);
 });

 it("never restores an older application after forward-only migrations",()=>{
  const deploy=readFileSync("scripts/deploy-local.sh","utf8");
  expect(deploy).toContain("automatische coderollback is na forward-migraties geblokkeerd");
  expect(deploy).not.toContain("previous_target");
  expect(deploy).not.toMatch(/verify-healthcheck[\s\S]*ln -sfn/);
 });

 it("uses the persistent staging runner only for ciphertext transfer and broker activation",()=>{
  const source=readFileSync(".github/workflows/deploy-staging.yml","utf8");
  const deploy=source.slice(source.indexOf("  deploy:"),source.indexOf("  acceptance:"));
  expect(deploy).not.toContain("${{ secrets.");
  expect(deploy).not.toContain("actions/attest@");
  expect(deploy).not.toContain("scripts/write-runtime-env.sh");
  expect(deploy).not.toContain("scripts/backup-database.sh");
 });

 it("runs the credentialed administrator bootstrap on a fresh hosted runner",()=>{
  const source=readFileSync(".github/workflows/bootstrap-staging-admin.yml","utf8");
  expect(source).toContain("runs-on: ubuntu-24.04");
  expect(source).not.toContain("runs-on: [self-hosted");
  expect(source).toContain("persist-credentials: false");
 });
});
