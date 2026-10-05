import { z } from "zod";
export const managedCustomerAccountSchema=z.object({id:z.uuid(),userId:z.uuid(),email:z.string().email(),contactId:z.uuid().nullable(),active:z.boolean(),canCreateObjects:z.boolean(),canEditObjects:z.boolean(),canEditProfile:z.boolean(),version:z.number().int().positive(),onboardingCompletedAt:z.string().nullable()}).strict();
export type ManagedCustomerAccount=z.infer<typeof managedCustomerAccountSchema>;
export const manageCustomerAccountSchema=z.object({customerId:z.uuid(),contactId:z.uuid(),email:z.string().trim().email().max(254).transform(value=>value.toLowerCase()),version:z.number().int().nonnegative(),active:z.boolean(),canCreateObjects:z.boolean(),canEditObjects:z.boolean(),canEditProfile:z.boolean()}).strict();
