import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  publish: vi.fn(),
  scan: vi.fn(),
  remove: vi.fn(),
  reportSelect: vi.fn(),
  reportEqTenant: vi.fn(),
  reportEqId: vi.fn(),
  reportEqOrder: vi.fn(),
  reportEqAuthor: vi.fn(),
  reportMaybeSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  getAuthContext: vi.fn(async () => ({
    user: { id: "aa000000-0000-4000-8000-000000000001", email: "worker@fieldgrid.test" },
    tenant: {
      id: "bb000000-0000-4000-8000-000000000001",
      roles: ["staff"],
      enabledServices: ["personeel", "rapportage", "planning"],
    },
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({ select: mocks.reportSelect }),
    storage: { from: () => ({ remove: mocks.remove }) },
  })),
}));
vi.mock("@/lib/files/scanned-storage", () => ({
  scanFileBytes: mocks.scan,
  publishScannedFile: mocks.publish,
  uploadScannedFile: vi.fn(),
}));

import { addReportEntry } from "@/app/staff/actions";

const tenantId = "bb000000-0000-4000-8000-000000000001";
const userId = "aa000000-0000-4000-8000-000000000001";
const workOrderId = "cc000000-0000-4000-8000-000000000001";
const mutationId = "dd000000-0000-4000-8000-000000000001";

function reportForm(files: File[], id = mutationId) {
  const form = new FormData();
  form.set("workOrderId", workOrderId);
  form.set("mutationId", id);
  form.set("body", "Veilige rapportbijlage");
  files.forEach((file) => form.append("photos", file));
  return form;
}

async function pdfFile(name = "bewijs.jpg") {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  return { bytes, file: new File([bytes], name, { type: "application/pdf" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scan.mockResolvedValue({ status: "clean", engine: "test", databaseVersion: "1", databaseAt: "2026-10-04T00:00:00Z" });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "staff_report_upload_allowed" ? true : { kind: "report_entry" },
    error: null,
  }));
  mocks.publish.mockImplementation(async ({ authorize }: { authorize: () => Promise<void> }) => {
    await authorize();
    return { sha256: "a".repeat(64) };
  });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.reportMaybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.reportEqAuthor.mockReturnValue({ maybeSingle: mocks.reportMaybeSingle });
  mocks.reportEqOrder.mockReturnValue({ eq: mocks.reportEqAuthor });
  mocks.reportEqId.mockReturnValue({ eq: mocks.reportEqOrder });
  mocks.reportEqTenant.mockReturnValue({ eq: mocks.reportEqId });
  mocks.reportSelect.mockReturnValue({ eq: mocks.reportEqTenant });
});

it("weigert meer dan vijf rapportbijlagen voordat upload of finalize start", async () => {
  const files = Array.from({ length: 6 }, (_, index) => new File([`foto-${index}`], `foto-${index}.jpg`, { type: "image/jpeg" }));
  await expect(addReportEntry(reportForm(files))).resolves.toEqual({ ok: false, error: "Maximaal vijf bijlagen per bericht" });
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("stageert canonieke bytes deterministisch en finaliseert regel plus metadata in één RPC", async () => {
  const { bytes, file } = await pdfFile();
  const result = await addReportEntry(reportForm([file]));

  expect(result).toEqual({ ok: true });
  // The action normalizes once; publishScannedFile owns the only malware scan
  // and its live authorization/attestation boundary is tested separately.
  expect(mocks.scan).not.toHaveBeenCalled();
  const published = mocks.publish.mock.calls[0][0];
  expect(published).toEqual(expect.objectContaining({
    bucket: "reports",
    path: expect.stringMatching(new RegExp(`^${tenantId}/${workOrderId}/${mutationId}/[0-9a-f-]+\\.pdf$`)),
    bytes: expect.any(Uint8Array),
    mime: "application/pdf",
  }));
  expect(mocks.rpc).toHaveBeenCalledWith("staff_finalize_report_entry", expect.objectContaining({
    target_tenant: tenantId,
    idempotency_key: mutationId,
    input: expect.objectContaining({
      reportEntryId: mutationId,
      workOrderId,
      body: "Veilige rapportbijlage",
      customerVisible: false,
      incidentSeverity: null,
      attachments: [expect.objectContaining({
        storagePath: published.path,
        fileName: "bewijs.pdf",
        mimeType: "application/pdf",
        sizeBytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      })],
    }),
  }));
});

it("weigert objecttoegang voordat een rapportbestand wordt genormaliseerd of gescand", async () => {
  const malformedPdf = new File(["geen pdf"], "bewijs.pdf", { type: "application/pdf" });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "staff_report_upload_allowed" ? false : { kind: "report_entry" },
    error: null,
  }));

  await expect(addReportEntry(reportForm([malformedPdf]))).resolves.toEqual({
    ok: false,
    error: "Geen actuele toegang om dit rapportbestand op te slaan.",
  });
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.scan).not.toHaveBeenCalled();
});

it("gebruikt bij een identieke retry hetzelfde opslagpad en dezelfde finalize-sleutel", async () => {
  const { file } = await pdfFile();
  await expect(addReportEntry(reportForm([file]))).resolves.toEqual({ ok: true });
  await expect(addReportEntry(reportForm([file]))).resolves.toEqual({ ok: true });

  expect(mocks.publish).toHaveBeenCalledTimes(2);
  expect(mocks.publish.mock.calls[0][0].path).toBe(mocks.publish.mock.calls[1][0].path);
  const finalizes = mocks.rpc.mock.calls.filter(([name]) => name === "staff_finalize_report_entry");
  expect(finalizes).toHaveLength(2);
  expect(finalizes[0][1]).toEqual(finalizes[1][1]);
});

it("ruimt staged bytes op wanneer finalize aantoonbaar niet heeft gecommit", async () => {
  const { file } = await pdfFile();
  mocks.rpc.mockImplementation(async (name: string) => name === "staff_finalize_report_entry"
    ? { data: null, error: { message: "Finalize mislukt" } }
    : { data: true, error: null });

  const result = await addReportEntry(reportForm([file]));

  expect(result).toEqual({ ok: false, error: "Finalize mislukt" });
  expect(mocks.reportEqTenant).toHaveBeenCalledWith("tenant_id", tenantId);
  expect(mocks.reportEqId).toHaveBeenCalledWith("id", mutationId);
  expect(mocks.reportEqOrder).toHaveBeenCalledWith("work_order_id", workOrderId);
  expect(mocks.reportEqAuthor).toHaveBeenCalledWith("author_user_id", userId);
  expect(mocks.remove).toHaveBeenCalledWith([mocks.publish.mock.calls[0][0].path]);
});

it("herstelt een verloren finalize-respons via dezelfde idempotente database-opdracht", async () => {
  const { file } = await pdfFile();
  let finalizeCalls = 0;
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name !== "staff_finalize_report_entry") return { data: true, error: null };
    finalizeCalls += 1;
    return finalizeCalls === 1
      ? { data: null, error: { message: "Netwerkrespons verloren" } }
      : { data: { kind: "report_entry" }, error: null };
  });

  await expect(addReportEntry(reportForm([file]))).resolves.toEqual({ ok: true });
  expect(finalizeCalls).toBe(2);
  expect(mocks.reportMaybeSingle).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("verwijdert bij twee onzekere finalize-responsen geen mogelijk gecommitteerde bytes", async () => {
  const { file } = await pdfFile();
  mocks.rpc.mockImplementation(async (name: string) => name === "staff_finalize_report_entry"
    ? { data: null, error: { message: "Database-uitkomst blijft onbekend" } }
    : { data: true, error: null });
  mocks.reportMaybeSingle.mockResolvedValue({ data: { id: mutationId }, error: null });

  await expect(addReportEntry(reportForm([file]))).resolves.toEqual({ ok: false, error: "Database-uitkomst blijft onbekend" });
  expect(mocks.rpc.mock.calls.filter(([name]) => name === "staff_finalize_report_entry")).toHaveLength(2);
  expect(mocks.remove).not.toHaveBeenCalled();
});
