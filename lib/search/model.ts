import { z } from "zod";
import type { TenantContext } from "@/lib/auth/context";

export const searchInput = z.object({ query: z.string().trim().min(3).max(100) }).strict();
export type SearchResult = { id: string; title: string; detail: string; href: string };
export type SearchGroup = { id: string; title: string; results: SearchResult[] };

const managers = ["tenant_admin", "management"];
export const searchCategories = [
  { id: "customers", title: "Klanten", table: "customers", fields: ["name", "customer_number"], label: "name", detail: "customer_number", service: "planning", roles: [...managers, "planner", "finance"], path: "/app/klanten?record=" },
  { id: "objects", title: "Objecten", table: "objects", fields: ["name", "object_number"], label: "name", detail: "object_number", service: "planning", roles: [...managers, "planner", "finance"], path: "/app/objecten/" },
  { id: "orders", title: "Werkbonnen", table: "work_orders", fields: ["work_order_number", "title"], label: "work_order_number", detail: "title", service: "planning", roles: [...managers, "planner", "finance"], path: "/app/werkbonnen/" },
  { id: "requests", title: "Aanvragen", table: "requests", fields: ["request_number", "subject"], label: "request_number", detail: "subject", service: "planning", roles: [...managers, "planner"], path: "/app/aanvragen?recordKind=request&record=" },
  { id: "quotes", title: "Offertes", table: "quotes", fields: ["quote_number", "subject"], label: "quote_number", detail: "subject", service: "planning", roles: [...managers, "planner", "finance"], path: "/app/aanvragen?tab=quotes&recordKind=quote&record=" },
  { id: "people", title: "Personeel", table: "personnel", fields: ["full_name", "employee_number"], label: "full_name", detail: "employee_number", service: "personeel", roles: [...managers, "hr"], path: "/app/personeel/" },
  { id: "invoices", title: "Facturen", table: "invoices", fields: ["invoice_number"], label: "invoice_number", detail: "invoice_number", service: "finance", roles: [...managers, "finance"], path: "/app/facturen?record=" },
] as const;

export function allowedSearchCategories(tenant: TenantContext) {
  return searchCategories.filter(category => tenant.enabledServices.includes(category.service) && tenant.roles.some(role => (category.roles as readonly string[]).includes(role)));
}

/** PostgREST values are quoted; SQL pattern metacharacters stay literal. */
export function literalSearchFilter(fields: readonly string[], query: string) {
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const quoted = JSON.stringify(pattern);
  return fields.map(field => `${field}.ilike.${quoted}`).join(",");
}
