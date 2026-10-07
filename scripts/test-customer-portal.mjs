import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { localWorkOrderTestUrl } from "./work-order-test-target.mjs";

test("customer portal has explicit bootstrap identity and independent exact object scope", async (t) => {
 const db=new pg.Client({connectionString:localWorkOrderTestUrl()});await db.connect();await db.query("begin");
 const tenant=randomUUID(),foreignTenant=randomUUID(),manager=randomUUID(),foreignManager=randomUUID(),alice=randomUUID(),bob=randomUUID();
 const customer=randomUUID(),otherCustomer=randomUUID(),foreignCustomer=randomUUID(),contact=randomUUID(),otherContact=randomUUID(),foreignContact=randomUUID();
 const object=randomUUID(),unboundObject=randomUUID(),foreignObject=randomUUID(),order=randomUUID();
 const sessions=new Map([manager,foreignManager,alice,bob].map(user=>[user,randomUUID()]));
 let account,otherAccount;
 const call=async(sql,args=[],user=alice,role="authenticated")=>{
  await db.query("savepoint customer_portal_test");
  try{
   await db.query(`set local role ${role}`);
   await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,session_id:sessions.get(user),role})]);
   const result=await db.query(sql,args);await db.query("reset role");await db.query("select set_config('request.jwt.claims','{}',true)");
   await db.query("release savepoint customer_portal_test");return result.rows;
  }catch(error){await db.query("rollback to savepoint customer_portal_test");await db.query("release savepoint customer_portal_test");throw error;}
 };
 const bind=(c,u,ct,v=0,enabled=true,actor=manager)=>call("select public.customer_portal_bind($1,$2,$3,$4,$5,true,true,true,$6) id",[tenant,c,u,ct,v,enabled],actor);
 const workspace=(a=account,target=tenant,user=alice)=>call("select public.customer_portal_workspace($1,$2) data",[target,a],user).then(rows=>rows[0].data);
 const deny=(promise)=>assert.rejects(promise,error=>error.code==="42501");
 try{
  for(const [user,session] of sessions){
   await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[user,`${user}@customer-portal-fixture.invalid`]);
   await db.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())",[session,user]);
  }
  for(const id of [tenant,foreignTenant]){
   await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS portal supplier')",[id,`portal-${id}`]);
   await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','finance','rapportage','tickets'])",[id]);
  }
  for(const [ten,user] of [[tenant,manager],[foreignTenant,foreignManager]])await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['management']::public.app_role[],'active')",[ten,user]);
  for(const [id,ten,name] of [[customer,tenant,"FICTITIOUS Alice organisation"],[otherCustomer,tenant,"FICTITIOUS Bob organisation"],[foreignCustomer,foreignTenant,"FOREIGN CUSTOMER CANARY"]])await db.query("insert into public.customers(id,tenant_id,customer_number,name,billing_email,preferences) values($1,$2,$1::uuid::text,$3,'billing@customer-portal-fixture.invalid','INTERNAL CRM CANARY')",[id,ten,name]);
  for(const [id,ten,c,name] of [[contact,tenant,customer,"FICTITIOUS Alice"],[otherContact,tenant,otherCustomer,"FICTITIOUS Bob"],[foreignContact,foreignTenant,foreignCustomer,"FOREIGN CONTACT CANARY"]])await db.query("insert into public.customer_contacts(id,tenant_id,customer_id,full_name,email,phone) values($1,$2,$3,$4,$5,'0301234567')",[id,ten,c,name,`${alice}@customer-portal-fixture.invalid`]);
  await t.test("a shared contact email grants nothing; management binds the exact user/customer before an object",async()=>{
   assert.deepEqual((await call("select public.customer_portal_accounts($1) data",[tenant]))[0].data,[]);
   await deny(bind(customer,alice,contact,0,true,alice));await deny(bind(customer,alice,contact,0,true,foreignManager));
   await assert.rejects(bind(customer,alice,contact,null),error=>error.code==="40001");
   account=(await bind(customer,alice,contact))[0].id;otherAccount=(await bind(otherCustomer,bob,otherContact))[0].id;
   for(const invalidVersion of [null,-1,0])await assert.rejects(bind(customer,alice,contact,invalidVersion),error=>error.code==="40001");
   assert.deepEqual((await call("select public.customer_portal_accounts($1) data",[tenant]))[0].data,[{id:account,name:"FICTITIOUS Alice organisation"}]);
   await assert.rejects(bind(customer,alice,otherContact,1),error=>error.code==="23514");
   await deny(call("update public.customer_portal_accounts set can_create_objects=true where id=$1",[otherAccount]));
   await deny(call("select created_by,onboarding_draft from public.customer_portal_accounts"));
   assert.equal((await call("select id from public.customer_portal_accounts")).length,1);
   const preferences=(await call("select public.customer_portal_preferences($1,$2) data",[tenant,account]))[0].data;
   assert.deepEqual(Object.keys(preferences.groups).sort(),["appointments","invoices","news","reports","tickets"]);assert.equal(preferences.version,0);
   await deny(call("select public.customer_portal_preferences($1,$2)",[tenant,otherAccount]));
  });
  for(const [id,ten,c,name] of [[object,tenant,customer,"FICTITIOUS own site"],[unboundObject,tenant,customer,"UNBOUND OBJECT CANARY"],[foreignObject,foreignTenant,foreignCustomer,"FOREIGN OBJECT CANARY"]])await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address,access_instructions) values($1,$2,$3,$1::uuid::text,$4,'{\"street\":\"Teststraat 1\",\"postal_code\":\"1234 AB\",\"city\":\"Teststad\"}','PRIVATE VAULT CANARY')",[id,ten,c,name]);
  await db.query("insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by,manage_secrets) values($1,$2,$3,$4,true)",[tenant,object,alice,manager]);
  await db.query("insert into public.object_records(tenant_id,object_id,kind,title,body,state,instruction_type,starts_at,customer_visible,created_by,updated_by) values($1,$2,'instruction','Fictitious public instruction','FICTITIOUS visible instruction','active','fixed',now(),true,$3,$3),($1,$2,'instruction','Hidden instruction','INTERNAL INSTRUCTION CANARY','active','fixed',now(),false,$3,$3)",[tenant,object,manager]);
  await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,'INTERNAL EMPLOYEE CANARY')",[randomUUID(),tenant,manager]);
  await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,published_at,planning_state,created_by) values($1,$2,$3,$4,'FICTITIOUS-PORTAL','Onderhoud','released',now(),now()+interval '1 hour',now(),now()+interval '1 hour',now(),'final',$5)",[order,tenant,customer,object,manager]);
  await t.test("OTP branding uses only a live authorized server request, survives a platform redirect and prevents cross-tenant races",async()=>{
   const slug=`portal-${tenant}`,email=`${alice}@customer-portal-fixture.invalid`;
   const prepare=(target=slug)=>call("select public.email_auth_login_prepare($1,$2) id",[target,email],manager,"service_role");
   await deny(call("select public.email_auth_login_prepare($1,$2)",[slug,email]));
   await deny(prepare(`portal-${foreignTenant}`));
   const id=(await prepare())[0].id;assert.ok(id);assert.equal((await prepare())[0].id,null);
   const resolve=(target=null,hook="fictitious-hook")=>call("select public.email_auth_login_resolve($1,$2,$3) slug",[alice,target,hook],manager,"service_role");
   assert.equal((await resolve())[0].slug,slug);assert.equal((await resolve())[0].slug,slug);
   await deny(resolve(`portal-${foreignTenant}`));await deny(resolve(null,"other-hook"));
   const context=(await call("select public.email_auth_context($1,$2,$3,'magiclink') data",[slug,alice,email],manager,"service_role"))[0].data;
   assert.equal(context.tenant_id,tenant);assert.equal(context.company,"FICTITIOUS portal supplier");
   await db.query("update public.customer_contacts set active=false where id=$1",[contact]);
   await deny(prepare());await db.query("update public.customer_contacts set active=true where id=$1",[contact]);
   const platform=(await prepare(null))[0].id;assert.ok(platform);assert.equal((await resolve(null,"platform-hook"))[0].slug,null);
   await deny(call("select * from private.email_login_brand_requests"));
  });
  await t.test("workspace allowlist excludes other customers, unbound objects, vault capability and internal identity fields",async()=>{
   const data=await workspace();assert.deepEqual(data.objects.map(o=>o.id),[object]);assert.deepEqual(data.visits.map(v=>v.id),[order]);
   assert.equal(data.profile.fullName,"FICTITIOUS Alice");assert.equal(data.objects[0].instructions[0].author,"FICTITIOUS portal supplier");
   const serialized=JSON.stringify(data);
   for(const forbidden of ["FOREIGN","UNBOUND OBJECT CANARY","INTERNAL","PRIVATE VAULT CANARY",manager,"manageSecrets","manage_secrets","created_by","owner_user_id","storage_path","review_note","needsReview","response"])assert.equal(serialized.includes(forbidden),false,`Customer DTO excludes ${forbidden}`);
   await deny(workspace(otherAccount));await deny(workspace(account,foreignTenant));await deny(workspace(account,tenant,bob));
   await deny(call("select public.customer_portal_workspace($1,$2)",[tenant,account],alice,"anon"));
  });
  await t.test("legacy binding creates identity only and never silently grants self-service",async()=>{
   await db.query("insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by) values($1,$2,$3,$4)",[tenant,object,bob,manager]);
   const rows=(await db.query("select can_create_objects,can_edit_objects,can_edit_profile,onboarding_completed_at from public.customer_portal_accounts where tenant_id=$1 and customer_id=$2 and user_id=$3",[tenant,customer,bob])).rows;
   assert.equal(rows.length,1);assert.equal(rows[0].can_create_objects,false);assert.equal(rows[0].can_edit_objects,false);assert.equal(rows[0].can_edit_profile,false);assert.ok(rows[0].onboarding_completed_at);
  });
  await t.test("five email groups persist in central preferences with revision conflicts and own-account replay checks",async()=>{
   const groups={appointments:true,reports:false,invoices:true,tickets:false,news:false},key=randomUUID();
   const save=(value=groups,version=0,id=key,target=account)=>call("select public.customer_portal_preferences_save($1,$2,$3,$4,$5) data",[tenant,target,version,value,id]).then(rows=>rows[0].data);
   await deny(save(groups,0,randomUUID(),otherAccount));
   await assert.rejects(save({...groups,userId:bob},0,randomUUID()),error=>error.code==="23514");
   const result=await save();assert.equal(result.preferenceVersion,1);assert.deepEqual(await save(),result);
   assert.deepEqual((await call("select public.customer_portal_preferences($1,$2) data",[tenant,account]))[0].data,{version:1,groups});
   const rows=(await db.query("select type_code,email from private.notification_preferences where tenant_id=$1 and user_id=$2 and context='customer' and type_code in('customer.report_available','customer.ticket_changed','manual.tenant','invoice.available') order by type_code",[tenant,alice])).rows;
   assert.deepEqual(Object.fromEntries(rows.map(row=>[row.type_code,row.email])),{"customer.report_available":false,"customer.ticket_changed":false,"invoice.available":true,"manual.tenant":false});
   await assert.rejects(save(groups,0,randomUUID()),error=>error.code==="40001");
   await db.query("update public.customer_portal_accounts set active=false where id=$1",[account]);try{await deny(save());}finally{await db.query("update public.customer_portal_accounts set active=true where id=$1",[account]);}
  });
  await t.test("coarse revisions expose only current own-account invalidation, never rich rows or client writes",async()=>{
   const revision=()=>call("select * from public.customer_portal_revisions order by account_id");
   const rows=await revision();assert.equal(rows.length,1);assert.equal(rows[0].account_id,account);assert.equal(rows[0].tenant_id,tenant);assert.deepEqual(Object.keys(rows[0]).sort(),["account_id","changed_at","revision","tenant_id"]);
   for(const sql of ["update public.customer_portal_revisions set revision=100 where account_id=$1","delete from public.customer_portal_revisions where account_id=$1"])
    await deny(call(sql,[account]));
   await deny(call("insert into public.customer_portal_revisions(tenant_id,account_id) values($1,$2)",[tenant,account]));
   await deny(call("select private.customer_revision_bump($1,$2)",[tenant,account]));
   await deny(call("select * from public.customer_portal_revisions",[],alice,"anon"));
   assert.equal((await call("select * from public.customer_portal_revisions where account_id=$1",[otherAccount])).length,0);
   const before=Number(rows[0].revision);await db.query("update public.customer_portal_accounts set version=version+1 where id=$1",[account]);assert.ok(Number((await revision())[0].revision)>before);
   await db.query("update public.customer_contacts set active=false where id=$1",[contact]);try{assert.deepEqual(await revision(),[]);}finally{await db.query("update public.customer_contacts set active=true where id=$1",[contact]);}
   await db.query("update public.customer_portal_accounts set active=false where id=$1",[account]);try{assert.deepEqual(await revision(),[]);}finally{await db.query("update public.customer_portal_accounts set active=true where id=$1",[account]);}
  });
  await t.test("public object changes invalidate exact customer accounts but vault and unbound activity do not",async()=>{
   const revision=async(id=account)=>Number((await db.query("select revision from public.customer_portal_revisions where tenant_id=$1 and account_id=$2",[tenant,id])).rows[0].revision);
   const initial=await revision(),otherInitial=await revision(otherAccount);
   await db.query("update public.objects set access_instructions='PRIVATE REPLACEMENT CANARY' where id=$1",[object]);
   assert.equal(await revision(),initial,"Vault-only changes must not generate a customer signal");
   await db.query("update public.objects set name='UNBOUND CHANGED CANARY' where id=$1",[unboundObject]);
   assert.equal(await revision(),initial,"An unbound object must not generate a customer signal");
   await db.query("update public.objects set name='FICTITIOUS changed visible site' where id=$1",[object]);
   assert.ok(await revision()>initial,"A projected public object change must invalidate its exact bound account");
   assert.equal(await revision(otherAccount),otherInitial,"A different customer account must not learn the change");
   const visible=await revision();
   await db.query("update public.object_customer_bindings set manage_secrets=false where tenant_id=$1 and object_id=$2 and user_id=$3",[tenant,object,alice]);
   assert.equal(await revision(),visible,"The general portal never signals private vault capability changes");
   await db.query("update public.object_customer_bindings set active=false where tenant_id=$1 and object_id=$2 and user_id=$3",[tenant,object,alice]);
   assert.ok(await revision()>visible,"Removing a binding invalidates the old object's visible scope");
   assert.equal((await workspace()).objects.length,0);
   await db.query("update public.object_customer_bindings set active=true,manage_secrets=true where tenant_id=$1 and object_id=$2 and user_id=$3",[tenant,object,alice]);
   assert.equal((await workspace()).objects.length,1);
   await db.query("update public.objects set access_instructions='PRIVATE VAULT CANARY' where id=$1",[object]);
   await deny(call("select private.customer_revision_for_object($1,$2,$3)",[tenant,customer,object]));
  });
  await t.test("four-step onboarding resumes and atomically creates one first object without resetting any history",async()=>{
   const before=await workspace(otherAccount,tenant,bob),first={version:0,name:"FICTITIOUS Bob first site",type:"office",size:200,street:"Teststraat 20",postalCode:"1234 AB",city:"Teststad",contact:"FICTITIOUS Bob Updated",phone:"0301234567",contactVersion:0,contactRecordVersion:0,instruction:"FICTITIOUS first-site instruction"};
   const base={mode:"save",expectedVersion:before.account.version,customerVersion:before.profile.customerVersion,contactVersion:before.profile.contactVersion,preferenceVersion:0,step:0,
    contact:{firstName:"FICTITIOUS",lastName:"Bob Updated",company:"FICTITIOUS Bob updated organisation",phone:"0301234567"},object:null,preferences:{appointments:true,reports:false,invoices:true,tickets:true,news:false},confirmed:false};
   const save=(input,key=randomUUID(),user=bob,target=otherAccount)=>call("select public.customer_portal_onboarding_save($1,$2,$3,$4) data",[tenant,target,input,key],user).then(rows=>rows[0].data);
   const draft=(user=bob,target=otherAccount)=>call("select public.customer_portal_draft($1,$2) data",[tenant,target],user).then(rows=>rows[0].data);
   await deny(save(base,randomUUID(),alice));await deny(draft(alice));
   await assert.rejects(save({...base,step:2}),error=>error.code==="23514");
   await assert.rejects(save({...base,contact:{...base.contact,email:"FORGED"}}),error=>error.code==="23514");
   const firstKey=randomUUID(),one=await save(base,firstKey);assert.equal(one.step,1);assert.deepEqual(await save(base,firstKey),one);
   assert.equal((await draft()).contact.company,base.contact.company);assert.equal((await workspace(otherAccount,tenant,bob)).profile.company,before.profile.company,"Saving a draft does not prematurely update CRM");
   const two=await save({...base,expectedVersion:one.accountVersion,step:1,object:first});assert.equal(two.step,2);
   const three=await save({...base,expectedVersion:two.accountVersion,step:2,object:first});assert.equal(three.step,3);
   const resumed=await draft();assert.equal(resumed.step,3);assert.equal(resumed.object.name,first.name);assert.deepEqual(resumed.preferences,base.preferences);
   assert.deepEqual(Object.keys(resumed).sort(),["contact","object","preferences","step","version"]);
   for(const forbidden of ["customerVersion","preferenceVersion","_sources","input_hash","user_id","email"])assert.equal(JSON.stringify(resumed).includes(forbidden),false);
   const objectsBefore=(await db.query("select count(*)::int n from public.objects where tenant_id=$1",[tenant])).rows[0].n;
   await db.query("update public.customers set phone='0309999999',version=version+1 where id=$1",[otherCustomer]);
   const changed=await workspace(otherAccount,tenant,bob);
   const changedInput={...base,expectedVersion:three.accountVersion,customerVersion:changed.profile.customerVersion,step:3,object:first};
   await assert.rejects(save(changedInput),error=>error.code==="40001","Fresh versions alone cannot silently rebase an existing draft");
   await assert.rejects(save({...changedInput,mode:"review"}),error=>error.code==="23514");
   const reviewed=await save({...changedInput,mode:"review",confirmed:true});assert.equal(reviewed.step,3);
   assert.equal((await draft()).contact.company,base.contact.company,"Explicit review preserves the editable draft");
   const complete={...changedInput,mode:"complete",expectedVersion:reviewed.accountVersion,confirmed:true},key=randomUUID();
   await assert.rejects(save({...complete,object:{...first,size:0}}),error=>error.code==="23514");
   assert.equal((await workspace(otherAccount,tenant,bob)).profile.company,before.profile.company,"A failure after contact update rolls the whole completion back");
   const result=await save(complete,key);assert.equal(result.completed,true);assert.ok(result.objectId);assert.deepEqual(await save(complete,key),result);
   const after=await workspace(otherAccount,tenant,bob);assert.equal(after.objects.length,1);assert.equal(after.objects[0].id,result.objectId);assert.equal(after.profile.company,base.contact.company);assert.ok(after.account.onboardingCompletedAt);
   assert.equal((await db.query("select count(*)::int n from public.objects where tenant_id=$1",[tenant])).rows[0].n,objectsBefore+1);
   assert.equal((await db.query("select count(*)::int n from public.work_orders where tenant_id=$1 and id=$2",[tenant,order])).rows[0].n,1,"Other accounts' visit history is untouched");
   await assert.rejects(save({...complete,expectedVersion:result.accountVersion}),error=>error.code==="23514");
  });
  await t.test("explicit profile editing is own-account only, versioned, idempotent and never changes login email",async()=>{
   const before=await workspace(),input={firstName:"FICTITIOUS",lastName:"Alice Updated",company:"FICTITIOUS updated organisation",phone:"0301234568",invoiceEmail:"invoices@customer-portal-fixture.invalid",street:"Teststraat 2",postalCode:"1234 AC",city:"Teststad",companyNumber:"12345678"},key=randomUUID();
   const args=[tenant,account,before.account.version,before.profile.customerVersion,before.profile.contactVersion,input,key];
   const save=(values=args,user=alice)=>call("select public.customer_portal_profile_save($1,$2,$3,$4,$5,$6,$7) data",values,user).then(rows=>rows[0].data);
   await deny(save([tenant,otherAccount,...args.slice(2)]));await deny(save(args,bob));await deny(save([foreignTenant,...args.slice(1)]));
   for(const field of ["email","tenantId","customerId","ownerUserId","status","paymentTerms","branding"])
    await assert.rejects(save([...args.slice(0,5),{...input,[field]:"FORGED"},randomUUID()]),error=>error.code==="23514");
   const result=await save(),after=await workspace();
   assert.equal(after.profile.fullName,"FICTITIOUS Alice Updated");assert.equal(after.profile.company,input.company);assert.equal(after.profile.invoiceEmail,input.invoiceEmail);
   assert.equal(after.profile.email,before.profile.email);assert.equal(after.profile.customerVersion,before.profile.customerVersion+1);assert.equal(after.profile.contactVersion,before.profile.contactVersion+1);
   assert.equal(result.accountVersion,after.account.version);
   const audit=(await db.query("select count(*)::int count from public.audit_events where tenant_id=$1 and entity_id=$2",[tenant,customer])).rows[0].count;
   assert.deepEqual(await save(),result);assert.equal((await db.query("select count(*)::int count from public.audit_events where tenant_id=$1 and entity_id=$2",[tenant,customer])).rows[0].count,audit);
   await assert.rejects(save([...args.slice(0,5),{...input,phone:"0301234569"},key]),error=>error.code==="23505");
   await assert.rejects(save([...args.slice(0,6),randomUUID()]),error=>error.code==="40001");
   await db.query("update public.customer_portal_accounts set can_edit_profile=false where id=$1",[account]);await deny(save());
   await db.query("update public.customer_portal_accounts set can_edit_profile=true where id=$1",[account]);
   assert.equal((await db.query("select preferences from public.customers where tenant_id=$1 and id=$2",[tenant,customer])).rows[0].preferences,"INTERNAL CRM CANARY");
  });
  await t.test("object self-service creates one canonical exact binding, ordinary instruction and per-object contact",async()=>{
   const before=await workspace(),key=randomUUID(),input={version:0,name:"FICTITIOUS portal created site",type:"office",size:125.5,street:"Teststraat 10",postalCode:"1234 AB",city:"Teststad",contact:"FICTITIOUS onsite contact",phone:"0301234567",contactVersion:0,contactRecordVersion:0,instruction:"FICTITIOUS ordinary fixed instruction"};
   const save=(value=input,source=before.account.version,id=key,user=alice,target=account)=>call("select public.customer_portal_object_save($1,$2,$3,$4,$5) data",[tenant,target,source,value,id],user).then(rows=>rows[0].data);
   await deny(save(input,before.account.version,randomUUID(),bob));await deny(save(input,before.account.version,randomUUID(),alice,otherAccount));
   for(const field of ["customerId","tenantId","userId","manageSecrets","latitude","accessInstructions","status"])
    await assert.rejects(save({...input,[field]:"FORGED"},before.account.version,randomUUID()),error=>error.code==="23514");
   const result=await save(),after=await workspace(),site=after.objects.find(o=>o.id===result.objectId);assert.ok(site);assert.equal(site.size,input.size);assert.equal(site.contact,input.contact);assert.equal(site.instructions[0].body,input.instruction);assert.equal(site.instructions[0].author,after.profile.fullName);
   assert.equal(after.objects.length,before.objects.length+1);assert.deepEqual(await save(),result);assert.equal((await workspace()).objects.length,after.objects.length);
   const binding=(await db.query("select active,manage_secrets from public.object_customer_bindings where tenant_id=$1 and object_id=$2 and user_id=$3",[tenant,result.objectId,alice])).rows[0];assert.equal(binding.active,true);assert.equal(binding.manage_secrets,false);
   const record=(await call("select body from public.object_records where tenant_id=$1 and object_id=$2 and kind='instruction'",[tenant,result.objectId],manager))[0];assert.equal(record.body,input.instruction,"Backoffice reads the same canonical instruction");
   const editing={...input,id:site.id,version:site.version,contactVersion:site.contactVersion,contactRecordVersion:site.contactRecordVersion,instruction:"",name:"FICTITIOUS updated site"};
   await deny(save({...editing,id:unboundObject},after.account.version,randomUUID()));await deny(save({...editing,id:foreignObject},after.account.version,randomUUID()));
   await assert.rejects(save({...editing,version:0},after.account.version,randomUUID()),error=>error.code==="40001");
   const contactId=(await db.query("select contact_id from public.object_records where tenant_id=$1 and object_id=$2 and kind='contact'",[tenant,site.id])).rows[0].contact_id;
   await db.query("update public.customer_contacts set object_ids=array[$1::uuid,$2::uuid] where id=$3",[site.id,unboundObject,contactId]);
   const changed=await save({...editing,contact:"FICTITIOUS changed onsite person"},after.account.version,randomUUID());assert.equal(changed.objectId,site.id);
   assert.equal((await workspace()).objects.find(o=>o.id===site.id).contact,"FICTITIOUS changed onsite person");
   assert.equal((await db.query("select full_name from public.customer_contacts where id=$1",[contactId])).rows[0].full_name,input.contact,"Shared CRM contact is not silently rewritten");
   await db.query("update public.object_customer_bindings set active=false where tenant_id=$1 and object_id=$2 and user_id=$3",[tenant,site.id,alice]);await deny(save());
  });
  await t.test("structured customer addresses persist parts and coordinates, survive retries, and clear old locations on manual change",async()=>{
   const before=await workspace();const site=before.objects.find(x=>x.id===object);
   const address={street_name:"Fictieve Straat",house_number:"42",house_letter:"A",house_addition:"bis",postal_code:"1234 AB",city:"Teststad",country:"NL",street:"Fictieve Straat 42A bis",formatted:"Fictieve Straat 42A bis, 1234 AB Teststad",source:"pdok",source_id:randomUUID(),bag_id:"1234567890123456",latitude:52.1,longitude:4.4,located_at:new Date().toISOString(),status:"confirmed"};
   const input={id:object,version:site.version,name:site.name,type:site.type,size:site.size,street:address.street,postalCode:address.postal_code,city:address.city,contact:site.contact||"Fictieve Contactpersoon",phone:site.phone||"0301234567",contactVersion:site.contactVersion,contactRecordVersion:site.contactRecordVersion,instruction:"",address};
   const key=randomUUID(),save=(value=input,id=key,version=before.account.version)=>call("select public.customer_portal_object_save($1,$2,$3,$4,$5) data",[tenant,account,version,value,id]).then(r=>r[0].data);
   const result=await save();assert.deepEqual(await save({...input,address:{...address,located_at:new Date(Date.now()+1000).toISOString()}}),result);
   const row=(await db.query("select address,latitude,longitude from public.objects where id=$1",[object])).rows[0];
   assert.equal(Number(row.latitude),52.1);assert.equal(Number(row.longitude),4.4);assert.equal(row.address.house_number,"42");assert.equal(row.address.house_letter,"A");assert.equal(row.address.house_addition,"bis");
   const staff=(await db.query("select private.staff_normalize_address($1::jsonb) address",[{street:address.street,postalCode:address.postal_code,city:address.city,country:address.country,address}])).rows[0].address;
   assert.equal(staff.latitude,address.latitude);assert.equal(staff.longitude,address.longitude);assert.equal(staff.house_number,"42");
   const repeated=(await db.query("select private.staff_normalize_address($1::jsonb) address,private.staff_home_address_complete($1::jsonb) complete",[staff])).rows[0];assert.equal(repeated.complete,true);assert.deepEqual(repeated.address,staff);
   const current=await workspace(),changed=current.objects.find(x=>x.id===object);assert.equal(changed.address.source_id,address.source_id);
   await assert.rejects(save({...input,version:changed.version,address:{...address,city:"Wrong city"}},randomUUID(),current.account.version),error=>error.code==="23514");
   const manual={...input,version:changed.version,contactVersion:changed.contactVersion,contactRecordVersion:changed.contactRecordVersion,street:"Other street 7"};delete manual.address;
   await save(manual,randomUUID(),current.account.version);
   const updated=(await db.query("select address,latitude,longitude from public.objects where id=$1",[object])).rows[0];assert.equal(updated.latitude,null);assert.equal(updated.longitude,null);assert.equal(updated.address.status,"needs_review");
  });
  await t.test("inactive contact closes new and legacy customer reads",async()=>{
   await db.query("update public.customer_contacts set active=false where id=$1",[contact]);
   try{await deny(workspace());assert.deepEqual((await call("select public.customer_object_visits($1) data",[tenant]))[0].data,[],"An inactive contact also closes legacy visit RPCs");}
   finally{await db.query("update public.customer_contacts set active=true where id=$1",[contact]);}
  });
  await t.test("ordinary fixed instructions append to the canonical object without contact or vault mutation",async()=>{
   const before=await workspace(),site=before.objects.find(o=>o.id===object),key=randomUUID(),body="FICTITIOUS new customer instruction";
   const save=(id=object,version=site.version,text=body,request=key,target=account,user=alice)=>call("select public.customer_portal_instruction_add($1,$2,$3,$4,$5,$6) data",[tenant,target,id,version,text,request],user).then(rows=>rows[0].data);
   await deny(save(unboundObject));await deny(save(foreignObject));await deny(save(object,site.version,body,randomUUID(),otherAccount));await deny(save(object,site.version,body,randomUUID(),account,bob));
   const result=await save();assert.deepEqual(await save(),result);
   const after=await workspace(),updated=after.objects.find(o=>o.id===object);assert.equal(updated.version,result.objectVersion);assert.equal(updated.version,site.version+1);assert.equal(updated.contact,site.contact);assert.equal(updated.phone,site.phone);
   assert.equal(updated.instructions.filter(i=>i.body===body).length,1);assert.equal(updated.instructions.find(i=>i.body===body).author,after.profile.fullName);
   assert.equal((await db.query("select access_instructions from public.objects where id=$1",[object])).rows[0].access_instructions,"PRIVATE VAULT CANARY");
   assert.equal((await call("select body from public.object_records where tenant_id=$1 and object_id=$2 and body=$3",[tenant,object,body],manager)).length,1);
   assert.equal((await call("select public.object_visit_context($1,$2,$3) data",[tenant,object,order],manager))[0].data.instructions.some(i=>i.body===body),true,"The same ordinary record is available to the authorized execution/backoffice projection");
   assert.deepEqual((await call("select public.object_visit_context($1,$2,$3) data",[tenant,object,order]))[0].data.instructions,[],"The old rich instruction projection is deliberately not widened for customers");
   await assert.rejects(save(object,site.version,body,randomUUID()),e=>e.code==="40001");
   await assert.rejects(save(object,site.version,"Different input",key),e=>e.code==="23505");
   await db.query("update public.customer_portal_accounts set can_edit_objects=false where id=$1",[account]);try{await deny(save());}finally{await db.query("update public.customer_portal_accounts set can_edit_objects=true where id=$1",[account]);}
  });
  await t.test("concrete customer visit details select only own public requests even for a hybrid manager",async()=>{
   const own=randomUUID(),internal=randomUUID(),input={title:"FICTITIOUS own appointment note",body:"FICTITIOUS appointment-only instructions",kind:"attention",priority:"normal",feedback:"",nodeId:""};
   await call("select public.submit_object_visit_request($1,$2,$3,$4,$5)",[tenant,object,order,own,input]);
   await call("select public.submit_object_visit_request($1,$2,$3,$4,$5)",[tenant,object,order,internal,{...input,title:"INTERNAL STAFF REQUEST CANARY",body:"INTERNAL EMPLOYEE NOTE CANARY"}],manager);
   await db.query("update public.object_visit_requests set review_note='INTERNAL REVIEW CANARY',owner_user_id=$1,response='FICTITIOUS public response' where id=$2",[manager,own]);
   const detail=(target=account,user=alice)=>call("select public.customer_portal_visit($1,$2,$3) data",[tenant,target,order],user).then(rows=>rows[0].data);
   const data=await detail();assert.equal(data.visit.id,order);assert.equal(data.visit.objectId,object);assert.deepEqual(data.requests.map(r=>r.id),[own]);assert.equal(data.requests[0].body,input.body);assert.equal(data.requests[0].response,"FICTITIOUS public response");assert.equal(data.requests[0].author,(await workspace()).profile.fullName);
   for(const forbidden of ["INTERNAL","PRIVATE VAULT",manager,"userId","created_by","owner_user_id","review_note","storage_path"])assert.equal(JSON.stringify(data).includes(forbidden),false);
   await deny(detail(otherAccount));await deny(detail(account,bob));
   await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['management']::public.app_role[],'active')",[tenant,alice]);
   try{assert.deepEqual(await detail(),data,"A management role does not widen this customer projection");}finally{await db.query("delete from public.tenant_memberships where tenant_id=$1 and user_id=$2",[tenant,alice]);}
   await db.query("update public.work_orders set published_at=null where id=$1",[order]);try{await deny(detail());}finally{await db.query("update public.work_orders set published_at=now() where id=$1",[order]);}
   await db.query("update public.customer_contacts set active=false where id=$1",[contact]);try{await deny(detail());}finally{await db.query("update public.customer_contacts set active=true where id=$1",[contact]);}
  });
  await t.test("published visit and own-request refresh excludes private planning and review notes",async()=>{
   const revision=async()=>Number((await db.query("select revision from public.customer_portal_revisions where tenant_id=$1 and account_id=$2",[tenant,account])).rows[0].revision);
   const initial=await revision();await db.query("update public.work_orders set attention_reason='INTERNAL PLANNING CANARY' where id=$1",[order]);assert.equal(await revision(),initial);
   await db.query("update public.work_orders set projected_start_at=projected_start_at+interval '10 minutes',projected_end_at=projected_end_at+interval '10 minutes' where id=$1",[order]);assert.ok(await revision()>initial,"Published replanning invalidates the bound customer's view");
   const own=(await db.query("select id from public.object_visit_requests where tenant_id=$1 and work_order_id=$2 and created_by=$3",[tenant,order,alice])).rows[0].id;
   const current=await revision();await db.query("update public.object_visit_requests set review_note='NEW INTERNAL REVIEW CANARY' where id=$1",[own]);assert.equal(await revision(),current,"Internal review text never signals the customer");
   await db.query("update public.object_visit_requests set response='FICTITIOUS updated public response' where id=$1",[own]);assert.ok(await revision()>current,"An own public response invalidates its customer's view");
   const after=await revision();await db.query("update public.object_visit_requests set body='INTERNAL CHANGED EMPLOYEE REQUEST' where tenant_id=$1 and work_order_id=$2 and created_by=$3",[tenant,order,manager]);assert.equal(await revision(),after,"A colleague's internal request never signals a customer");
  });
  await t.test("appointment notes use the existing concrete request workflow, once and only while authorized",async()=>{
   const source=(await workspace()).visits.find(v=>v.id===order),key=randomUUID(),body="FICTITIOUS extra instruction for this appointment only";
   const save=(text=body,version=source.version,id=key,target=account,user=alice)=>call("select public.customer_portal_visit_note_add($1,$2,$3,$4,$5,$6) data",[tenant,target,order,version,text,id],user).then(rows=>rows[0].data);
   await deny(save(body,source.version,randomUUID(),otherAccount));await deny(save(body,source.version,randomUUID(),account,bob));
   await assert.rejects(save(body,source.version-1,randomUUID()),e=>e.code==="40001"||e.code==="23514");
   const result=await save();assert.equal(result.requestId,key);assert.deepEqual(await save(),result);
   const actual=(await db.query("select body,work_order_id,created_by,kind,priority from public.object_visit_requests where id=$1",[key])).rows[0];assert.equal(actual.body,body);assert.equal(actual.work_order_id,order);assert.equal(actual.created_by,alice);assert.equal(actual.kind,"attention");assert.equal(actual.priority,"normal");
   assert.equal((await db.query("select count(*)::int n from public.object_visit_requests where id=$1",[key])).rows[0].n,1);
   await assert.rejects(save("Different note with the same receipt"),e=>e.code==="23505");
   const ownLegacy=(await db.query("select id from public.object_visit_requests where tenant_id=$1 and work_order_id=$2 and created_by=$3 and id<>$4 order by created_at limit 1",[tenant,order,alice,key])).rows[0].id;
   await assert.rejects(save(body,source.version,ownLegacy),e=>e.code==="23505","A legacy request cannot masquerade as a new command receipt");
   await db.query("update public.object_customer_bindings set active=false where tenant_id=$1 and object_id=$2 and user_id=$3",[tenant,object,alice]);try{await deny(save());}finally{await db.query("update public.object_customer_bindings set active=true where tenant_id=$1 and object_id=$2 and user_id=$3",[tenant,object,alice]);}
   await db.query("update public.customer_portal_accounts set active=false where id=$1",[account]);try{await deny(save());}finally{await db.query("update public.customer_portal_accounts set active=true where id=$1",[account]);}
   const managerContext=(await call("select public.object_visit_context($1,$2,$3) data",[tenant,object,order],manager))[0].data;assert.equal(managerContext.requests.find(r=>r.id===key).body,body,"Backoffice reads the same persisted concrete request");
  });
  await t.test("complete visit requests preserve selected-account scope, versions, reading and withdrawal",async()=>{
   const source=(await workspace()).visits.find(v=>v.id===order),key=randomUUID();
   const command=(op,input,id=randomUUID(),target=account,user=alice,visit=order)=>call("select public.customer_portal_visit_command($1,$2,$3,$4,$5,$6) data",[tenant,target,visit,id,op,input],user).then(rows=>rows[0].data);
   const fields={title:"FICTITIOUS scoped request",body:"FICTITIOUS precise appointment scope",kind:"extra",priority:"high",feedback:"FICTITIOUS reply requested",nodeId:""};
   const input={visitVersion:source.version,fields};
   await deny(command("create",input,randomUUID(),otherAccount));await deny(command("create",input,randomUUID(),account,bob));
   await assert.rejects(command("create",{...input,visitVersion:source.version+100}),e=>e.code==="40001");
   const created=await command("create",input,key);assert.equal(created.requestId,key);assert.deepEqual(await command("create",input,key),created);
   await assert.rejects(command("create",{...input,fields:{...fields,title:"DIFFERENT"}},key),e=>e.code==="23505");
   const projection=()=>call("select public.customer_portal_visit($1,$2,$3) data",[tenant,account,order]).then(rows=>rows[0].data.requests.find(r=>r.id===key));
   let request=await projection();assert.equal(request.title,fields.title);assert.equal(request.kind,"extra");assert.equal(request.priority,"high");assert.equal(request.feedback,fields.feedback);
   await command("read",{requestId:key,version:request.version});assert.equal((await projection()).read,true);
   const previousVersion=request.version;
   await command("update",{requestId:key,version:request.version,fields:{...fields,body:"FICTITIOUS changed scope"}});
   request=await projection();assert.ok(request.version>previousVersion);assert.equal(request.read,false);assert.equal(request.body,"FICTITIOUS changed scope");
   await assert.rejects(command("withdraw",{requestId:key,version:previousVersion,reason:"FICTITIOUS stale"}),e=>e.code==="40001");
   await deny(command("read",{requestId:key,version:request.version},randomUUID(),otherAccount));
   await assert.rejects(command("attachment",{requestId:key,version:request.version,title:"FICTITIOUS file",path:`${tenant}/${object}/${randomUUID()}.pdf`,mime:"application/pdf",size:12,fileName:"file.pdf"}),e=>e.code==="23514");
   await command("withdraw",{requestId:key,version:request.version,reason:"FICTITIOUS request no longer needed"});
   request=await projection();assert.equal(request.status,"withdrawn");assert.equal(request.canEdit,false);assert.equal(request.canWithdraw,false);
   await assert.rejects(command("update",{requestId:key,version:request.version,fields}),e=>e.code==="23514");
   await db.query("update public.customer_portal_accounts set active=false where id=$1",[account]);try{await deny(command("create",input,key));}finally{await db.query("update public.customer_portal_accounts set active=true where id=$1",[account]);}
  });
  await t.test("selected-account visit proposal acceptance requires exact consent and never duplicates execution",async()=>{
   await db.query("savepoint visit_proposal_fixture");
   try{
    const catalog=randomUUID(),revision=randomUUID(),key=randomUUID();
    await db.query("insert into public.task_catalog(id,tenant_id,code,name,discipline) values($1,$2,'PROPOSAL-FIXTURE','FICTITIOUS extra task','Onderhoud')",[catalog,tenant]);
    await db.query("insert into public.task_revisions(id,tenant_id,task_id,revision,duration_minutes,price_cents,vat_basis_points,unit) values($1,$2,$3,1,30,1500,2100,'task')",[revision,tenant,catalog]);
    const command=(operation,input,id=randomUUID(),target=account)=>call("select public.customer_portal_visit_command($1,$2,$3,$4,$5,$6) data",[tenant,target,order,id,operation,input]).then(rows=>rows[0].data);
    const source=(await workspace()).visits.find(v=>v.id===order);
    await command("create",{visitVersion:source.version,fields:{title:"FICTITIOUS additional scope",body:"FICTITIOUS proposal request",kind:"extra",priority:"normal",nodeId:"",feedback:""}},key);
    await call("select public.review_object_visit_request($1,$2,1,'proposal',$3)",[tenant,key,{reason:"FICTITIOUS priced scope",taskRevisionId:revision,quantity:2,priceCents:1500}],manager);
    const detail=(await call("select public.customer_portal_visit($1,$2,$3) data",[tenant,account,order]))[0].data;
    const request=detail.requests.find(r=>r.id===key),proposal=request.proposals[0],id=randomUUID();
    const action={requestId:key,version:request.version,proposalId:proposal.id,proposalVersion:proposal.version,confirmed:true};
    assert.equal(proposal.canAccept,true);
    await deny(command("accept",action,randomUUID(),otherAccount));
    await assert.rejects(command("accept",{...action,confirmed:false}),e=>e.code==="40001");
    await assert.rejects(command("accept",{...action,proposalVersion:proposal.version+1}),e=>e.code==="40001");
    const result=await command("accept",action,id);assert.deepEqual(await command("accept",action,id),result);
    const tasks=(await db.query("select extra_work_status from public.work_order_tasks where tenant_id=$1 and work_order_id=$2 and task_revision_id=$3",[tenant,order,revision])).rows;
    assert.deepEqual(tasks,[{extra_work_status:"awaiting_review"}]);
   }finally{await db.query("rollback to savepoint visit_proposal_fixture");await db.query("release savepoint visit_proposal_fixture");}
  });
  await t.test("grouped service intake creates one existing request per explicit own object, atomically and once",async()=>{
   const catalog=randomUUID();await db.query("insert into public.task_catalog(id,tenant_id,code,name,discipline,description) values($1,$2,'CUSTOMER-FIXTURE','INTERNAL TASK CANARY','FICTITIOUS service','INTERNAL CATALOG DESCRIPTION CANARY')",[catalog,tenant]);
   const services=(await call("select public.customer_portal_services($1,$2) data",[tenant,account]))[0].data;assert.deepEqual(services.map(s=>s.name),["FICTITIOUS service"]);assert.equal(JSON.stringify(services).includes("INTERNAL"),false);
   const before=await workspace(),newSite={version:0,name:"FICTITIOUS second request site",type:"office",size:null,street:"Teststraat 30",postalCode:"1234 AB",city:"Teststad",contact:"FICTITIOUS site contact",phone:"0301234567",contactVersion:0,contactRecordVersion:0,instruction:""};
   const second=(await call("select public.customer_portal_object_save($1,$2,$3,$4,$5) data",[tenant,account,before.account.version,newSite,randomUUID()]))[0].data.objectId;
   const preferred=new Date(Date.now()+86400000*3).toISOString().slice(0,10),input={service:"FICTITIOUS service",objectIds:[object,second],frequency:"Wekelijks",preferredOn:preferred,description:"FICTITIOUS grouped customer wishes"},key=randomUUID();
   const save=(value=input,id=key,target=account,user=alice)=>call("select public.customer_portal_request_create($1,$2,$3,$4) data",[tenant,target,value,id],user).then(rows=>rows[0].data);
   const list=()=>call("select public.customer_portal_requests($1,$2) data",[tenant,account]).then(rows=>rows[0].data);
   assert.deepEqual(await list(),[]);
   for(const field of ["tenantId","customerId","userId","ownerId","status","priority","priceCents","confirmed"])await assert.rejects(save({...input,[field]:"FORGED"},randomUUID()),e=>e.code==="23514");
   await assert.rejects(save({...input,objectIds:[object,object]},randomUUID()),e=>e.code==="23514");
   for(const bad of [unboundObject,foreignObject])await deny(save({...input,objectIds:[object,bad]},randomUUID()));
   assert.equal((await db.query("select count(*)::int n from public.requests where tenant_id=$1",[tenant])).rows[0].n,0,"A mixed selection cannot leave a partial request behind");
   await deny(save(input,randomUUID(),otherAccount));await deny(save(input,randomUUID(),account,bob));
   const result=await save();assert.equal(result.groupId,key);assert.equal(result.requestIds.length,2);assert.deepEqual(await save(),result);
   const rows=(await db.query("select id,object_id,customer_id,customer_portal_group_id,status from public.requests where tenant_id=$1 order by id",[tenant])).rows;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.customer_id===customer&&r.customer_portal_group_id===key));assert.deepEqual(rows.map(r=>r.object_id).sort(),[object,second].sort());
   const groups=await list();assert.equal(groups.length,1);assert.equal(groups[0].id,key);assert.equal(groups[0].frequency,"Wekelijks");assert.equal(groups[0].preferredOn,preferred);assert.deepEqual(groups[0].objectIds.sort(),[object,second].sort());assert.equal(groups[0].parts.length,2);
   for(const forbidden of ["INTERNAL","owner_id","next_action","followup_on","source_snapshot","created_by",manager])assert.equal(JSON.stringify(groups).includes(forbidden),false);
   await db.query("update public.requests set status='waiting_info' where id=$1",[result.requestIds[0]]);const mixed=(await list())[0];assert.equal(mixed.status,"mixed");assert.deepEqual(mixed.parts.map(p=>p.status).sort(),["new","waiting_info"].sort(),"Independent request statuses remain independent");
   await assert.rejects(save({...input,description:"Different wishes"},key),e=>e.code==="23505");
   await db.query("update public.object_customer_bindings set active=false where tenant_id=$1 and object_id=$2 and user_id=$3",[tenant,second,alice]);await deny(save());
   assert.equal((await list())[0].parts.length,1,"A revoked object no longer appears in a group projection");
   await db.query("update public.object_customer_bindings set active=true where tenant_id=$1 and object_id=$2 and user_id=$3",[tenant,second,alice]);
   await db.query("update public.customer_portal_accounts set active=false where id=$1",[account]);try{await deny(save());await deny(list());}finally{await db.query("update public.customer_portal_accounts set active=true where id=$1",[account]);}
   await db.query("update public.task_catalog set active=false where id=$1",[catalog]);assert.deepEqual((await call("select public.customer_portal_services($1,$2) data",[tenant,account]))[0].data,[]);await assert.rejects(save(input,randomUUID()),e=>e.code==="23514");
  });
  await t.test("intake without objects stays private, persists once and lets management attach a location later",async()=>{
   await db.query("savepoint objectless_intake");
   try{
    await db.query("update public.object_customer_bindings set active=false where tenant_id=$1 and user_id=$2",[tenant,alice]);
    assert.deepEqual((await workspace()).objects,[]);
    // No SQL NULL truth value may bypass an IF NOT guard used by quote commands.
    for(const creator of [null,bob,alice]){
     await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:alice,session_id:sessions.get(alice),role:"authenticated"})]);
     const scope=(await db.query("select private.commercial_customer_scope($1,$2,null,$3) allowed",[tenant,customer,creator])).rows[0].allowed;
     assert.equal(scope,creator===alice);
     await db.query("select set_config('request.jwt.claims','{}',true)");
    }
    const key=randomUUID(),input={service:"Andere dienstverlening",objectIds:[],frequency:"Maandelijks",preferredOn:null,description:"FICTITIOUS complete wishes without a known location"};
    const save=(id=key,target=account,user=alice)=>call("select public.customer_portal_request_create($1,$2,$3,$4) data",[tenant,target,input,id],user).then(rows=>rows[0].data);
    const count=(table)=>db.query(`select count(*)::int n from public.${table} where tenant_id=$1`,[tenant]).then(result=>result.rows[0].n);
    const counts=async()=>[await count("objects"),await count("customers"),await count("customer_contacts")],before=await counts();
    await deny(save(randomUUID(),otherAccount));await deny(save(randomUUID(),account,bob));
    const receipt=await save();assert.equal(receipt.requestIds.length,1);assert.deepEqual(await save(),receipt);
    assert.deepEqual(await counts(),before,"No placeholder objects or identities are created");
    const rid=receipt.requestIds[0],record=(await db.query("select * from public.requests where id=$1",[rid])).rows[0];
    assert.equal(record.object_id,null);assert.equal(record.customer_id,customer);assert.equal(record.contact_id,contact);assert.equal(record.description,input.description);assert.equal(record.preferences.frequency,input.frequency);
    const groups=(await call("select public.customer_portal_requests($1,$2) data",[tenant,account]))[0].data,group=groups.find(item=>item.id===key);
    assert.deepEqual(group.objectIds,[]);assert.equal(group.parts.length,1);assert.equal(group.parts[0].objectId,null);assert.equal(group.description,input.description);
    const detail=(await call("select public.customer_portal_request_detail($1,$2,$3) data",[tenant,account,rid]))[0].data;
    assert.equal(detail.request.description,input.description);
    await deny(call("select public.customer_portal_request_detail($1,$2,$3) data",[tenant,otherAccount,rid],bob));
    await db.query("update public.customer_portal_accounts set active=false where id=$1",[account]);await deny(save());
    await db.query("update public.customer_portal_accounts set active=true where id=$1",[account]);
    const management=(await call("select public.commercial_detail($1,$2,'request') data",[tenant,rid],manager))[0].data;assert.equal(management.record.description,input.description);assert.equal(management.record.object_id,null);
    const payload={id:rid,version:record.version,customer_id:customer,object_id:object,owner_id:manager,subject:record.subject,description:"Manager must not overwrite customer wishes",discipline:record.discipline,source:"portal",priority:"normal",work_kind:"recurring",next_action:"Locatie vastgesteld"};
    await call("select public.commercial_command($1,$2,'request_save',$3) data",[tenant,randomUUID(),payload],manager);
    const linked=(await db.query("select object_id,description from public.requests where id=$1",[rid])).rows[0];assert.equal(linked.object_id,object);assert.equal(linked.description,input.description);
    await db.query("update public.object_customer_bindings set active=true where tenant_id=$1 and object_id=$2 and user_id=$3",[tenant,object,alice]);
    assert.equal((await call("select public.customer_portal_request_detail($1,$2,$3) data",[tenant,account,rid]))[0].data.request.objectId,object);
    assert.deepEqual(await save(),receipt,"A retry never removes the location linked by management");
   }finally{await db.query("rollback to savepoint objectless_intake");await db.query("release savepoint objectless_intake");}
  });
  await t.test("customer news comes from real central campaigns and remains isolated between two accounts of one login",async()=>{
   await db.query("savepoint customer_news_fixture");
   try{
    const secondAccount=(await bind(otherCustomer,alice,otherContact))[0].id,secondObject=randomUUID();
    await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,$1::uuid::text,'FICTITIOUS second news site','{}')",[secondObject,tenant,otherCustomer]);
    await db.query("insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by) values($1,$2,$3,$4)",[tenant,secondObject,alice,manager]);
    await db.query("insert into public.permission_grants(tenant_id,user_id,membership_id,capability,scope) values($1,$2,(select id from public.tenant_memberships where tenant_id=$1 and user_id=$2),'notifications.send_customers','{\"all\":true}') on conflict(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),user_id,capability) do update set enabled=true,scope=excluded.scope",[tenant,manager]);
    const command=(kind,input)=>call("select public.notification_command($1,'backoffice',$2,$3,$4) data",[tenant,kind,input,randomUUID()],manager).then(rows=>rows[0].data);
    const publish=async(ct,oid,title)=>{
     const criteria={kind:"customer",contact_ids:[ct],object_ids:[oid]},preview=(await call("select public.notification_query($1,'backoffice','recipients',$2) data",[tenant,{criteria,channels:["in_app"]}],manager))[0].data;
     assert.equal(preview.counts.in_app,1);
     const draft=await command("campaign_save",{expected_revision:0,title,body:`${title} body`,priority:"normal",criteria,channels:["in_app"],timezone:"Europe/Amsterdam",ack_required:true,action_label:"Bekijken"});
     const campaign=await command("campaign_publish",{id:draft.id,expected_revision:draft.revision,selection_token:preview.selection_token});
     const requests=(await db.query("select r.id from private.notification_requests r join private.notification_campaign_recipients cr on cr.id=r.source_id where cr.campaign_id=$1 and cr.user_id=$2",[campaign.id,alice])).rows;assert.equal(requests.length,1);
     for(const request of requests)await call("select public.notification_delivery_prepare($1)",[request.id],alice,"service_role");
     // This whole fixture is rolled back in one transaction: now() is fixed at
     // its start, while real campaign preparation uses clock_timestamp(). Make
     // only these fictitious in-app deliveries eligible for the real worker.
     const deliveries=(await db.query("select id,channel,state from private.notification_deliveries where request_id=any($1::uuid[])",[requests.map(request=>request.id)])).rows;
     assert.equal(deliveries.length,1);assert.equal(deliveries[0].channel,"in_app");assert.equal(deliveries[0].state,"queued");
     await db.query("update private.notification_deliveries set available_at=now()-interval '1 second' where id=$1 and channel='in_app'",[deliveries[0].id]);
     const leases=(await call("select public.notification_delivery_claim(100,$1) data",[tenant],alice,"service_role"))[0].data;
     assert.ok(leases.some(lease=>lease.id===deliveries[0].id),"The real worker must claim the exact in-app fixture delivery");
     for(const lease of leases){
      const delivery=(await db.query("select channel from private.notification_deliveries where id=$1 and request_id=any($2::uuid[])",[lease.id,requests.map(request=>request.id)])).rows[0];
      if(!delivery)continue;assert.equal(delivery.channel,"in_app","This fixture never admits an external email or push transport");
      await call("select public.notification_delivery_begin($1,$2)",[lease.id,lease.lease],alice,"service_role");
     }
     const notices=(await db.query("select id from public.notifications where campaign_id=$1 and user_id=$2 and context='customer' and channel='in_app'",[campaign.id,alice])).rows;
     assert.equal(notices.length,1,"The real central worker materializes exactly one customer notice");return notices[0].id;
    };
    const first=await publish(contact,object,"FICTITIOUS first-customer news"),second=await publish(otherContact,secondObject,"FICTITIOUS second-customer news");
    const news=(id=account)=>call("select public.customer_portal_news($1,$2) data",[tenant,id]).then(rows=>rows[0].data);
    const own=await news();assert.deepEqual(own.map(n=>n.id),[first]);assert.deepEqual((await news(secondAccount)).map(n=>n.id),[second]);assert.equal(own[0].ackRequired,true);assert.equal(own[0].readAt,null);
    for(const forbidden of ["sender_id","sender_name","email_hash","source_context","criteria","recipient_key",manager,"second-customer"])assert.equal(JSON.stringify(own).includes(forbidden),false);
    await deny(call("select public.customer_portal_news($1,$2)",[tenant,account],bob));
    const readKey=randomUUID(),mark=(id=first,version=own[0].version,operation="read",key=readKey,target=account)=>call("select public.customer_portal_news_mark($1,$2,$3,$4,$5,$6) data",[tenant,target,id,version,operation,key]).then(rows=>rows[0].data);
    await deny(mark(second));await deny(mark(first,own[0].version,"read",randomUUID(),secondAccount));
    const result=await mark();assert.equal(result.notificationId,first);assert.deepEqual(await mark(),result);assert.ok((await news())[0].readAt);assert.equal((await news(secondAccount))[0].readAt,null,"Reading one account's news must not read another account's notice");
    await assert.rejects(mark(first,own[0].version,"read",randomUUID()),e=>e.code==="40001");
    const acknowledged=await mark(first,result.version,"ack",randomUUID());assert.ok((await news())[0].acknowledgedAt);assert.equal((await news())[0].version,acknowledged.version);
    await assert.rejects(mark(first,own[0].version,"ack",readKey),e=>e.code==="23505");
    await assert.rejects(mark(first,acknowledged.version,"read_all",randomUUID()),e=>e.code==="23514");
    for(const [table,id] of [["customer_contacts",contact],["customer_portal_accounts",account]]){
     await db.query(`update public.${table} set active=false where id=$1`,[id]);
     try{await deny(news());await deny(mark());assert.deepEqual((await news(secondAccount)).map(n=>n.id),[second],"Revoking one selected customer identity leaves the other explicit account isolated");}
     finally{await db.query(`update public.${table} set active=true where id=$1`,[id]);}
    }
    await db.query("update public.object_customer_bindings set active=false where tenant_id=$1 and object_id=$2 and user_id=$3",[tenant,object,alice]);assert.deepEqual(await news(),[],"The original exact campaign object audience is rechecked");
    await deny(mark());
   }finally{await db.query("rollback to savepoint customer_news_fixture");await db.query("release savepoint customer_news_fixture");}
  });
  await t.test("inactive account is not reactivated by an existing object binding",async()=>{
   await db.query("update public.customer_portal_accounts set active=false where id=$1",[account]);
   try{await deny(workspace());assert.deepEqual((await call("select public.customer_object_visits($1) data",[tenant]))[0].data,[],"An inactive account also closes legacy visit RPCs");}
   finally{await db.query("update public.customer_portal_accounts set active=true where id=$1",[account]);}
  });
  await t.test("a concrete visit and commercial scope reauthorize after contact/account revocation",async()=>{
   assert.ok((await call("select public.object_visit_context($1,$2,$3) data",[tenant,object,order]))[0].data);
   for(const [table,id] of [["customer_contacts",contact],["customer_portal_accounts",account]]){
    await db.query(`update public.${table} set active=false where id=$1`,[id]);
    try{
     await deny(call("select public.object_visit_context($1,$2,$3) data",[tenant,object,order]));
     const commercial=(await call("select public.commercial_customer_list($1,1) data",[tenant]))[0].data;
     assert.deepEqual(commercial.objects,[]);assert.deepEqual(commercial.requests,[]);assert.deepEqual(commercial.quotes,[]);
    }finally{await db.query(`update public.${table} set active=true where id=$1`,[id]);}
   }
  });
  await t.test("the historical explicitly permitted vault deep link still requires a live customer account",async()=>{
   assert.ok((await call("select public.object_visit_context($1,$2,null) data",[tenant,object]))[0].data);
   await db.query("update public.customer_portal_accounts set active=false where id=$1",[account]);
   try{await deny(call("select public.object_visit_context($1,$2,null) data",[tenant,object]));}
   finally{await db.query("update public.customer_portal_accounts set active=true where id=$1",[account]);}
  });
  await t.test("invoice customer scope closes on live-account and contact revocation",async()=>{
   const scope=()=>call("select private.customer_portal_bound($1,$2) allowed",[tenant,customer]).then(rows=>rows[0].allowed);
   assert.equal(await scope(),true);
   for(const [table,id] of [["customer_contacts",contact],["customer_portal_accounts",account]]){
    await db.query(`update public.${table} set active=false where id=$1`,[id]);
    try{assert.equal(await scope(),false,`${table} revocation closes invoice/payment customer scope`);}
    finally{await db.query(`update public.${table} set active=true where id=$1`,[id]);}
   }
   assert.equal((await call("select private.customer_portal_bound($1,$2) allowed",[tenant,otherCustomer]))[0].allowed,false);
  });
  await t.test("an explicitly shared object document reauthorizes its live customer identity",async()=>{
   const document=randomUUID();
   await db.query("insert into public.customer_documents(id,tenant_id,customer_id,title,storage_path,file_name,mime_type,size_bytes,sha256,created_by,visibility,portal_object_id) values($1,$2,$3,'FICTITIOUS shared document',$4,'fixture.pdf','application/pdf',12,repeat('a',64),$5,'customer',$6)",[document,tenant,customer,`${tenant}/${customer}/${document.replaceAll('-','')}.pdf`,manager,object]);
   const file=()=>call("select public.customer_file_access($1,$2,'document') data",[tenant,document]);
   const descriptor=(await file())[0].data;assert.deepEqual(descriptor.scope,[tenant,customer]);assert.equal(descriptor.sha256,"a".repeat(64));
   for(const [table,id] of [["customer_contacts",contact],["customer_portal_accounts",account]]){
    await db.query(`update public.${table} set active=false where id=$1`,[id]);
    try{await deny(file());assert.deepEqual((await call("select public.customer_portal_documents($1) data",[tenant]))[0].data.documents,[]);}
    finally{await db.query(`update public.${table} set active=true where id=$1`,[id]);}
   }
   assert.ok((await call("select public.customer_file_access($1,$2,'document') data",[tenant,document],manager))[0].data,"Backoffice authority is unchanged");
  });
  await t.test("module off, inactive tenant and expired session fail closed without broad fallback",async()=>{
   await call("update public.tenant_settings set enabled_services=array['tickets'] where tenant_id=$1",[tenant],manager,"service_role");
   assert.deepEqual((await workspace()).objects,[]);assert.deepEqual((await workspace()).visits,[]);
   await call("update public.tenant_settings set enabled_services=array['planning','finance','rapportage','tickets'] where tenant_id=$1",[tenant],manager,"service_role");
   await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[sessions.get(alice)]);await deny(workspace());await db.query("update auth.sessions set not_after=null where id=$1",[sessions.get(alice)]);
   await call("update public.tenants set status='suspended' where id=$1",[tenant],manager,"service_role");await deny(workspace());await call("update public.tenants set status='active' where id=$1",[tenant],manager,"service_role");
  });
  await t.test("a previously bound user must remain non-anonymous with a confirmed login email",async()=>{
   await db.query("update auth.users set is_anonymous=true where id=$1",[alice]);
   try{await deny(workspace());assert.deepEqual((await call("select public.customer_portal_accounts($1) data",[tenant]))[0].data,[]);await deny(call("select public.notification_query($1,'customer','inbox','{}')",[tenant]));}
   finally{await db.query("update auth.users set is_anonymous=false where id=$1",[alice]);}
   await db.query("update auth.users set email_confirmed_at=null where id=$1",[alice]);
   try{await deny(workspace());await deny(call("select public.notification_query($1,'customer','inbox','{}')",[tenant]));}
   finally{await db.query("update auth.users set email_confirmed_at=now() where id=$1",[alice]);}
  });
  await t.test("revoking an account revokes its exact object bindings and old portal reads",async()=>{
   const current=(await db.query("select version from public.customer_portal_accounts where id=$1",[account])).rows[0].version;
   await bind(customer,alice,contact,Number(current),false);await deny(workspace());
   assert.equal((await db.query("select active from public.object_customer_bindings where tenant_id=$1 and object_id=$2 and user_id=$3",[tenant,object,alice])).rows[0].active,false);
   assert.deepEqual((await call("select public.customer_object_visits($1) data",[tenant]))[0].data,[]);
  });
 }finally{await db.query("rollback");await db.end();}
});
