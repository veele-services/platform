import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {createRequire} from 'node:module';
import test from 'node:test';
import {materializeStandalone} from './materialize-standalone.mjs';
const packageAt=async(path,name,body)=>{await mkdir(path,{recursive:true});await writeFile(join(path,'package.json'),JSON.stringify({name,version:'1.0.0',main:'index.cjs'}));await writeFile(join(path,'index.cjs'),body);return path};
const link=async(target,path)=>{await mkdir(join(path,'..'),{recursive:true});await symlink(relative(join(path,'..'),target),path,'dir')};
async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'fieldgrid-traced-runtime-'));try{await fn(root)}finally{await rm(root,{recursive:true,force:true})}}
test('standalone trace materializes transitive pnpm runtime without a hoist directory',()=>fixture(async root=>{
 const source=join(root,'workspace','.next','standalone'),modules=join(source,'node_modules'),store=join(modules,'.pnpm'),dest=join(root,'release');
 const next=await packageAt(join(store,'next@1','node_modules','next'),'next',"module.exports=require('@fixture/helper')"),helper=await packageAt(join(store,'helper@1','node_modules','@fixture','helper'),'@fixture/helper',"module.exports=require('leaf')"),leaf=await packageAt(join(store,'leaf@1','node_modules','leaf'),'leaf',"module.exports='actual transitive runtime'");
 await link(next,join(modules,'next'));await link(helper,join(store,'next@1','node_modules','@fixture','helper'));await link(leaf,join(store,'helper@1','node_modules','leaf'));
 await packageAt(join(root,'workspace','node_modules','untraced'),'untraced',"module.exports='must not be copied'");
 assert.equal(await materializeStandalone(source,dest),3);assert.equal(createRequire(join(dest,'server.cjs'))('next'),'actual transitive runtime');assert.equal((await lstat(join(dest,'node_modules','next'))).isSymbolicLink(),false);await assert.rejects(lstat(join(dest,'node_modules','untraced')),e=>e.code==='ENOENT');
}));
test('standalone trace supports a flat runtime tree',()=>fixture(async root=>{const source=join(root,'trace'),dest=join(root,'release');await packageAt(join(source,'node_modules','next'),'next',"module.exports='flat runtime'");assert.equal(await materializeStandalone(source,dest),1);assert.equal(createRequire(join(dest,'server.cjs'))('next'),'flat runtime')}));
test('conflicting traced package resolutions fail before writing the release',()=>fixture(async root=>{const source=join(root,'trace'),dest=join(root,'release');await packageAt(join(source,'node_modules','next'),'next',"module.exports='next'");for(const id of['one','two'])await packageAt(join(source,'node_modules','.pnpm',id,'node_modules','dependency'),'dependency',"module.exports='"+id+"'");await assert.rejects(materializeStandalone(source,dest),/Conflicting traced runtime resolutions/);await assert.rejects(lstat(dest),e=>e.code==='ENOENT')}));
test('an escaping nested file link is refused before dereferencing package content',()=>fixture(async root=>{const source=join(root,'trace'),dest=join(root,'release'),next=await packageAt(join(source,'node_modules','next'),'next',"module.exports='next'");const outside=join(root,'outside-fixture.txt');await writeFile(outside,'synthetic outside content');await symlink(relative(next,outside),join(next,'nested.txt'));await assert.rejects(materializeStandalone(source,dest),/link escapes traced root/);await assert.rejects(lstat(dest),e=>e.code==='ENOENT')}));
