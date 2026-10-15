import {cp,readdir,readFile,realpath} from 'node:fs/promises';
import {join,relative,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

/** Dereferencing pnpm's top-level links relocates packages out of their store
 * lookup context. Materialize the complete traced, single-resolution module
 * set at the resulting runtime lookup root. Never consult workspace modules. */
export async function materializeStandalone(source,destination){
 const root=await realpath(source),target=resolve(destination);
 if(target===root||target.startsWith(root+sep)||root.startsWith(target+sep))throw new Error('Runtime destination must be outside the traced source');
 const directories=async path=>{try{return await readdir(path,{withFileTypes:true})}catch(error){if(error.code==='ENOENT')return[];throw error}};
 const validateLinks=async path=>{for(const entry of await directories(path)){const child=join(path,entry.name);if(entry.isSymbolicLink()){if(!(await realpath(child)).startsWith(root+sep))throw new Error('Runtime link escapes traced root')}else if(entry.isDirectory())await validateLinks(child)}};
 await validateLinks(root);
 const modules=new Map(),moduleRoots=[join(root,'node_modules')],store=join(root,'node_modules','.pnpm');
 for(const entry of await directories(store))if(entry.isDirectory())moduleRoots.push(entry.name==='node_modules'?join(store,entry.name):join(store,entry.name,'node_modules'));
 const add=async(name,path)=>{
  if(!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)||name==='.'||name==='..')throw new Error('Invalid traced runtime module');
  const actual=await realpath(path);
  if(!actual.startsWith(root+sep))throw new Error('Runtime module escapes traced root');
  const metadata=JSON.parse(await readFile(join(actual,'package.json'),'utf8'));
  if(metadata.name!==name)throw new Error('Traced runtime module identity mismatch');
  if(modules.has(name)&&modules.get(name)!==actual)throw new Error('Conflicting traced runtime resolutions for '+name);
  modules.set(name,actual);
 };
 for(const moduleRoot of moduleRoots)for(const entry of await directories(moduleRoot)){
  if(entry.name.startsWith('.')||!entry.isDirectory()&&!entry.isSymbolicLink())continue;
  const path=join(moduleRoot,entry.name);
  if(entry.name.startsWith('@')){for(const child of await directories(path))if(child.isDirectory()||child.isSymbolicLink())await add(entry.name+'/'+child.name,join(path,child.name))}
  else await add(entry.name,path);
 }
 if(!modules.has('next'))throw new Error('Traced Next runtime is missing');
 for(const[name,path]of modules){const output=join(target,'node_modules',name);if(relative(target,output).startsWith('..'))throw new Error('Invalid module output path');await cp(path,output,{recursive:true,dereference:true,preserveTimestamps:true})}
 return modules.size;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const[source,destination]=process.argv.slice(2);if(!source||!destination)throw new Error('Traced source and release destination are required');
 console.log('Traced runtime modules materialized: '+await materializeStandalone(source,destination));
}
