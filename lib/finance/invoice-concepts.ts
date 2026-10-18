import { z } from "zod";

export const invoiceConceptSchema = z.object({
  id: z.uuid(), customerId: z.uuid(), number: z.string(), title: z.string(),
  version: z.number(), reportVersion: z.number(), updatedAt: z.string(), issuedOn: z.string(), dueOn: z.string(),
  customer: z.object({ name: z.string(), legalName: z.string().nullish().transform(value=>value??""), companyNumber: z.string().nullish().transform(value=>value??""), vatNumber: z.string().nullish().transform(value=>value??""), email: z.string().nullish().transform(value=>value??""), phone: z.string().nullable().optional(), billingAddress: z.record(z.string(), z.unknown()), billingPreferences: z.record(z.string(), z.unknown()) }),
  branding: z.record(z.string(), z.unknown()),
  lines: z.array(z.object({ sourceType:z.enum(["task","material"]).optional(),sourceId:z.uuid().optional(),taskId:z.uuid().nullable().optional(),materialId:z.uuid().nullable().optional(), description: z.string(), quantity: z.number(), unit: z.string(), unitPriceCents: z.number(), vatBasisPoints: z.number(), subtotalCents: z.number(), vatCents: z.number(), totalCents: z.number() }).refine(line=>Boolean(line.sourceId??line.taskId??line.materialId),"Factuurbron ontbreekt")),
  subtotalCents: z.number(), vatCents: z.number(), totalCents: z.number(),
});
export type InvoiceConcept = z.infer<typeof invoiceConceptSchema>;
