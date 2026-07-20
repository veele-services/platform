import fs from "node:fs";
const content=JSON.parse(fs.readFileSync(new URL("../content/website-content.json",import.meta.url),"utf8"));
const slugs=content.pages.map(p=>p.slug);const dup=slugs.filter((s,i)=>slugs.indexOf(s)!==i);
if(content.pages.length!==44) throw new Error(`Expected 44 pages, got ${content.pages.length}`);
if(dup.length) throw new Error(`Duplicate slugs: ${dup.join(", ")}`);
for(const page of content.pages){for(const key of ["name","slug","seo_title","meta","h1","intro"]){if(!page[key]) throw new Error(`${page.slug}: missing ${key}`)}}
console.log(`OK: ${content.pages.length} unique content routes.`);
