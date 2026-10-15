import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),postcss=require(require.resolve('postcss',{paths:[require.resolve('@tailwindcss/postcss')]}));
// Source files are immutable design evidence. Only selector scope and preview
// chrome isolation differ; declarations, rule order and media queries stay exact.
const root='.sites-cockpit',parts=[];
// Portals.tsx imports these faces in the source app. Their final cascade also
// determines the backoffice glyphs; keep that cascade, not only the WOFF files.
for(const file of['portal-source/staff.css','portal-source/customer-portal.css']){
 const tree=postcss.parse(await readFile(new URL('../design-reference/sites-v3/platform/src/'+file,import.meta.url),'utf8'));
 const faces=[];tree.walkAtRules('font-face',rule=>faces.push(rule.toString()));
 parts.push('/* Source font cascade: '+file+' */\n'+faces.join('\n'));
}
for(const file of['components/fieldgrid/content-tabs.css','prototype.css','existing-dashboards.css','finance-sla.css','governance.css']){
 const tree=postcss.parse(await readFile(new URL('../design-reference/sites-v3/platform/src/'+file,import.meta.url),'utf8'));
 tree.walkRules(rule=>{
  let parent=rule.parent;while(parent){if(parent.type==='atrule'&&/keyframes$/i.test(parent.name))return;parent=parent.parent}
  rule.selectors=rule.selectors.map(selector=>selector.includes('.prototype-root')?selector.replaceAll('.prototype-root',root):selector===':root'?root:':where('+root+') '+selector);
  if(rule.selector===root)rule.walkDecls('min-height',decl=>decl.remove());
 });
 parts.push('/* Source: '+file+' */\n'+tree.toString());
}
await writeFile(new URL('../components/fieldgrid/management-cockpit/presentation.css',import.meta.url),'/* Exact Sites 3999c85 declarations; selectors isolated to the authenticated management surface. */\n'+parts.join('\n')+'\n/* The source preview toolbar is excluded from the real workspace. */\n'+root+'{--prototype-toolbar:0px}\n');
