import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {workOrderTestDatabase} from "./work-order-test-target.mjs";

test("account guide receipts persist across sessions and never modify another account",async t=>{
 const db=await workOrderTestDatabase();await db.query("begin");
 const first=randomUUID(),second=randomUUID(),session=randomUUID(),nextSession=randomUUID(),otherSession=randomUUID();
 const as=async(actor,sid,sql,args=[],role="authenticated")=>{
  await db.query("savepoint guide_call");
  try{await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:sid,role})]);const result=await db.query(sql,args);await db.query("reset role");await db.query("release savepoint guide_call");return result.rows;}
  catch(error){await db.query("rollback to savepoint guide_call");await db.query("release savepoint guide_call");throw error;}
 };
 const state=(actor=first,sid=session)=>as(actor,sid,"select public.account_guide_state() receipts");
 const dismiss=(key,actor=first,sid=session,role="authenticated")=>as(actor,sid,"select public.dismiss_account_guide($1)",[key],role);
 try{
  for(const id of[first,second])await db.query("insert into auth.users(id,email) values($1,$2)",[id,`${id}@guides.test`]);
  for(const[sid,actor]of[[session,first],[nextSession,first],[otherSession,second]])await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day')",[sid,actor]);
  await t.test("one account receipt is shared by its independent device sessions and repeated close is idempotent",async()=>{
   assert.deepEqual((await state())[0].receipts,[]);await dismiss("backoffice.overzicht");await dismiss("staff.planning");await dismiss("customer.dashboard");
   const before=(await db.query("select dismissed_at from public.account_guide_dismissals where user_id=$1 and guide_key='staff.planning'",[first])).rows[0].dismissed_at;
   await dismiss("staff.planning",first,nextSession);assert.deepEqual((await state(first,nextSession))[0].receipts,["backoffice.overzicht","customer.dashboard","staff.planning"]);
   assert.deepEqual((await db.query("select dismissed_at from public.account_guide_dismissals where user_id=$1 and guide_key='staff.planning'",[first])).rows[0].dismissed_at,before);
  });
  await t.test("a customer-only identity can save its own receipt without a general tenant membership",async()=>{
   assert.deepEqual((await state(second,otherSession))[0].receipts,[]);await dismiss("customer.dashboard",second,otherSession);
   assert.deepEqual((await as(second,otherSession,"select user_id,guide_key from public.account_guide_dismissals")),[{user_id:second,guide_key:"customer.dashboard"}]);
   await assert.rejects(as(second,otherSession,"update public.account_guide_dismissals set user_id=$1",[first]),e=>e.code==="42501");
   await assert.rejects(as(second,otherSession,"insert into public.account_guide_dismissals(user_id,guide_key) values($1,'feature.signature')",[first]),e=>e.code==="42501");
  });
  await t.test("unknown keys, anonymous/service callers and mismatched, expired, banned or revoked sessions fail closed",async()=>{
   await assert.rejects(dismiss("arbitrary content"),e=>e.code==="23514");
   for(const role of["anon","service_role"])await assert.rejects(dismiss("feature.signature",first,session,role),e=>e.code==="42501");
   await assert.rejects(state(first,otherSession),e=>e.code==="42501");
   await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[nextSession]);await assert.rejects(dismiss("feature.signature",first,nextSession),e=>e.code==="42501");
   await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[first]);await assert.rejects(state(),e=>e.code==="42501");assert.deepEqual(await as(first,session,"select guide_key from public.account_guide_dismissals"),[]);
   await db.query("update auth.users set banned_until=null where id=$1",[first]);await db.query("delete from auth.sessions where id=$1",[session]);await assert.rejects(dismiss("feature.signature"),e=>e.code==="42501");
  });
 }finally{await db.query("rollback");await db.end();}
});
