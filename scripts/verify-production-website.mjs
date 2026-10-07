import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

assert.equal(process.env.DEPLOY_TARGET,"production");assert.equal(process.env.APP_URL,"https://fieldgrid.nl");
const origin="https://veele-services.fieldgrid.nl";
const request = path => fetch(new URL(path, origin), { redirect: "error", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(15000) });
assert.match(process.env.RELEASE_SHA ?? "", /^[0-9a-f]{40}$/);
const health = await request(`/api/healthz?release=${process.env.RELEASE_SHA}`);
assert.equal(health.status, 200);
const readiness = await health.json();
assert.equal(readiness.status, "ok"); assert.equal(readiness.environment, "production");
assert.equal(readiness.release, process.env.RELEASE_SHA); assert.equal(readiness.database, "ready"); assert.equal(readiness.scanner, "ready");
const pages=JSON.parse(readFileSync(new URL("../websites/veele-services/pages.generated.json",import.meta.url),"utf8"));
for(const path of Object.keys(pages).filter(p=>p!=="404")){
  const response=await request(path);assert.equal(response.status,200);
  const body=await response.text();assert.ok(!response.headers.get("x-robots-tag")?.includes("noindex"));
  assert.ok(body.includes('alt="Veele Services"'));assert.ok(body.includes("4f6ad4d83eab08614126603fe68"));assert.ok(!body.includes("dgwebserv.chatgpt.site"));assert.ok(body.includes("/login?next=%2Fklant"));
}
assert.equal((await request("/not-a-real-marketing-page")).status,404);
assert.ok(!(await(await request("/robots.txt")).text()).includes("Disallow: /\n"));
assert.equal(((await(await request("/sitemap.xml")).text()).match(/<url>/g)||[]).length,28);
for(const next of["app","staff","klant"]){const r=await request(`/login?next=%2F${next}`);assert.equal(r.status,200);}
console.log("28 public marketing routes, 404, production robots, sitemap and three portal logins verified.");
