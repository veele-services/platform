import { z } from "zod";
import type { Row } from "@/lib/objects/model";
import type { Agreement, DossierChain } from "@/lib/dossiers/model";
import type { CommercialRow } from "@/lib/commercial/model";

export const customerTabs = [
  ["overzicht", "Overzicht"],
  ["gegevens", "Klantgegevens"],
  ["contactpersonen", "Contactpersonen"],
  ["objecten", "Objecten"],
  ["contracten", "Contracten & diensten"],
  ["afspraken", "Afspraken & opdrachten"],
  ["offertes", "Offertes & meerwerk"],
  ["facturen", "Facturen & betalingen"],
  ["kwaliteit", "Kwaliteit & meldingen"],
  ["documenten", "Documenten"],
  ["communicatie", "Communicatie & tijdlijn"],
] as const;
export type CustomerTab = (typeof customerTabs)[number][0];
export const customerStates: Record<string, string> = {
  draft: "Concept",
  lead: "Prospect",
  active: "Actief",
  paused: "Gepauzeerd",
  inactive: "Voormalig",
  archived: "Gearchiveerd",
};
export const customerTypes: Record<string, string> = {
  business: "Zakelijk",
  private: "Particulier",
  association: "Vereniging / stichting",
  government: "Overheid",
  other: "Overig",
};
export const contactLabels: Record<string, string> = {
  operational: "Operationeel",
  billing: "Facturatie",
  decision: "Besluitvorming",
  emergency: "Noodcontact",
};
export const documentCategories: Record<string, string> = {
  agreement: "Contract / addendum",
  correspondence: "Correspondentie",
  report: "Rapport",
  photo: "Foto",
  other: "Overig",
};
export const canManageCustomers = (roles: string[]) =>
  roles.some((r) =>
    ["tenant_admin", "management", "planner", "finance"].includes(r),
  );
export const canReadFinance = (roles: string[]) =>
  roles.some((r) => ["tenant_admin", "management", "finance"].includes(r));
export function customerTab(value?: string): CustomerTab {
  const aliases: Record<string, CustomerTab> = {
    overview: "overzicht",
    contacts: "contactpersonen",
    objects: "objecten",
    notes: "communicatie",
    documents: "documenten",
    agreements: "contracten",
    executions: "afspraken",
    finance: "facturen",
    commercial: "offertes",
    requests: "offertes",
    timeline: "communicatie",
    actions: "overzicht",
  };
  return customerTabs.some(([key]) => key === value)
    ? (value as CustomerTab)
    : aliases[value ?? ""] || "overzicht";
}
export function customerReturn(value?: string) {
  return value &&
    /^\/app\/klanten(?:\?|$)/.test(value) &&
    !/[\r\n\\]/.test(value)
    ? value
    : "/app/klanten";
}
export const customerFilters = z.object({
  q: z.string().max(200).catch(""),
  status: z
    .enum(["", "draft", "lead", "active", "paused", "inactive", "archived"])
    .catch(""),
  type: z
    .enum(["", "business", "private", "association", "government", "other"])
    .catch(""),
  city: z.string().max(120).catch(""),
  owner: z.uuid().or(z.literal("")).catch(""),
  service: z.string().max(120).catch(""),
  attention: z
    .enum(["", "objects", "requests", "actions", "finance", "commercial"])
    .catch(""),
  sort: z
    .enum([
      "name",
      "name_desc",
      "number",
      "city",
      "status",
      "next_visit",
      "attention",
    ])
    .catch("name"),
  page: z.coerce.number().int().min(1).max(100000).catch(1),
  pageSize: z.coerce.number().int().min(10).max(100).catch(25),
});
export type CustomerFilters = z.infer<typeof customerFilters>;
export type Owner = { id: string; label: string; commercial: boolean };
export type CustomerList = {
  rows: Array<
    Pick<
      Row<"customers">,
      | "id"
      | "name"
      | "customer_number"
      | "customer_type"
      | "status"
      | "version"
      | "owner_user_id"
    > & {
      city: string;
      contact: string | null;
      objects: number;
      next_visit: string | null;
      requests: number;
      actions: number;
      financial_attention: number | null;
    }
  >;
  total: number;
  page: number;
  pageSize: number;
  finance: boolean;
};
export type CustomerObject = Pick<
  Row<"objects">,
  | "id"
  | "customer_id"
  | "object_number"
  | "name"
  | "address"
  | "object_type"
  | "dossier_status"
  | "version"
>;
export type CustomerOrder = Pick<
  Row<"work_orders">,
  | "id"
  | "object_id"
  | "work_order_number"
  | "discipline"
  | "status"
  | "projected_start_at"
  | "projected_end_at"
  | "quote_id"
>;
export type CustomerDocument = Omit<
  Row<"customer_documents">,
  "storage_path" | "sha256"
>;
export type CustomerData = {
  defaultPaymentTermsDays: number;
  commercialFollowup: CommercialRow[];
  customer: Row<"customers">;
  owners: Owner[];
  contacts: Row<"customer_contacts">[];
  objects: CustomerObject[];
  notes: Row<"customer_notes">[];
  documents: CustomerDocument[];
  orders: CustomerOrder[];
  records: Row<"object_records">[];
  assignments: Pick<
    Row<"work_order_assignments">,
    "id" | "work_order_id" | "personnel_id"
  >[];
  personnel: Array<{ id: string; full_name: string }>;
  agreements: Agreement[];
  tasks: Row<"task_catalog">[];
  revisions: Row<"task_revisions">[];
  invoices: Row<"invoices">[];
  invoiceLines: Row<"invoice_lines">[];
  chain: DossierChain;
  history: Array<{
    id: string;
    at: string;
    actor: string;
    source: string;
    action: string;
  }>;
};
