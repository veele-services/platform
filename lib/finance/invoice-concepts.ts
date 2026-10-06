import { z } from "zod";

export const invoiceConceptSchema = z.object({
  id: z.uuid(), customerId: z.uuid(), number: z.string(), title: z.string(),
  version: z.number(), reportVersion: z.number(), updatedAt: z.string(), issuedOn: z.string(), dueOn: z.string(),
  customer: z.object({ name: z.string(), billingAddress: z.record(z.string(), z.unknown()), billingPreferences: z.record(z.string(), z.unknown()) }),
  branding: z.record(z.string(), z.unknown()),
  lines: z.array(z.object({ taskId: z.uuid(), description: z.string(), quantity: z.number(), unit: z.string(), unitPriceCents: z.number(), vatBasisPoints: z.number(), subtotalCents: z.number(), vatCents: z.number(), totalCents: z.number() })),
  subtotalCents: z.number(), vatCents: z.number(), totalCents: z.number(),
});
export type InvoiceConcept = z.infer<typeof invoiceConceptSchema>;
