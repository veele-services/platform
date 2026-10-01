import {createHash} from "node:crypto";
import {beforeEach,describe,expect,it,vi} from "vitest";

const state=vi.hoisted(()=>({rows:{} as Record<string,Record<string,unknown>[]>,matches:true}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/tenancy/request",()=>({requestMatchesTenant:async()=>state.matches}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:(table:string)=>{
 let rows=state.rows[table]??[];
 const query={
  select:()=>query,
  eq:(key:string,value:unknown)=>{rows=rows.filter(row=>row[key]===value);return query;},
  single:async()=>({data:rows[0]??null,error:rows[0]?null:{code:"PGRST116"}}),
  maybeSingle:async()=>({data:rows[0]??null,error:null}),
 };
 return query;
}})}));

import {quoteAccess} from "./access";

const token="fictitious-commercial-capability-token-2026";
const tokenHash=createHash("sha256").update(token).digest("hex");

describe("public commercial capability access",()=>{
 beforeEach(()=>{
  state.matches=true;
  state.rows={
   external_action_tokens:[{token_hash:tokenHash,purpose:"quote_acceptance",tenant_id:"tenant",subject_id:"quote",expires_at:"2999-01-01T00:00:00.000Z",revoked_at:null}],
   tenants:[{id:"tenant",slug:"fixture",name:"Fictitious tenant",timezone:"Europe/Amsterdam",status:"active"}],
   tenant_settings:[{tenant_id:"tenant",enabled_services:["planning"]}],
   quotes:[{id:"quote",tenant_id:"tenant",status:"awaiting_acceptance",published_at:"2026-01-01T00:00:00.000Z",expires_at:"2999-01-01T00:00:00.000Z",superseded_at:null,archived_at:null,snapshot:{}}],
  };
 });

 it("returns the current capability only while Planning is enabled",async()=>{
  expect((await quoteAccess(token))?.active).toBe(true);
  state.rows.tenant_settings[0].enabled_services=[];
  expect(await quoteAccess(token)).toBeNull();
 });

 it.each([
  ["inactive tenant",()=>{state.rows.tenants[0].status="suspended";}],
  ["missing settings",()=>{state.rows.tenant_settings=[];}],
  ["wrong hostname",()=>{state.matches=false;}],
 ])("fails closed for %s",async(_name,change)=>{
  change();
  expect(await quoteAccess(token)).toBeNull();
 });
});
