import { beforeEach, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({rpc:vi.fn(),actor:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({})}));
vi.mock("./auth",()=>({getNotificationActor:mock.actor}));
vi.mock("../tickets/rpc",()=>({ticketRpc:mock.rpc}));
import { notificationPushPost, notificationPushRequest, runNotificationPushRequest } from "./push-device";
const id="11000000-0000-4000-8000-000000000001",origin="https://fixture.staging.fieldgrid.nl";
const subscription={endpoint:"https://fcm.googleapis.com/fcm/send/fictitious",keys:{p256dh:"a".repeat(87),auth:"b".repeat(22)}};
const request=(body:unknown,headers:Record<string,string>={})=>new Request(`${origin}/api/notifications/push`,{method:"POST",headers:{origin,host:new URL(origin).host,"content-type":"application/json",...headers},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mock.actor.mockResolvedValue({tenantId:id,user:{id},sessionId:id});mock.rpc.mockResolvedValue({active:true,currentDeviceId:id,contexts:["staff"],devices:[],unsubscribeBrowser:false});});
it("binds registration only to the server-resolved actor tenant and session",async()=>{
 const input={workspace:"staff",action:"subscribe",subscription};expect((await runNotificationPushRequest(request(input),input))).toMatchObject({active:true});
 expect(mock.rpc).toHaveBeenCalledWith({},"notification_push_device",{target_tenant:id,actor_context:"staff",actor_id:id,session_id:id,operation:"subscribe",input:{origin,...subscription}});
 expect(notificationPushRequest.safeParse({...input,tenantId:id}).success).toBe(false);
});
it.each(["https://fcm.googleapis.com.attacker.invalid/x","https://127.0.0.1/api/worker","http://fcm.googleapis.com/x"])("rejects untrusted push endpoint %s",async endpoint=>{
 const response=await notificationPushPost(request({workspace:"staff",action:"subscribe",subscription:{...subscription,endpoint}}));expect(response.status).toBe(400);expect(mock.rpc).not.toHaveBeenCalled();
});
it("rejects cross-origin mutation and bounds streamed input without exposing endpoint data",async()=>{
 expect((await notificationPushPost(request({workspace:"staff",action:"status"},{origin:"https://attacker.invalid"}))).status).toBe(400);
 expect((await notificationPushPost(request({workspace:"staff",action:"status",payload:"x".repeat(10000)}))).status).toBe(400);
 expect(mock.rpc).not.toHaveBeenCalled();
});
it("returns private no-store state only after the database confirms current registration",async()=>{
 const response=await notificationPushPost(request({workspace:"staff",action:"status",subscription:{endpoint:subscription.endpoint}}));expect(response.headers.get("cache-control")).toContain("no-store");expect((await response.json()).active).toBe(true);
 mock.rpc.mockRejectedValueOnce(new Error("PRIVATE ENDPOINT CANARY"));const failed=await notificationPushPost(request({workspace:"staff",action:"unsubscribe",subscription:{endpoint:subscription.endpoint}}));expect(failed.status).toBe(400);expect(JSON.stringify(await failed.json())).not.toContain("CANARY");
});
