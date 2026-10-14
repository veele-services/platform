import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative,sep} from 'node:path';
const manifest=JSON.parse(readFileSync('docs/integration/sites-v3/SOURCE-MANIFEST.json','utf8'));
const expected={platform:'3999c85b76aecf729f3b2bba86e1535255915848',marketing:'c78377808dc560f4b8c2288b69dfe504845d8c94'};
let count=0;
for(const source of manifest.sources){
 if(source.commit_sha!==expected[source.name])throw new Error('Unexpected Sites reference version');
 const root=resolve('design-reference/sites-v3',source.name);
 for(const file of source.files){
  const path=resolve(root,file.path);if(relative(root,path).startsWith('..'+sep)||path===root)throw new Error('Invalid reference path');
  const bytes=readFileSync(path),sha=createHash('sha256').update(bytes).digest('hex'),blob=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if(bytes.length!==file.bytes||sha!==file.sha256||blob!==file.git_blob_sha1)throw new Error(`Changed Sites reference: ${source.name}/${file.path}`);
  count++;
 }
}
if(count!==279)throw new Error('Incomplete Sites reference');
console.log(`Sites source verified: ${count} byte-identical files, both pinned commits.`);
