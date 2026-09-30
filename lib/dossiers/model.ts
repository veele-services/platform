import type { Row } from "@/lib/objects/model";
export type ChainScope = { customerId?: string; objectId?: string; personnelId?: string; orderId?: string };
export type ChainAction = { kind: "request" | "execution" | "object" | "personnel"; id: string; title: string; status: string; priority: string; due_on: string | null; owner_id: string | null; version: number; customer_id: string | null; object_id: string | null; personnel_id: string | null; work_order_id: string | null; needs_review: boolean; href: string };
export type ChainDocument = { id: string; source_kind: string; source_id: string; classification: string; title: string; version: number; created_at: string; document_on: string | null; valid_until: string | null; href: string };
export type Agreement = Row<"customer_agreements"> & { lines: Row<"customer_agreement_lines">[] };
export type DossierChain = {
  actions: ChainAction[]; documents: ChainDocument[];
  requests: Array<Row<"object_visit_requests"> & { customer_id: string; proposals: Row<"object_request_proposals">[] }>;
  agreements: Agreement[];
  invoices: Array<{ id: string; number: string | null; status: string; total: number; paid: number; due: string | null }>;
  timeline: Array<{ id: string; sourceId: string; type: string; version: number; at: string; event: string }>;
};
