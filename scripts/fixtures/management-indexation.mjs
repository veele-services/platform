import {randomUUID} from 'node:crypto';
import {slaFixture,seedSlaFixture} from './management-sla.mjs';
export async function seedIndexationFixture(db,overrides={}){
 const f=slaFixture(overrides);await seedSlaFixture(db,f);await db.query('insert into public.tenant_branding(tenant_id) values($1)',[f.tenant]);
 await db.query('begin');try{await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:f.owner,session_id:f.sessions.get(f.owner)})]);const state=(await db.query('select public.cockpit_indexation_query($1) data',[f.tenant])).rows[0].data;await db.query('commit');const contract=state.contracts.find(c=>c.id===f.agreement);f.indexationInput={id:randomUUID(),agreementId:f.agreement,fingerprint:contract.fingerprint,percent:3.2,effective:(Number(state.today.slice(0,4))+1)+'-01-01'};f.today=state.today;return f}catch(e){await db.query('rollback');throw e}
}
// Explicit database-boundary evidence, never an actual file/scanner assertion.
// Browser checks independently use real Storage bytes and the real scanner.
export async function seedIndexationEvidence(db,f){
 const file=randomUUID(),storage=randomUUID(),path=f.tenant+'/'+f.customer+'/'+file.replaceAll('-','')+'.pdf';
 await db.query("insert into storage.objects(id,bucket_id,name,version,metadata) values($1,'customer-documents',$2,'v1','{\"size\":100,\"mimetype\":\"application/pdf\"}')",[storage,path]);
 await db.query('begin');try{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:f.owner,session_id:f.sessions.get(f.owner)})]);await db.query("insert into public.customer_documents(id,tenant_id,customer_id,title,category,storage_path,mime_type,file_name,size_bytes,sha256,created_by) values($1,$2,$3,'FICTITIOUS DB-boundary agreement','other',$4,'application/pdf','FICTITIOUS-proof.pdf',100,repeat('b',64),$5)",[file,f.tenant,f.customer,path,f.owner]);await db.query('commit')}catch(e){await db.query('rollback');throw e}
 await db.query("insert into private.file_scan_receipts(object_id,object_version,sha256,size_bytes,mime_type,engine,database_version,database_at) values($1,'v1',$2,100,'application/pdf','FICTITIOUS-DB-TEST','FICTITIOUS',now())",[storage,'b'.repeat(64)]);
 const evidence=(await db.query("select id from public.dossier_documents where tenant_id=$1 and source_kind='customer' and source_id=$2",[f.tenant,file])).rows[0].id;return{file,evidence,storage};
}
