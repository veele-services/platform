import {z} from 'zod';
export const tenantLifecycleSchema=z.object({tenantId:z.uuid(),status:z.enum(['active','suspended']),version:z.number().int().positive(),requestId:z.uuid()}).strict();
export const tenantLifecycleResultSchema=z.object({ok:z.literal(true),tenantId:z.uuid(),status:z.enum(['active','suspended']),version:z.number().int().positive(),changed:z.boolean()});
