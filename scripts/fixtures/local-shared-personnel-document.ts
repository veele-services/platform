import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {uploadScannedFile} from '../../lib/files/scanned-storage';
/** Local browser fixture, exercising the pre-existing authenticated shared-file
 * path. A confidential dossier document is never converted or made public. */
async function main(){
 const path=process.argv[2];if(!/^\/tmp\/fieldgrid-source-staff-document-[a-f0-9-]+\.json$/.test(path??''))throw Error();
 const p=JSON.parse(await readFile(path,'utf8'));if(!String(p.email).endsWith('@source-staff-owner.invalid')||process.env.SUPABASE_URL!=='http://127.0.0.1:60321'||process.env.DEPLOY_TARGET!=='local')throw Error();
 const client=createClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}),signed=await client.auth.signInWithPassword({email:p.email,password:'Fieldgrid-E2E-2026'});if(signed.error||signed.data.user?.id!==p.actor)throw Error();
 const bytes=new Uint8Array(await readFile(p.file)),storage=`${p.tenant}/${p.person}/${p.id}.pdf`;
 await uploadScannedFile(client,'personnel-documents',storage,bytes,'application/pdf');
 const result=await client.from('personnel_documents').insert({id:p.id,tenant_id:p.tenant,personnel_id:p.person,title:p.title,document_type:'instruction',storage_path:storage,visible_to_employee:true,dossier_managed:false,created_by:p.actor,file_name:'FICTITIOUS-safety-instruction.pdf',mime_type:'application/pdf',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});if(result.error)throw Error();
 console.log('Native scanner, current owner upload authorization and shared personnel document publication succeeded.');await client.auth.signOut({scope:'local'});
}
main().catch(()=>{console.error('Local native shared-document fixture failed; credentials are not logged.');process.exitCode=1});
