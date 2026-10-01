import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc, storage: { from: () => ({ download: mocks.download }) } }) }));
// Authorization suite. Real scan/receipt behavior has its own HTTP integration.
vi.mock("@/lib/files/scanned-storage", () => ({ readScannedFile: async () => {
  const result = await mocks.download();
  return { bytes: new Uint8Array(await result.data.arrayBuffer()), mime: "application/pdf" };
} }));
import { readMailAttachment } from "./mail-attachment";

const tenant = "10000000-0000-4000-8000-000000000001", parent = "10000000-0000-4000-8000-000000000002";
const bytes = new TextEncoder().encode("FICTITIOUS PDF BYTES"), hash = createHash("sha256").update(bytes).digest("hex");
const file = { bucket: "invoices", path: `${tenant}/${parent}/fixture.pdf`, scope: [tenant, parent], sha256: hash, mime: "application/pdf", name: "fixture.pdf" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockResolvedValue({ data: file, error: null });
  mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
});
it("reads the exact frozen source and reauthorizes after reading the bytes", async () => {
  expect(await readMailAttachment(tenant, "mail-id", file.path)).toEqual({ filename: file.name, bytes });
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  expect(mocks.rpc).toHaveBeenCalledWith("notification_mail_attachment", { target_tenant: tenant, target_mail_id: "mail-id" });
});
it.each([
  { ...file, path: `${tenant}/another-parent/fixture.pdf` },
  { ...file, path: `${tenant}/${parent}/%2e%2e/file.pdf` },
  { ...file, path: `another-tenant/${parent}/fixture.pdf`, scope: ["another-tenant", parent] },
])("rejects aliases before privileged Storage access", async invalid => {
  mocks.rpc.mockResolvedValue({ data: invalid, error: null });
  await expect(readMailAttachment(tenant, "mail-id", invalid.path)).rejects.toThrow();
  expect(mocks.download).not.toHaveBeenCalled();
});
it("refuses changed source or recipient authorization after I/O", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: file, error: null }).mockResolvedValueOnce({ data: null, error: { code: "42501" } });
  await expect(readMailAttachment(tenant, "mail-id", file.path)).rejects.toThrow("Maildocument niet beschikbaar");
});
it("checks a persisted invoice digest before handing bytes to the sender", async () => {
  mocks.download.mockResolvedValue({ data: new Blob(["TAMPERED"]), error: null });
  await expect(readMailAttachment(tenant, "mail-id", file.path)).rejects.toThrow("Bestandscontrole mislukt");
});
it("preserves an offered quote without an invoice digest", async () => {
  const quote = { ...file, bucket: "commercial-documents", path: `${tenant}/quote/${parent}/offerte.pdf`, scope: [tenant, "quote", parent], sha256: null };
  mocks.rpc.mockResolvedValue({ data: quote, error: null });
  expect((await readMailAttachment(tenant, "mail-id", quote.path)).bytes).toEqual(bytes);
});
