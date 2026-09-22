import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hash, textHash, uuid, requireThat, fail, MAX_OBJECTS, MAX_BYTES, Wp1Error } from './contract.mjs';

const PAGE_SIZE = 100;
const BATCH_SIZE = 50;
const BUCKETS = Object.freeze(['documents','assignment-photos','personnel-avatars']);
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
const terminal = new Set(['paid','failed','canceled','expired']);
function validPath(path) {
  return typeof path==='string' && path.length<=1024 && path.length>0 && !/[\\\u0000-\u001f\u007f]/.test(path)
    && !path.includes('://') && path.split('/').every(part=>part.length>0 && part!=='.' && part!=='..');
}
function descriptor(bucket,path,item) {
  requireThat(BUCKETS.includes(bucket) && validPath(path) && typeof item.id==='string' && item.id.length<=128,'STORAGE_DESCRIPTOR');
  const size=Number(item.metadata?.size);
  requireThat(Number.isSafeInteger(size)&&size>=0&&size<=MAX_BYTES,'STORAGE_SIZE');
  requireThat(typeof item.updated_at==='string'&&Number.isFinite(Date.parse(item.updated_at)),'STORAGE_VERSION');
  return {bucket,path,id:item.id,updatedAt:item.updated_at,size,contentType:typeof item.metadata?.mimetype==='string'?item.metadata.mimetype:'application/octet-stream'};
}
export async function providerCall(operation,{allow404=false,sleep=wait}={}) {
  for(let attempt=0;attempt<3;attempt++) {
    let result;
    try { result=await operation(); } catch { if(attempt===2) fail('PROVIDER_NETWORK'); await sleep(250*(2**attempt)); continue; }
    requireThat(result!==null&&typeof result==='object','PROVIDER_RESPONSE');
    if(!result.error) return result;
    const status=Number(result.error.status ?? result.error.statusCode);
    if(allow404&&status===404) return {data:null,missing:true};
    if([429,500,502,503,504].includes(status)&&attempt<2) {await sleep(250*(2**attempt));continue;}
    // Never interpolate provider messages, URLs, keys or account metadata.
    fail(status===404?'PROVIDER_NOT_FOUND':'PROVIDER_FAILED');
  }
  fail('PROVIDER_FAILED');
}
function strings(value,result=new Set()) {
  if(typeof value==='string') result.add(value);
  else if(Array.isArray(value)) for(const item of value) strings(item,result);
  else if(value&&typeof value==='object') for(const item of Object.values(value)) strings(item,result);
  return result;
}
export function storageSelection(inventory,all,publicOrigin) {
  const referenced=new Set();
  const add=(bucket,path)=>{if(validPath(path)) referenced.add(`${bucket}/${path}`);};
  for(const row of inventory.data.documents) add('documents',row.storage_path);
  for(const table of ['assignment_photos','assignment_checklist_evidence','assignment_report_note_attachments']) {
    for(const row of inventory.data[table]) add('assignment-photos',row.storage_path);
  }
  for(const row of inventory.data.personnel) add('personnel-avatars',row.avatar_path);
  const tenants=new Set(inventory.data.tenants.map(row=>row.id));
  const assignments=new Map(inventory.data.assignments.map(row=>[row.id,row.tenant_id]));
  const preserved=new Set();
  for(const [name,rows] of Object.entries(inventory.data)) {
    if(inventory.order.includes(name)) continue;
    for(const value of strings(rows)) {
      preserved.add(value);
      if(value.startsWith(`${publicOrigin}/storage/v1/object/`)) {
        try {const u=new URL(value); const parts=decodeURIComponent(u.pathname).split('/');
          if(['public','sign','authenticated'].includes(parts[4])) preserved.add(parts.slice(5).join('/'));
        } catch { fail('PRESERVED_STORAGE_REFERENCE'); }
      }
    }
  }
  return all.filter(item=>{
    const key=`${item.bucket}/${item.path}`;
    if(preserved.has(key)||preserved.has(item.path)) return false;
    if(referenced.has(key)) {
      // Canonical and legacy paths must still be bound to a known tenant or
      // work order. Malformed old test references are removed only as DB rows.
      const p=item.path.split('/');
      return (p[0]==='tenant'&&tenants.has(p[1])) || tenants.has(p[0])
        || (p[0]==='tenants'&&tenants.has(p[1]))
        || (item.bucket==='assignment-photos'&&(assignments.has(p[0])||(p[0]==='assignments'&&assignments.has(p[1]))));
    }
    const p=item.path.split('/');
    if(p[0]!=='tenant'||!tenants.has(p[1])) return false;
    if(item.bucket==='documents') return p[2]==='documents';
    return item.bucket==='assignment-photos'&&p[2]==='assignments'&&assignments.get(p[3])===p[1];
  });
}

export function createProviderAdapter(admin,{origin,sleep=wait}={}) {
  const call=(operation,options={})=>providerCall(operation,{sleep,...options});
  async function authIdentitySnapshot() {
    const ids=[];const seen=new Set();
    for(let page=1;page<=100;page++) {
      const result=await call(()=>admin.auth.admin.listUsers({page,perPage:PAGE_SIZE}));
      requireThat(Array.isArray(result.data?.users),'AUTH_RESPONSE');
      for(const user of result.data.users) {
        requireThat(uuid(user.id)&&!seen.has(user.id),'AUTH_IDENTITY');
        seen.add(user.id);ids.push(user.id);
      }
      if(result.data.users.length<PAGE_SIZE) return ids.sort();
    }
    fail('AUTH_INVENTORY_LIMIT');
  }
  async function allObjects() {
    const objects=[],seen=new Set();let requests=0;
    async function walk(bucket,prefix,depth) {
      requireThat(depth<=16,'STORAGE_DEPTH');
      for(let offset=0;;offset+=PAGE_SIZE) {
        requireThat(++requests<=2000,'STORAGE_REQUEST_LIMIT');
        const result=await call(()=>admin.storage.from(bucket).list(prefix,{limit:PAGE_SIZE,offset,sortBy:{column:'name',order:'asc'}}));
        requireThat(Array.isArray(result.data)&&result.data.length<=PAGE_SIZE,'STORAGE_RESPONSE');
        for(const item of result.data) {
          requireThat(typeof item?.name==='string'&&!item.name.includes('/')&&validPath(item.name),'STORAGE_NAME');
          const path=prefix?`${prefix}/${item.name}`:item.name;
          const key=`${bucket}/${path}`;
          requireThat(!seen.has(key),'STORAGE_DUPLICATE');seen.add(key);
          if(item.id===null) await walk(bucket,path,depth+1);
          else {objects.push(descriptor(bucket,path,item));requireThat(objects.length<=MAX_OBJECTS,'STORAGE_INVENTORY_LIMIT');}
        }
        if(result.data.length<PAGE_SIZE) break;
      }
    }
    for(const bucket of BUCKETS) await walk(bucket,'',0);
    return objects.sort((a,b)=>`${a.bucket}/${a.path}`.localeCompare(`${b.bucket}/${b.path}`));
  }
  async function inventory(database) {
    const authIds=await authIdentitySnapshot();
    requireThat(authIds.includes(database.context.adminId),'ADMIN_AUTH_MISSING');
    // Keep existing login identities and authorization configuration. Deleting
    // operational test profiles does not require deleting provider accounts.
    // This avoids irreversible Auth deletion and preserves old token identities;
    // no deleted identity is ever reassigned to newly seeded personnel.
    const all=await allObjects();
    const selected=storageSelection(database,all,origin);
    return {authIds,all,selected,authDigest:hash(authIds),storageDigest:hash(all),selectionDigest:hash(selected),retainedAuthCount:authIds.length};
  }
  async function download(item) {
    const result=await call(()=>admin.storage.from(item.bucket).download(item.path));
    requireThat(typeof result.data?.arrayBuffer==='function','STORAGE_DOWNLOAD_RESPONSE');
    const buffer=Buffer.from(await result.data.arrayBuffer());
    requireThat(buffer.length===item.size&&buffer.length<=MAX_BYTES,'STORAGE_DOWNLOAD_SIZE');
    return buffer;
  }
  async function backupObjects(items,directory) {
    await mkdir(directory,{recursive:true,mode:0o700});
    let total=0;const result=[];
    for(const item of items) {
      const bytes=await download(item);total+=bytes.length;
      requireThat(total<=256*1024*1024,'STORAGE_BACKUP_LIMIT');
      const file=hash({bucket:item.bucket,path:item.path});
      await writeFile(join(directory,file),bytes,{flag:'wx',mode:0o600});
      result.push({...item,file,sha256:textHash(bytes)});
    }
    return result;
  }
  async function removeObjects(expected,fullExpected) {
    requireThat(hash(await allObjects())===hash(fullExpected),'STORAGE_INVENTORY_DRIFT');
    for(const bucket of BUCKETS) {
      const paths=expected.filter(item=>item.bucket===bucket).map(item=>item.path);
      for(let index=0;index<paths.length;index+=BATCH_SIZE) {
        await call(()=>admin.storage.from(bucket).remove(paths.slice(index,index+BATCH_SIZE)));
      }
    }
    const remaining=await allObjects();
    const removed=new Set(expected.map(item=>`${item.bucket}/${item.path}`));
    requireThat(!remaining.some(item=>removed.has(`${item.bucket}/${item.path}`)),'STORAGE_DELETE_INCOMPLETE');
    const retained=fullExpected.filter(item=>!removed.has(`${item.bucket}/${item.path}`));
    requireThat(hash(remaining)===hash(retained),'STORAGE_RETAINED_DRIFT');
  }
  async function restoreObjects(backups,directory) {
    const current=await allObjects();const byKey=new Map(current.map(item=>[`${item.bucket}/${item.path}`,item]));
    for(const item of backups) {
      const bytes=await readFile(join(directory,item.file));
      requireThat(textHash(bytes)===item.sha256,'STORAGE_BACKUP_CHANGED');
      const present=byKey.get(`${item.bucket}/${item.path}`);
      if(present) {
        requireThat(textHash(await download(present))===item.sha256,'STORAGE_RESTORE_CONFLICT');
        continue;
      }
      await call(()=>admin.storage.from(item.bucket).upload(item.path,bytes,{upsert:false,contentType:item.contentType}));
      const restored=await call(()=>admin.storage.from(item.bucket).download(item.path));
      requireThat(typeof restored.data?.arrayBuffer==='function'&&textHash(Buffer.from(await restored.data.arrayBuffer()))===item.sha256,'STORAGE_RESTORE_FAILED');
    }
  }
  return {inventory,authIdentitySnapshot,allObjects,backupObjects,removeObjects,restoreObjects};
}

export async function verifyTestPayments(database,keys,request=fetch) {
  let count=0;
  for(const row of database.data.payments) {
    if(row.payment_method!=='mollie'&&!row.mollie_payment_id) continue;
    requireThat(row.provider_mode==='test'&&/^tr_[A-Za-z0-9]+$/.test(row.mollie_payment_id??''),'PAYMENT_NOT_TEST');
    const key=keys?.[row.tenant_id];
    requireThat(typeof key==='string'&&/^test_[A-Za-z0-9]+$/.test(key),'MOLLIE_TEST_KEY_REQUIRED');
    let response,body;
    try {
      response=await request(`https://api.mollie.com/v2/payments/${row.mollie_payment_id}`,{headers:{Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(15000)});
      requireThat(response.ok,'PAYMENT_PROVIDER_UNAVAILABLE');body=await response.json();
    } catch(error) {if(error instanceof Wp1Error) throw error;fail('PAYMENT_PROVIDER_UNAVAILABLE');}
    requireThat(body.id===row.mollie_payment_id&&body.mode==='test','PAYMENT_PROVIDER_MISMATCH');
    // Provider truth is authoritative for staging cleanup. A stale local
    // webhook/provider_status may lag behind, but an active provider payment
    // must never be deleted by WP1.
    requireThat(terminal.has(body.status),'PAYMENT_PROVIDER_ACTIVE');
    const cents=typeof body.amount?.value==='string'&&/^\d+\.\d{2}$/.test(body.amount.value)?Number(body.amount.value.replace('.','')):NaN;
    requireThat(Number.isSafeInteger(cents)&&cents===row.amount_cents&&body.amount.currency===row.currency,'PAYMENT_AMOUNT_MISMATCH');
    if(row.provider_profile_id) requireThat(body.profileId===row.provider_profile_id,'PAYMENT_PROFILE_MISMATCH');
    for(const [key,value] of Object.entries(row.expected_provider_metadata??{})) requireThat(body.metadata?.[key]===value,'PAYMENT_METADATA_MISMATCH');
    count++;
  }
  return count;
}
