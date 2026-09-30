import { z } from "zod";
import { getObjectActor } from "@/lib/objects/auth";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const { kind, id } = await params;
    z.enum(["document", "invoice"]).parse(kind);
    z.uuid().parse(id);
    const { db, admin, tenant } = await getObjectActor();
    const r = await db.rpc("customer_file_access", {
      target_tenant: tenant.id,
      target_id: id,
      kind,
    });
    if (r.error) throw r.error;
    const file = r.data as {
      bucket: string;
      path: string;
      name: string;
      mime: string;
    };
    const download = await admin.storage.from(file.bucket).download(file.path);
    if (download.error || !download.data) throw new Error();
    const disposition =
      new URL(request.url).searchParams.get("preview") === "1"
        ? "inline"
        : "attachment";
    return new Response(download.data, {
      headers: {
        ...headers,
        "Content-Type": file.mime,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      },
    });
  } catch {
    return new Response("Document niet gevonden", { status: 404, headers });
  }
}
