"use server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { productCommandSchema, productWorkspaceSchema } from "./model";
import { getProductActor, productRpc } from "./data";
import { publishScannedFile } from "@/lib/files/scanned-storage";
function message(error: unknown) {
  const e = error as {
    code?: string;
    message?: string;
  };
  return e.code === "40001"
    ? "Deze gegevens zijn gewijzigd. Vernieuw en probeer opnieuw."
    : error instanceof z.ZodError
      ? (error.issues[0]?.message ?? "Controleer de invoer.")
      : e.code === "23514" || e.code === "23505"
        ? (e.message ?? "Controleer de opdracht.")
        : "De opdracht kon niet worden voltooid. Controleer je toegang en probeer opnieuw.";
}
export async function saveProduct(input: unknown) {
  try {
    const p = productCommandSchema.parse(input),
      a = await getProductActor(p.workspace);
    const result = z
      .object({ id: z.uuid() })
      .parse(
        await productRpc(a.db, "product_command", {
          target_tenant: a.tenantId,
          actor_context: a.workspace,
          command: p.operation.command,
          payload: p.operation.payload,
          request_id: p.requestId,
        }),
      );
    return { ok: true as const, ...result };
  } catch (error) {
    return { ok: false as const, error: message(error) };
  }
}
export async function uploadProductFile(form: FormData) {
  try {
    const workspace = productWorkspaceSchema.parse(form.get("workspace")),
      id = z.uuid().parse(form.get("id")),
      kind = z.enum(["idea", "change"]).parse(form.get("kind")),
      requestId = z.uuid().parse(form.get("requestId")),
      file = form.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > 10485760)
      throw new Error("Gebruik een bestand van maximaal 10 MB.");
    const a = await getProductActor(workspace),
      args = { target_tenant: a.tenantId, actor_context: a.workspace };
    const intent = z
      .object({ fileId: z.uuid(), path: z.string() })
      .parse(
        await productRpc(a.db, "product_command", {
          ...args,
          command: "file_intent",
          payload: {
            id,
            kind,
            name: file.name,
            mime: file.type,
            size: file.size,
          },
          request_id: requestId,
        }),
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await publishScannedFile({
      bucket: "product-documents",
      path: intent.path,
      bytes,
      mime: file.type,
      authorize: async () => {
        const current = z
          .object({ path: z.string(), mime: z.string(), size: z.number() })
          .parse(
            await productRpc(a.db, "product_query", {
              ...args,
              operation: "upload",
              payload: { id: intent.fileId },
            }),
          );
        if (
          current.path !== intent.path ||
          current.mime !== file.type ||
          current.size !== file.size
        )
          throw new Error("Uploadtoegang gewijzigd.");
      },
    });
    const hash = createHash("sha256")
      .update(`product-upload-finish:${requestId}`)
      .digest("hex");
    const finishId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    await productRpc(a.db, "product_command", {
      ...args,
      command: "file_finish",
      payload: { id: intent.fileId, sha256: result.sha256 },
      request_id: finishId,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: message(error) };
  }
}
