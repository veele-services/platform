import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("current authority immediately before privileged side effects", () => {
  it("rechecks finance access after attachment I/O and before provider submission", () => {
    const code = source("app/app/finance-actions.ts");
    const attachment = code.indexOf("readMailAttachment(context.tenant.id");
    const recheck = code.indexOf('await confirmFinanceAction(context,"backoffice.functions.send_invoice")', attachment);
    const provider = code.indexOf("providerStarted = true", recheck);
    expect(attachment).toBeGreaterThan(0);
    expect(recheck).toBeGreaterThan(attachment);
    expect(provider).toBeGreaterThan(recheck);
  });

  it("rechecks commercial dossier access after scan/upload and before metadata insert", () => {
    const code = source("app/app/commercial-delivery-actions.ts");
    const upload = code.indexOf('await uploadScannedFile(db,"commercial-documents"');
    const recheck = code.indexOf('const currentAccess=await db.rpc("commercial_detail"', upload);
    const insert = code.indexOf('admin.from("commercial_attachments").insert', recheck);
    expect(recheck).toBeGreaterThan(upload);
    expect(insert).toBeGreaterThan(recheck);
  });

  it("rechecks platform authority after scan/upload and before branding mutation", () => {
    const code = source("app/platform/actions.ts");
    const upload = code.indexOf('await uploadScannedFile(await createClient(), "branding"');
    const recheck = code.indexOf("const currentContext = await requirePlatformAdmin()", upload);
    const update = code.indexOf('admin.from("tenant_branding").update', recheck);
    expect(recheck).toBeGreaterThan(upload);
    expect(update).toBeGreaterThan(recheck);
  });
});
