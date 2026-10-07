import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

assert.equal(process.env.DEPLOY_TARGET,"production");assert.equal(process.env.APP_URL,"https://fieldgrid.nl");
const origin="https://veele-services.fieldgrid.nl";
const pages=JSON.parse(readFileSync(new URL("../websites/veele-services/pages.generated.json",import.meta.url),"utf8"));
for(const path of Object.keys(pages).filter(p=>p!=="404")){
  const response=await fetch(origin+path,{signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);
  const body=await response.text();assert.ok(!response.headers.get("x-robots-tag")?.includes("noindex"));
  assert.ok(body.includes('alt="Veele Services"'));assert.ok(body.includes("4f6ad4d83eab08614126603fe68"));assert.ok(!body.includes("dgwebserv.chatgpt.site"));assert.ok(body.includes("/login?next=%2Fklant"));
}
assert.equal((await fetch(origin+"/not-a-real-marketing-page")).status,404);
assert.ok(!(await(await fetch(origin+"/robots.txt")).text()).includes("Disallow: /\n"));
assert.equal(((await(await fetch(origin+"/sitemap.xml")).text()).match(/<url>/g)||[]).length,28);
for(const next of["app","staff","klant"]){const r=await fetch(`${origin}/login?next=%2F${next}`);assert.equal(r.status,200);}
console.log("28 public marketing routes, 404, production robots, sitemap and three portal logins verified.");
