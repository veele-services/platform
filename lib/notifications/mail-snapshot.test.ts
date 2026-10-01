import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({ getServerEnv: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { SendGridDeliveryError } from "../providers/sendgrid";
import { NotificationSuppressedError } from "./provider-policy";
import { freezeMailSnapshot, mailFailureOutcome, mailSnapshotSchema } from "./mail-snapshot";

const draft = { fromEmail: "sender@example.test", fromName: "FICTITIOUS tenant", to: "recipient@example.test", subject: "FICTITIOUS offer", text: "Offerte bekijken", html: "<p>Offerte bekijken</p>", targetUrl: "https://example.test/quote/fixture-only", templateRevision: 1, attachmentPath: "fixture/document.pdf", attachmentFilename: "offerte.pdf" };

describe("frozen commercial email", () => {
  it("requires an atomic service snapshot and uses its prior content on retry", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: draft, error: null });
    const db = { rpc } as unknown as Parameters<typeof freezeMailSnapshot>[0];
    const frozen = await freezeMailSnapshot(db, "tenant", "delivery", { ...draft, subject: "Changed template", templateRevision: 9 });
    expect(frozen).toEqual(draft);
    expect(rpc).toHaveBeenCalledWith("notification_mail_snapshot", expect.objectContaining({ target_tenant: "tenant", delivery_id: "delivery" }));
  });
  it("never falls back to a fresh render when persistence fails", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "private database detail" } }) } as unknown as Parameters<typeof freezeMailSnapshot>[0];
    await expect(freezeMailSnapshot(db, "tenant", "delivery", draft)).rejects.toThrow("De vaste berichtversie kon niet worden opgeslagen");
  });
  it("rejects header injection and malformed snapshots", () => {
    expect(mailSnapshotSchema.safeParse({ ...draft, subject: "Text\r\nBcc: outsider@example.test" }).success).toBe(false);
    expect(mailSnapshotSchema.safeParse({ ...draft, templateRevision: 0 }).success).toBe(false);
  });
  it.each([408, 500, 503])("does not blindly retry ambiguous HTTP %i", status => expect(mailFailureOutcome(new SendGridDeliveryError("FICTITIOUS response", status))).toBe("uncertain"));
  it.each([400, 401, 429])("records rejected HTTP %i as failed", status => expect(mailFailureOutcome(new SendGridDeliveryError("FICTITIOUS response", status))).toBe("failed"));
  it("keeps suppression and network ambiguity separate", () => {
    expect(mailFailureOutcome(new NotificationSuppressedError("master_off"))).toBe("suppressed");
    expect(mailFailureOutcome(new TypeError("fetch failed"))).toBe("uncertain");
  });
});
