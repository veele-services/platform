import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {createClient} from '@supabase/supabase-js';
import {localWorkOrderTestConfig,workOrderTestDatabase} from './work-order-test-target.mjs';

test('platform identity rejects a revoked session through the real Auth and Data APIs',async()=>{
  const local=localWorkOrderTestConfig();
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  const admin=createClient(local.API_URL,local.SERVICE_ROLE_KEY,options),client=createClient(local.API_URL,local.ANON_KEY,options);
  const db=await workOrderTestDatabase();let userId;
  const clean=r=>assert.equal(Boolean(r.error),false,'Synthetic API operation failed; provider payload intentionally not logged');
  try{
    const email=`${randomUUID()}@platform-security.test`,password=`Fg-${randomUUID()}`;
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});clean(created);userId=created.data.user.id;
    await db.query('insert into public.platform_admins(user_id) values($1)',[userId]);
    const signed=await client.auth.signInWithPassword({email,password});clean(signed);
    clean(await client.auth.getUser());
    let row=await client.from('platform_admins').select('user_id').maybeSingle();clean(row);assert.equal(row.data?.user_id,userId);
    await db.query('delete from auth.sessions where user_id=$1',[userId]);
    // Use the identical unexpired JWT, not a refreshed or replaced session.
    const auth=await client.auth.getUser(signed.data.session.access_token);
    console.log(`Local revoked-session Auth probe: getUser accepts JWT = ${Boolean(auth.data.user&&!auth.error)}`);
    const stale=createClient(local.API_URL,local.ANON_KEY,{...options,global:{headers:{Authorization:`Bearer ${signed.data.session.access_token}`}}});
    row=await stale.from('platform_admins').select('user_id').maybeSingle();clean(row);
    assert.equal(row.data,null,'Platform role must fail closed even while the signed JWT remains unexpired');
  }finally{
    if(userId){await db.query('delete from public.platform_admins where user_id=$1',[userId]);clean(await admin.auth.admin.deleteUser(userId));}
    await db.end();
  }
});
