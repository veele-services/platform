import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  rows: {} as Record<string, Row[]>, rpcFiles: {} as Record<string, Row>,
  denied: false, tokenActive: true, reads: [] as string[],
  onDownload: () => {}, onRender: () => {},
  report: {} as Row, reportAsset: {} as Row,
}));
const t = "a0000000-0000-4000-8000-000000000001", parent = "a0000000-0000-4000-8000-000000000002";
const id = "a0000000-0000-4000-8000-000000000003", entry = "a0000000-0000-4000-8000-000000000004";
const bytes = new TextEncoder().encode("FICTITIOUS PRIVATE BYTES"), hash = createHash("sha256").update(bytes).digest("hex");
vi.mock("server-only", () => ({}));
// This suite tests source authorization; the real scan/receipt/Storage contract
// is exercised separately in scanned-storage and local HTTP integration tests.
vi.mock("@/lib/files/scanned-storage", () => ({ readScannedFile: async (bucket: string, path: string) => {
  state.reads.push(`${bucket}/${path}`); await Promise.resolve(); state.onDownload();
  return { bytes, mime: "application/pdf", sha256: hash };
} }));
const storage = { from: (bucket: string) => ({ download: async (path: string) => {
  state.reads.push(`${bucket}/${path}`);
  await Promise.resolve(); state.onDownload();
  return { data: new Blob([bytes]), error: null };
} }) };
function from(table: string) {
  const filters: Array<[string, unknown]> = [];
  const result = async () => ({ data: state.denied ? null : structuredClone(state.rows[table]?.find(row => filters.every(([key, value]) => row[key] === value)) ?? null), error: null });
  const query = {
    select: () => query, eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
    is: (key: string, value: unknown) => { filters.push([key, value]); return query; },
    single: result, maybeSingle: result, insert: async () => ({ error: null }),
  };
  return query;
}
const db = { from, storage, rpc: (name: string, args: Row) => {
  if(name==="personnel_document_file")return from("personnel_documents").eq("tenant_id",args.target_tenant).eq("id",args.target_document);
  return Promise.resolve({
    data: state.denied ? null : structuredClone(state.rpcFiles[name === "customer_file_access" ? `${name}:${args.kind}` : name] ?? {}),
    error: state.denied ? { code: "42501" } : null,
  });
} };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({ tenant: { id: t }, user: { id: parent } }) }));
vi.mock("@/lib/objects/auth", () => ({ getObjectActor: async () => ({ db, admin: db, tenant: { id: t } }) }));
vi.mock("@/lib/commercial/access", () => ({ quoteAccess: async () => ({ active: state.tokenActive, tenant: { id: t }, quote: { id, pdf_path: `${t}/quote/${id}/offerte.pdf`, logo_path: `${t}/quote/${id}/logo.png`, quote_number: "FICTITIOUS", revision: 1 }, snapshot: { attachments: [{ id: entry, sha256: hash }] } }) }));
vi.mock("@/lib/work-orders/report-rpc", () => ({ reportRpc: async (_db: unknown, _name: string, args: Row) => {
  if (state.denied) throw Error("Geen toegang");
  return structuredClone(args.asset_id ? state.reportAsset : state.report);
} }));
vi.mock("@/lib/work-orders/report-pdf", () => ({ renderWorkOrderReportPdf: async () => { await Promise.resolve(); state.onRender(); return bytes; } }));
import { downloadDossierDocument } from "@/lib/dossiers/download";
import { GET as customerFile } from "@/app/api/customer-files/[kind]/[id]/route";
import { GET as objectFile } from "@/app/api/files/object-document/[id]/route";
import { GET as attachmentFile } from "@/app/api/files/attachment/[id]/route";
import { GET as commercialFile } from "@/app/api/files/commercial/[id]/route";
import { GET as reportFile } from "@/app/api/files/work-order-report/[id]/route";
import { assertPrivateFile } from "./private-download";

const request = (query = "") => new Request(`https://tenant.staging.fieldgrid.nl/api/files/${id}${query}`);
const file = (bucket: string, scope: string[] = [t, parent], name = "contract.pdf") => ({ bucket, scope, path: `${scope.join("/")}/${name}`, name, mime: "application/pdf", sha256: hash });
const routes = [
  { name: "personnel registry", run: () => downloadDossierDocument(id, "personnel") },
  { name: "customer registry", run: () => downloadDossierDocument(entry, "customer") },
  { name: "customer portal document", run: () => customerFile(request(), { params: Promise.resolve({ kind: "document", id }) }) },
  { name: "customer invoice", run: () => customerFile(request(), { params: Promise.resolve({ kind: "invoice", id }) }) },
  { name: "object document with visit context", run: () => objectFile(request(`?order=${parent}`), { params: Promise.resolve({ id }) }) },
  { name: "report attachment", run: () => attachmentFile(request(), { params: Promise.resolve({ id }) }) },
  { name: "commercial backoffice PDF", run: () => commercialFile(request("?asset=pdf"), { params: Promise.resolve({ id }) }) },
  { name: "commercial backoffice attachment", run: () => commercialFile(request(), { params: Promise.resolve({ id: entry }) }) },
  { name: "commercial portal PDF", run: () => commercialFile(request("?portal=true&asset=pdf"), { params: Promise.resolve({ id }) }) },
  { name: "commercial portal attachment", run: () => commercialFile(request("?portal=true"), { params: Promise.resolve({ id: entry }) }) },
  { name: "external quote PDF", run: () => commercialFile(request("?token=fictitious&asset=pdf"), { params: Promise.resolve({ id }) }) },
  { name: "external quote attachment", run: () => commercialFile(request("?token=fictitious"), { params: Promise.resolve({ id: entry }) }) },
  { name: "external quote logo", run: () => commercialFile(request("?token=fictitious&asset=logo"), { params: Promise.resolve({ id }) }) },
  { name: "versioned report asset", run: () => reportFile(request(`?asset=${entry}`), { params: Promise.resolve({ id }) }) },
];
beforeEach(() => {
  state.denied = false; state.tokenActive = true; state.reads = []; state.onDownload = () => {}; state.onRender = () => {};
  state.rows = {
    dossier_documents: [
      { id, tenant_id: t, source_kind: "personnel", source_id: id, personnel_id: parent },
      { id: entry, tenant_id: t, source_kind: "customer", source_id: entry, customer_id: parent },
    ],
    personnel_documents: [{ id, tenant_id: t, personnel_id: parent, storage_path: `${t}/${parent}/contract.pdf`, file_name: "contract.pdf", mime_type: "application/pdf", sha256: hash }],
    customer_documents: [{ id: entry, tenant_id: t, customer_id: parent, storage_path: `${t}/${parent}/contract.pdf`, file_name: "contract.pdf", mime_type: "application/pdf", sha256: hash }],
    attachments: [{ id, tenant_id: t, work_order_id: parent, report_entry_id: entry, storage_bucket: "reports", storage_path: `${t}/${parent}/${entry}/photo.png`, file_name: "photo.png", mime_type: "image/png", sha256: hash, deleted_at: null }],
    quotes: [{ id, tenant_id: t, pdf_path: `${t}/quote/${id}/offerte.pdf`, logo_path: null, quote_number: "FICTITIOUS", revision: 1 }],
    commercial_attachments: [{ id: entry, tenant_id: t, quote_id: id, request_id: null, storage_path: `${t}/quote/${id}/attachment.pdf`, title: "FICTITIOUS", mime_type: "application/pdf", sha256: hash, public_in_offer: true }],
  };
  state.rpcFiles = {
    "customer_file_access:document": file("customer-documents"),
    "customer_file_access:invoice": file("invoices", [t, id]),
    get_object_document: file("object-documents"),
    commercial_customer_file: file("commercial-documents", [t, "quote", id]),
  };
  state.report = { id, version: 1, contentHash: "immutable-fixture-hash", snapshot: { number: "FICTITIOUS", attachments: [] }, signatures: [] };
  state.reportAsset = file("reports", [t, parent, entry]);
});

describe.each(routes)("private download: $name", ({ run }) => {
  it("serves authorized bytes without a reusable URL", async () => {
    const response = await run(); expect(response.status).toBe(200); expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
  it("rechecks the source after delayed Storage I/O", async () => {
    state.onDownload = () => { state.denied = true; state.tokenActive = false; };
    const response = await run(); expect(state.reads).toHaveLength(1); expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("FICTITIOUS PRIVATE BYTES");
  });
});

it("reauthorizes after the final PDF render", async () => {
  state.onRender = () => { state.denied = true; };
  expect((await reportFile(request(), { params: Promise.resolve({ id }) })).status).toBe(404);
});
it("preserves authorized historical reports and checks their rendered assets again", async () => {
  state.report.snapshot = { number: "FICTITIOUS", attachments: [{ id: entry }] }; state.reportAsset.mime = "image/png";
  const response = await reportFile(request(), { params: Promise.resolve({ id }) }); expect(response.status).toBe(200);
  state.onRender = () => { state.reportAsset.path = `${t}/${parent}/${entry}/replacement.png`; };
  expect((await reportFile(request(), { params: Promise.resolve({ id }) })).status).toBe(404);
});
it("keeps backoffice communication attachments downloadable", async () => {
  state.rows.attachments[0].report_entry_id = null;
  state.rows.attachments[0].storage_path = `${t}/${parent}/communication/${id}.png`;
  expect((await attachmentFile(request(), { params: Promise.resolve({ id }) })).status).toBe(200);
});
it("rejects a locator replacement during download despite continued source authorization", async () => {
  state.onDownload = () => { state.rows.personnel_documents[0].storage_path = `${t}/${parent}/replacement.pdf`; };
  expect((await downloadDossierDocument(id, "personnel")).status).toBe(404);
});
it("rejects incorrect file hashes", async () => {
  state.rows.personnel_documents[0].sha256 = "a".repeat(64);
  expect((await downloadDossierDocument(id, "personnel")).status).toBe(404);
});
it.each([`${parent}/${parent}/contract.pdf`, `${t}/${id}/contract.pdf`, `${t}/${parent}/../contract.pdf`, `${t}/${parent}/%2e%2e%2fcontract.pdf`, `${t}/${parent}/%252fcontract.pdf`, `${t}/${parent}/a\\b.pdf`, `${t}/${parent}/a\n.pdf`, `${t}/${parent}//a.pdf`, `${t}/${parent}/.`])("rejects unsafe legacy metadata before privileged I/O: %j", async path => {
  state.rows.personnel_documents[0].storage_path = path;
  expect((await downloadDossierDocument(id, "personnel")).status).toBe(404); expect(state.reads).toEqual([]);
});
it.each(["contract.pdf", `${id}.pdf`, `${id.replaceAll("-", "")}.pdf`, "Contract 2026.pdf"])("preserves canonical filenames: %s", name => {
  expect(() => assertPrivateFile(file("personnel-documents", [t, parent], name))).not.toThrow();
});
