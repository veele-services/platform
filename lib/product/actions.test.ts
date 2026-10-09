import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  rpc: vi.fn(),
  scan: vi.fn(),
}));
vi.mock("./data", () => ({
  getProductActor: mocks.actor,
  productRpc: mocks.rpc,
}));
vi.mock("@/lib/files/scanned-storage", () => ({
  publishScannedFile: mocks.scan,
}));
import { saveProduct, uploadProductFile } from "./actions";
const id = "11111111-1111-4111-8111-111111111111",
  fileId = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({
    db: {},
    tenantId: id,
    workspace: "backoffice",
  });
  mocks.rpc.mockResolvedValue({ id });
});
it("rejects forged submitter fields before any database operation", async () => {
  const result = await saveProduct({
    workspace: "backoffice",
    requestId: id,
    operation: {
      command: "submit_idea",
      payload: {
        title: "Planning",
        category: "Planning",
        problem: "Useful improvement",
        suggestion: "",
        benefit: "",
        createdBy: fileId,
      },
    },
  });
  expect(result.ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("passes the stable request ID with the server-resolved actor scope", async () => {
  const result = await saveProduct({
    workspace: "backoffice",
    requestId: id,
    operation: {
      command: "reply",
      payload: { id: fileId, revision: 1, body: "Additional information" },
    },
  });
  expect(result.ok).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledWith(
    {},
    "product_command",
    expect.objectContaining({
      target_tenant: id,
      actor_context: "backoffice",
      request_id: id,
    }),
  );
});
it("reauthorizes scanned uploads and never promotes a file after access is revoked during IO", async () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    workspace: "backoffice",
    id,
    kind: "idea",
    requestId: id,
  }))
    form.set(key, value);
  form.set("file", new File(["image"], "proof.png", { type: "image/png" }));
  let queries = 0;
  mocks.rpc.mockImplementation(async (_db, name) =>
    name === "product_command"
      ? { fileId, path: "idea/scope/file/bestand" }
      : ++queries === 1
        ? { path: "idea/scope/file/bestand", mime: "image/png", size: 5 }
        : Promise.reject({ code: "42501", message: "revoked" }),
  );
  mocks.scan.mockImplementation(async ({ authorize }) => {
    await authorize();
    await authorize();
    return { sha256: "a".repeat(64) };
  });
  expect((await uploadProductFile(form)).ok).toBe(false);
  expect(queries).toBe(2);
  expect(
    mocks.rpc.mock.calls.some(
      ([, name, args]) =>
        name === "product_command" && args.command === "file_finish",
    ),
  ).toBe(false);
});
