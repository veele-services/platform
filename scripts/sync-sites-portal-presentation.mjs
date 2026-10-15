import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),postcss=require(require.resolve('postcss',{paths:[require.resolve('@tailwindcss/postcss')]}));
// The supplied portal declarations are immutable references. Only selector and
// font-family isolation change; no preview toolbar or prototype state is used.
const root='.sites-portals',parts=[];
for(const file of ['app/globals.css','components/fieldgrid/content-tabs.css','prototype.css','portal-source/staff.css','portal-source/staff-consistency.css','portal-source/customer-portal.css','portal-source/customer-consistency.css','portals-demo.css']){
 const tree=postcss.parse(await readFile(new URL('../design-reference/sites-v3/platform/src/'+file,import.meta.url),'utf8'));
 if(file==='app/globals.css')tree.nodes=tree.nodes.filter(node=>node.type==='atrule'&&node.name==='font-face');
 tree.walkRules(rule=>{
  let parent=rule.parent;while(parent){if(parent.type==='atrule'&&/keyframes$/i.test(parent.name))return;parent=parent.parent}
  rule.selectors=rule.selectors.map(selector=>selector.includes('.prototype-root')?selector.replaceAll('.prototype-root',root):selector===':root'?root:':where('+root+') '+selector);
 });
 parts.push('/* Source: '+file+' */\n'+tree.toString());
}
await writeFile(new URL('../components/fieldgrid/portals/source-presentation.css',import.meta.url),'/* Exact Sites 3999c85 portal declarations; isolated from other workspaces. */\n'+parts.join('\n').replace(/\bPoppins\b/g,'FieldgridSitesPoppins').replace(/\bInter\b/g,'FieldgridSitesInter')+'\n'+root+'{--prototype-toolbar:0px}\n');
