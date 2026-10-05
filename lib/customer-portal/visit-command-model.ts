import { z } from "zod";
const id=z.uuid(),version=z.number().int().positive().safe();
export const visitRequestFields=z.object({title:z.string().trim().min(2).max(180),body:z.string().trim().min(2).max(10000),nodeId:id.or(z.literal("")),kind:z.enum(["attention","change","problem","extra"]),priority:z.enum(["normal","high","urgent"]),feedback:z.string().trim().max(1000)}).strict();
const request={requestId:id,version};
export const visitRequestAction=z.discriminatedUnion("operation",[
 z.object({operation:z.literal("create"),visitVersion:version,fields:visitRequestFields}).strict(),
 z.object({operation:z.literal("update"),...request,fields:visitRequestFields}).strict(),
 z.object({operation:z.literal("read"),...request}).strict(),
 z.object({operation:z.literal("withdraw"),...request,reason:z.string().trim().min(2).max(1000)}).strict(),
 z.object({operation:z.literal("accept"),...request,proposalId:id,proposalVersion:version,confirmed:z.literal(true)}).strict(),
]);
export const visitRequestCommand=z.object({accountId:id,visitId:id,commandId:id,action:visitRequestAction}).strict();
export type VisitRequestFields=z.infer<typeof visitRequestFields>;
export type VisitRequestAction=z.infer<typeof visitRequestAction>;
