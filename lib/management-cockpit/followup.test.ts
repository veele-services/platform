import {describe,expect,it} from 'vitest';
import {followupCommandSchema,followupQuerySchema,projectFollowup} from './followup';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const base=()=>({sources:[],overlays:[],owners:[{id:id(1),name:'FICTITIOUS manager'}],customers:[],sourceOptions:[{id:id(2),kind:'tenant',label:'FICTITIOUS company',href:'/app'}],actorId:id(1),today:'2026-10-14',canWrite:true,actions:Array.from({length:25},(_,n)=>({id:id(n+100),source_kind:'tenant',source_id:id(2),title:'FICTITIOUS action '+n,scope:'general',due_on:n%2?'2026-10-14':'2026-10-13',original_due_on:'2026-10-13',owner_id:n%3?id(1):null,state:n===24?'done':'open',snoozed_until:n===23?'2026-10-20':null,note:'FICTITIOUS latest note',automatic:false,revision:4,ignored_private_price:'PRIVATE-CANARY'}))});
describe('authorized follow-up projection',()=>{
 it('keeps selection counts independent of bounded pages and handles all follow-up filters',()=>{
  const one=projectFollowup(base(),followupQuerySchema.parse({filter:'all',page:1}),'Company'),two=projectFollowup(base(),followupQuerySchema.parse({filter:'all',page:2}),'Company');
  expect(one.counts).toMatchObject({all:23,done:1,snoozed:1,week:23});expect(one.total).toBe(23);expect(one.actions).toHaveLength(8);expect(new Set([...one.actions,...two.actions].map(a=>a.id)).size).toBe(16);
  expect(projectFollowup(base(),followupQuerySchema.parse({filter:'all',page:999}),'Company').page).toBe(3);
  expect(projectFollowup(base(),followupQuerySchema.parse({filter:'snoozed'}),'Company').actions[0].originalDue).toBe('2026-10-13');
  expect(JSON.stringify(one)).not.toContain('PRIVATE-CANARY');
 });
 it('does not convert an operational task into an editable/completable management task',()=>{
  const raw=base();const source={id:id(500),kind:'execution',title:'FICTITIOUS work task',status:'planned',priority:'normal',due_on:'2026-10-14',owner_id:null,version:7,customer_id:null,object_id:id(501),personnel_id:null,work_order_id:id(502),href:'/app/werkbonnen/'+id(502)};
  const result=projectFollowup({...raw,sources:[source],overlays:[{source_kind:'execution',source_id:source.id,owner_id:id(1),snoozed_until:null,note:'FICTITIOUS manager responsibility',revision:3}]},followupQuerySchema.parse({filter:'today',search:'work task'}),'Company');
  expect(result.actions[0]).toMatchObject({kind:'execution',sourceVersion:7,revision:3,owner:'FICTITIOUS manager',canComplete:false,status:'open'});
 });
 it('rejects caller tenant, demo role and complete-state updates at the public command boundary',()=>{
  expect(followupCommandSchema.safeParse({command:'create',requestId:id(1),input:{sourceKind:'tenant',sourceId:id(2),title:'FICTITIOUS test',due:'2026-10-14'}}).success).toBe(true);
  for(const value of[{tenantId:id(2),command:'complete',requestId:id(1),input:{}},{command:'state.save',requestId:id(1),input:{}},{command:'create',requestId:id(1),input:{role:'Eigenaar'}},{command:'create',requestId:id(1),input:{history:['forged']}}])expect(followupCommandSchema.safeParse(value).success).toBe(false);
 });
});
