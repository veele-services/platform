import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { workOrderTestDatabase } from "./work-order-test-target.mjs";

test("list size preferences page real authorized rows with stable order and intact tenant boundaries",async t=>{
 const db=await workOrderTestDatabase();await db.query("begin");
 const tenant=randomUUID(),other=randomUUID(),manager=randomUUID(),staff=randomUUID(),object=randomUUID(),sessions=new Map([manager,staff].map(id=>[id,randomUUID()]));
 const call=async(name,filters={},actor=manager,target=tenant)=>{await db.query("savepoint list_page");try{await db.query("set local role authenticated");await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:sessions.get(actor),role:"authenticated"})]);const result=await db.query(`select public.${name}($1,$2) result`,[target,filters]);await db.query("reset role");await db.query("release savepoint list_page");return result.rows[0].result;}catch(error){await db.query("rollback to savepoint list_page");await db.query("release savepoint list_page");throw error;}};
 try{
  for(const[id,session]of sessions){await db.query("insert into auth.users(id,email) values($1,$2)",[id,`${id}@list-pagination.test`]);await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day')",[session,id]);}
  for(const id of[tenant,other]){await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS list tenant')",[id,`list-${id}`]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','rapportage','finance'])",[id]);}
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin','management','finance']::public.app_role[],'active'),($1,$3,array['staff']::public.app_role[],'active')",[tenant,manager,staff]);
  const customerIds=[];
  for(let index=0;index<37;index++){const customer=randomUUID();customerIds.push(customer);const number=String(index).padStart(3,"0");await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,$3,$3)",[customer,tenant,`FICTITIOUS-${number}`]);}
  await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'OBJ-TEST','FICTITIOUS list object','{\"street\":\"Teststraat\"}')",[object,tenant,customerIds[0]]);
  for(let index=0;index<37;index++){const number=String(index).padStart(3,"0");await db.query("insert into public.work_orders(tenant_id,customer_id,object_id,work_order_number,discipline,title,created_by) values($1,$2,$3,$4,'Test',$4,$5)",[tenant,customerIds[0],object,`WB-TEST-${number}`,manager]);await db.query("insert into public.requests(tenant_id,request_number,subject,description,discipline,customer_id,created_by) values($1,$2,$2,'FICTITIOUS wording','Test',$3,$4)",[tenant,`REQ-TEST-${number}`,customerIds[0],manager]);}
  for(const name of["customer_list","work_order_list","commercial_list"])await t.test(`${name} traverses all rows exactly once at the requested size`,async()=>{
   const first=await call(name,{page:1,pageSize:10,sort:"number"});assert.equal(first.total,37);assert.equal(first.rows.length,10);assert.equal(first.pageSize??first.page_size,10);
   const ids=[];for(let page=1;page<=4;page++){const data=await call(name,{page,pageSize:10,sort:"number"});assert.equal(data.page,page);ids.push(...data.rows.map(row=>row.id));}assert.equal(ids.length,37);assert.equal(new Set(ids).size,37);
   const large=await call(name,{pageSize:50,sort:"number"});assert.equal(large.rows.length,37);assert.equal(large.pageSize??large.page_size,50);
   const empty=await call(name,{q:"No matched fixture",pageSize:50});assert.equal(empty.total,0);assert.deepEqual(empty.rows,[]);
   const bounded=await call(name,{pageSize:10000});assert.equal(bounded.pageSize??bounded.page_size,100);
  });
  await t.test("new list-size parameters do not weaken roles or tenant access",async()=>{for(const name of["customer_list","work_order_list","commercial_list"]){await assert.rejects(call(name,{pageSize:100},staff),error=>error.code==="42501");await assert.rejects(call(name,{pageSize:100},manager,other),error=>error.code==="42501");}});
 }finally{await db.query("rollback");await db.end();}
});
