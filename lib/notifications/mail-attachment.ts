import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { bufferPrivateFile, samePrivateFile } from "@/lib/files/private-download";

const fileSchema = z.object({ bucket: z.enum(["invoices", "commercial-documents"]), path: z.string(), scope: z.array(z.string()).min(2), sha256: z.string().nullable(), mime: z.literal("application/pdf"), name: z.string() });
/** Resolves the actual frozen mail source twice. Never infer an invoice or quote
 * from a job's path alone; provider admission checks recipient/policy again. */
export async function readMailAttachment(tenantId: string, mailId: string, frozenPath: string) {
  const resolve = async () => {
    const db = createAdminClient();
    const rpc = db.rpc.bind(db) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    const response = await rpc("notification_mail_attachment", { target_tenant: tenantId, target_mail_id: mailId });
    if (response.error) throw new Error("Maildocument niet beschikbaar");
    const file = fileSchema.parse(response.data);
    if (file.scope[0] !== tenantId || file.path !== frozenPath) throw new Error("Maildocument komt niet overeen met de bronregistratie");
    return file;
  };
  const file = await resolve();
  const bytes = await bufferPrivateFile(file);
  if (bytes.length > 20 * 1024 * 1024 || !samePrivateFile(file, await resolve())) throw new Error("Maildocument niet beschikbaar");
  return { filename: file.name, bytes };
}
