import { describe,expect,it,vi } from "vitest";
import { createCustomerRefreshStore,loadCustomerCoreSnapshot,observeCustomerRefresh,type CustomerRefreshResult } from "./refresh";
import type { CustomerCoreSnapshot } from "./snapshot-model";
const account="10000000-0000-4000-8000-000000000001",foreign="10000000-0000-4000-8000-000000000002";
const initial:CustomerCoreSnapshot={workspace:{account:{id:account,version:1,canCreateObjects:true,canEditObjects:true,canEditProfile:true,onboardingStep:0,onboardingCompletedAt:null},tenant:{name:"Fictieve leverancier",slug:"fixture",timezone:"Europe/Amsterdam",primaryColor:null,accentColor:null,hasLogo:false,whiteLabel:false,phone:"",planning:true,finance:true,paymentConfigured:false,reports:true,tickets:true},profile:{fullName:"Fictieve Klant",email:"login@customer.test",company:"Fictieve klant",phone:"0301234567",invoiceEmail:"billing@customer.test",street:"Teststraat 1",postalCode:"1234 AB",city:"Teststad",companyNumber:"",customerVersion:1,contactVersion:1},objects:[],visits:[]},draft:{version:1,step:0,contact:{},object:null,preferences:{appointments:true,reports:true,invoices:true,tickets:true,news:false}},preferences:{version:0,groups:{appointments:true,reports:true,invoices:true,tickets:true,news:false}},invoices:[],reports:[],documents:[],requests:[],services:[],news:[],tickets:[],activity:{items:[],unread:0},now:"2026-10-05T06:00:00Z"};
const deferred=()=>{let resolve!:(value:CustomerRefreshResult)=>void;const promise=new Promise<CustomerRefreshResult>(done=>{resolve=done;});return {promise,resolve};};
describe("memory-only customer refresh store",()=>{
 it("has cached stable client/server snapshots",()=>{const store=createCustomerRefreshStore(initial,vi.fn());expect(store.getSnapshot()).toBe(store.getSnapshot());expect(store.getServerSnapshot()).toBe(store.getServerSnapshot());});
 it("marks pending work stale and publishes a validated fresh snapshot",async()=>{
  const next={...initial,now:"2026-10-05T06:01:00Z"},job=deferred(),store=createCustomerRefreshStore(initial,()=>job.promise),listener=vi.fn();store.subscribe(listener);const run=store.refresh();expect(store.getSnapshot().stale).toBe(true);job.resolve({kind:"ok",snapshot:next});await run;expect(store.getSnapshot()).toEqual({snapshot:next,stale:false,denied:false});expect(listener).toHaveBeenCalledTimes(2);
 });
 it("coalesces invalidations during I/O into one subsequent current read",async()=>{
  const first=deferred(),second=deferred(),load=vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),store=createCustomerRefreshStore(initial,load);
  const run=store.refresh();expect(store.refresh()).toBe(run);expect(store.refresh()).toBe(run);first.resolve({kind:"ok",snapshot:initial});await Promise.resolve();expect(load).toHaveBeenCalledTimes(2);second.resolve({kind:"ok",snapshot:initial});await run;expect(store.getSnapshot().stale).toBe(false);
 });
 it.each([{kind:"temporary"} as const,new Error("offline")])("keeps the last in-memory view stale on a temporary failure",async result=>{
  const load=vi.fn();if(result instanceof Error)load.mockRejectedValue(result);else load.mockResolvedValue(result);const store=createCustomerRefreshStore(initial,load);await store.refresh();expect(store.getSnapshot()).toEqual({snapshot:initial,stale:true,denied:false});
 });
 it("clears all private state on access denial and never resurrects it",async()=>{
  const load=vi.fn().mockResolvedValueOnce({kind:"denied"}).mockResolvedValue({kind:"ok",snapshot:initial}),store=createCustomerRefreshStore(initial,load);await store.refresh();expect(store.getSnapshot()).toEqual({snapshot:null,stale:false,denied:true});await store.refresh();expect(load).toHaveBeenCalledTimes(1);
 });
 it("logout immediately clears state and aborts a pending positive result",async()=>{
  const job=deferred(),load=vi.fn<(signal:AbortSignal)=>Promise<CustomerRefreshResult>>(()=>job.promise),store=createCustomerRefreshStore(initial,load),run=store.refresh(),signal=load.mock.calls[0][0];store.revoke();expect(signal.aborted).toBe(true);job.resolve({kind:"ok",snapshot:initial});await run;expect(store.getSnapshot().snapshot).toBeNull();
 });
 it("cannot use a positive result for another selected customer",async()=>{
  const foreignSnapshot={...initial,workspace:{...initial.workspace,account:{...initial.workspace.account,id:foreign}}},store=createCustomerRefreshStore(initial,async()=>({kind:"ok",snapshot:foreignSnapshot}));await store.refresh();expect(store.getSnapshot().denied).toBe(true);expect(store.getSnapshot().snapshot).toBeNull();
 });
 it("rejects non-allowlisted data without replacing current state",async()=>{
  const invalid={...initial,privateSource:"CANARY"},store=createCustomerRefreshStore(initial,async()=>({kind:"ok",snapshot:invalid}));await store.refresh();expect(store.getSnapshot()).toEqual({snapshot:initial,stale:true,denied:false});
 });
 it("ignores late results from an unmounted instance",async()=>{
  const job=deferred(),listener=vi.fn(),store=createCustomerRefreshStore(initial,()=>job.promise);store.subscribe(listener);const run=store.refresh();store.stop();listener.mockClear();job.resolve({kind:"denied"});await run;expect(listener).not.toHaveBeenCalled();expect(store.getSnapshot().snapshot).toBe(initial);
 });
 it("restarts safely after a Strict Mode cleanup without allowing old results to clear new I/O",async()=>{
  const old=deferred(),fresh=deferred(),third=deferred(),load=vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise).mockReturnValueOnce(third.promise),store=createCustomerRefreshStore(initial,load);
  const oldRun=store.refresh();store.stop();store.start();const current=store.refresh();old.resolve({kind:"denied"});await oldRun;expect(store.refresh()).toBe(current);expect(load).toHaveBeenCalledTimes(2);fresh.resolve({kind:"ok",snapshot:initial});await Promise.resolve();third.resolve({kind:"ok",snapshot:initial});await current;expect(store.getSnapshot().denied).toBe(false);
 });
});
describe("private customer HTTP loader",()=>{
 it("sends only an explicit account, no cached requests, no redirects or external credentials",async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json(initial)),signal=new AbortController().signal;expect(await loadCustomerCoreSnapshot(account,signal,fetcher)).toEqual({kind:"ok",snapshot:initial});expect(fetcher).toHaveBeenCalledExactlyOnceWith(`/api/customer-portal/state?account=${account}`,{cache:"no-store",credentials:"same-origin",redirect:"error",signal});
 });
 it.each([401,403])("clears state on HTTP %i without reading a sensitive response body",async status=>{
  const response=new Response("PRIVATE CANARY",{status}),json=vi.spyOn(response,"json"),fetcher=vi.fn<typeof fetch>().mockResolvedValue(response);expect(await loadCustomerCoreSnapshot(account,new AbortController().signal,fetcher)).toEqual({kind:"denied"});expect(json).not.toHaveBeenCalled();
 });
 it.each([409,500,503])("treats HTTP %i as retryable without invented success",async status=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(null,{status}));expect(await loadCustomerCoreSnapshot(account,new AbortController().signal,fetcher)).toEqual({kind:"temporary"});
 });
 it("does not accept a successful response for another account",async()=>{
  const snapshot={...initial,workspace:{...initial.workspace,account:{...initial.workspace.account,id:foreign}}},fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot));expect(await loadCustomerCoreSnapshot(account,new AbortController().signal,fetcher)).toEqual({kind:"denied"});
 });
 it("validates the entire successful response instead of casting it",async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({...initial,privateSource:"CANARY"}));expect(await loadCustomerCoreSnapshot(account,new AbortController().signal,fetcher)).toEqual({kind:"temporary"});
 });
});
describe("independent foreground fallback and session clearing",()=>{
 it("checks on mount, focus, reconnect and visible changes; uses a 20-second timer",()=>{
  const window=new EventTarget(),document=new EventTarget(),store={refresh:vi.fn().mockResolvedValue(undefined),revoke:vi.fn(),markStale:vi.fn()},cancel=vi.fn();let tick!:()=>void,visible=true,online=true;
  const repeat=vi.fn((callback:()=>void)=>{tick=callback;return cancel;}),cleanup=observeCustomerRefresh(store,{window,document,visible:()=>visible,online:()=>online,repeat});expect(store.refresh).toHaveBeenCalledTimes(1);expect(repeat).toHaveBeenCalledWith(expect.any(Function),20000);
  window.dispatchEvent(new Event("focus"));window.dispatchEvent(new Event("online"));document.dispatchEvent(new Event("visibilitychange"));tick();expect(store.refresh).toHaveBeenCalledTimes(5);
  visible=false;tick();window.dispatchEvent(new Event("focus"));expect(store.refresh).toHaveBeenCalledTimes(5);visible=true;online=false;tick();expect(store.refresh).toHaveBeenCalledTimes(5);
  window.dispatchEvent(new Event("offline"));expect(store.markStale).toHaveBeenCalledTimes(1);window.dispatchEvent(new Event("notifications-account-cleared"));expect(store.revoke).toHaveBeenCalledTimes(1);
  cleanup();expect(cancel).toHaveBeenCalledTimes(1);online=true;window.dispatchEvent(new Event("focus"));window.dispatchEvent(new Event("notifications-account-cleared"));document.dispatchEvent(new Event("visibilitychange"));expect(store.refresh).toHaveBeenCalledTimes(5);expect(store.revoke).toHaveBeenCalledTimes(1);
 });
});
