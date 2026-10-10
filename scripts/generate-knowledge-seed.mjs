/** Initial editorial seed only. Never rerun a changed historical migration or
 * overwrite live edits. Runtime reads the database, never these source files. */
import { writeFileSync } from 'node:fs';
import { knowledgeArticles } from '../content/knowledge/index.mjs';
const slugs=new Set(knowledgeArticles.map(a=>a.slug));
if(slugs.size!==knowledgeArticles.length)throw new Error('Duplicate article slug');
for(const a of knowledgeArticles){if(a.body.split(/\s+/).length<300)throw new Error(`Article too short: ${a.slug}`);for(const r of a.related)if(!slugs.has(r))throw new Error(`Unknown related article: ${r}`);}
const rows=knowledgeArticles.map(({slug,...content})=>`('${slug}', '${JSON.stringify(content).replaceAll("'","''")}'::jsonb)`).join(',\n');
const sql=`-- Initial reviewed Dutch editorial library; only missing slugs are seeded.\n-- Admin edits are never overwritten by deploys. No live tenant data.\nwith initial(slug,content) as(values\n${rows}\n), added as(insert into private.knowledge_articles(slug,draft,published,publication,published_at) select slug,content,content,'published',clock_timestamp() from initial on conflict(slug) do nothing returning *)\ninsert into private.knowledge_versions(article_id,revision,content,action) select id,revision,draft,'seed' from added;\n`;
writeFileSync(new URL('../supabase/migrations/20261010100100_knowledge_base_articles.sql',import.meta.url),sql);
console.log(`${knowledgeArticles.length} articles; ${knowledgeArticles.reduce((n,a)=>n+a.body.split(/\s+/).length,0)} words. Seed generated; apply through reviewed migration workflow.`);
