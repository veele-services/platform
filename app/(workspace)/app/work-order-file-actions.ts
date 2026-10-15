"use server";
import { uploadScannedFile } from "@/lib/files/scanned-storage";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { getAuthContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { customerDocumentExtension, customerDocumentFileName, validateDossierDocumentName } from "@/lib/customers/documents";
import type { Json } from "@/lib/database.types";

export async function addWorkOrderCommunication(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { tenant } = await getAuthContext();
    if (!tenant?.enabledServices.includes("planning") || !tenant.roles.some(r => ["tenant_admin", "management", "planner"].includes(r))) throw new Error("Geen toegang tot werkboncommunicatie.");
    const input = z.object({ mutationId: z.uuid(), orderId: z.uuid(), body: z.string().trim().max(5000), customerVisible: z.boolean() }).parse({ mutationId: form.get("mutationId"), orderId: form.get("orderId"), body: form.get("body") || "", customerVisible: form.get("customerVisible") === "on" });
    const db = await createClient();
    const { error: accessError } = await db.rpc("work_order_dossier", { target_tenant: tenant.id, target_order: input.orderId });
    if (accessError) throw new Error("Deze werkbon is niet beschikbaar.");
    const file = form.get("file");
    let attachment: Json | undefined;
    if (file instanceof File && file.size) {
      if (file.size > 10 * 1024 * 1024) throw new Error("Gebruik een bestand van maximaal 10 MB.");
      const bytes = Buffer.from(await file.arrayBuffer());
      const extension = customerDocumentExtension(file.type, bytes), name = customerDocumentFileName(file.name);
      validateDossierDocumentName("", name);
      try { if (file.type === "application/pdf") await PDFDocument.load(bytes); else await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" }).stats(); }
      catch { throw new Error("Het bestand kan niet worden gelezen. Gebruik een geldige PDF, JPG of PNG."); }
      const hash = createHash("sha256").update(bytes).digest("hex"), path = `${tenant.id}/${input.orderId}/communication/${input.mutationId}.${extension}`;
      await uploadScannedFile(db, "reports", path, bytes, file.type);
      attachment = { path, sha256: hash, mime: file.type, size: file.size, name };
    }
    if (!input.body && !attachment) throw new Error("Vul een bericht in of kies een bestand.");
    const result = await db.rpc("work_order_communication", { target_tenant: tenant.id, input: { ...input, ...(attachment ? { attachment } : {}) } });
    if (result.error) throw new Error(result.error.code === "23514" ? result.error.message : "Opslaan is niet bevestigd. Probeer opnieuw met dezelfde invoer.");
    revalidatePath("/app", "layout"); revalidatePath("/staff"); revalidatePath("/klant", "layout");
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof z.ZodError ? "Controleer de berichtgegevens." : e instanceof Error ? e.message : "Opslaan is niet gelukt." }; }
}
