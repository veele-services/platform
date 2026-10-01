import { describe, expect, it } from "vitest";
import { notificationCommandPayload } from "./commands";
import { notificationQueryFromSearch, recipientCriteriaSchema } from "./model";
import { projectNotification, projectNotificationAccess, projectRecipients, projectTemplate, projectPolicy, projectRule, projectCampaign, projectSettings, safeNotificationTarget } from "./projection";
import { notificationPolicyImpact, notificationReason, templateDraftError, templatePreviewText } from "./presentation";
import { createNotificationRequestGate } from "./request-gate";

const id = "11111111-1111-4111-8111-111111111111";
describe("central notification UI boundary", () => {
  it("uses the authorized server tenant count rather than the visible tenant-list length", () => {
    const access = projectNotificationAccess({ allowed: true, permissions: { manage_global: true } }, "platform", id, null);
    const data = projectSettings({ tenants: [{ id, label: "Een toegestane tenant" }], impact: { active_tenant_count: 17, global_active_tenant_count: 17 } });
    const dimensions = { tenantId: "", context: "", typeCode: "", channel: "" };
    expect(notificationPolicyImpact(access, data, dimensions).tenantCount).toBe(17);
    expect(notificationPolicyImpact(access, data, { ...dimensions, tenantId: id }).tenantCount).toBe(1);
    expect(notificationPolicyImpact(access, data, { ...dimensions, tenantId: "unavailable" }).tenantCount).toBeNull();
    expect(notificationPolicyImpact(access, projectSettings({ tenants: data.tenants }), dimensions).tenantCount).toBeNull();
    expect(projectSettings({ impact: { active_tenant_count: -1, global_active_tenant_count: 1.2 } }).impact).toEqual({ activeTenantCount: null, globalActiveTenantCount: null });
  });
  it("explains invoice and quote mail impact only for matching active context, type and channel", () => {
    const access = projectNotificationAccess({ allowed: true, permissions: { manage_global: true } }, "platform", id, null);
    const data = projectSettings({ impact: { active_tenant_count: 17, global_active_tenant_count: 17 }, rules: [
      { code: "quote.available", status: "active", contexts: ["customer"], channels: ["email", "in_app"] },
      { code: "invoice.available", status: "active", contexts: ["customer"], channels: ["email", "in_app"] },
      { code: "invoice.reminder", status: "planned", contexts: ["customer"], channels: ["email"] },
    ] });
    const dimensions = { tenantId: "", context: "", typeCode: "", channel: "" };
    expect(notificationPolicyImpact(access, data, dimensions)).toMatchObject({ quoteMail: true, invoiceMail: true });
    expect(notificationPolicyImpact(access, data, { ...dimensions, channel: "push" })).toMatchObject({ quoteMail: false, invoiceMail: false });
    expect(notificationPolicyImpact(access, data, { ...dimensions, context: "staff" })).toMatchObject({ quoteMail: false, invoiceMail: false });
    expect(notificationPolicyImpact(access, data, { ...dimensions, typeCode: "invoice.available", channel: "email" })).toMatchObject({ quoteMail: false, invoiceMail: true });
    expect(notificationPolicyImpact(access, data, { ...dimensions, typeCode: "invoice.reminder" }).rules).toEqual([]);
  });
  it("renders only known reason labels and limits push previews to generic content", () => {
    expect(notificationReason("allowed")).toBe("De actuele regels staan dit kanaal toe.");
    expect(notificationReason("internal provider secret")).not.toContain("secret");
    const template = projectTemplate({ channel: "push", warning: "unsafe_previous_version", variables: [{ name: "bedrijfsnaam", required: false }] });
    expect(template.warning).toContain("veilige algemene pushtekst");
    expect(templateDraftError({ title: "t".repeat(81), body: "Bericht", ctaLabel: "" }, template)).toContain("80 tekens");
    expect(templateDraftError({ title: "Bericht", body: "b".repeat(161), ctaLabel: "" }, template)).toContain("160");
    expect(templateDraftError({ title: "Bericht", body: "{medewerkernaam}", ctaLabel: "" }, template)).toContain("alleen de variabele");
    expect(templateDraftError({ title: "Bericht", body: "Er staat een bericht klaar bij {bedrijfsnaam}.", ctaLabel: "" }, template)).toBe("");
  });
  it("invalidates late inbox responses on signout, unmount, account switch and newer requests", () => {
    const gate = createNotificationRequestGate(); gate.reset("tenant:alice"); const first = gate.begin("tenant:alice"), second = gate.begin("tenant:alice"); expect(gate.current(first)).toBe(false); expect(gate.current(second)).toBe(true);
    gate.reset(null); expect(gate.current(second)).toBe(false); gate.reset("tenant:bob"); expect(gate.current(second)).toBe(false); const bob = gate.begin("tenant:bob"); expect(gate.current(bob)).toBe(true); gate.reset(null); expect(gate.current(bob)).toBe(false);
  });
  it("does not derive access from a role or expose unrecognized fields", () => {
    const access = projectNotificationAccess({ allowed: true, permissions: { read_own: true, manage_global: false }, provider_secret: "not exposed", roles: ["platform_admin"] }, "staff", id, null);
    expect(access.permissions).toEqual(["read_own"]); expect(access.tabs).toEqual(["inbox"]); expect(access).not.toHaveProperty("provider_secret");
  });
  it("hides revoked-source links and keeps read separate from acknowledgment", () => {
    const item = projectNotification({ id, title: "Redacted by server", source_available: false, target_path: "/app/werkbonnen/anything", read_at: "2026-09-30T10:00:00Z", ack_required: true, acknowledged_at: null, permissions: { unread: true, ack: false } });
    expect(item.targetPath).toBeNull(); expect(item.acknowledgedAt).toBeNull(); expect(item.allowedActions).toEqual(["unread"]);
  });
  it.each(["https://example.invalid/staff", "//example.invalid/staff", "/api/files/private", "/staff\\example", "/staff\n/location", "javascript:alert(1)"])("rejects unsafe target %s", target => { expect(safeNotificationTarget(target)).toBeNull(); });
  it("accepts an authorized relative source target", () => { expect(safeNotificationTarget("/staff?workOrder=" + id)).toBe("/staff?workOrder=" + id); });
  it("normalizes optional blank GET filters, but rejects malformed scope IDs", () => {
    expect(notificationQueryFromSearch({ tab: "delivery", channel: "", context: "", tenantId: "" }).channel).toBeUndefined();
    expect(() => notificationQueryFromSearch({ tenantId: "wrong" })).toThrow();
  });
  it("projects exact recipient counts/options without passing email or device endpoints", () => {
    const result = projectRecipients({ recipients: [{ id, key: "u:" + id, label: "Voorbeeldpersoon", channels: ["in_app", "invalid"], email: "private@example.invalid", endpoint: "secret" }], counts: { total: 1, in_app: 1, email: 0, push: 0 }, selection_token: "stable", options: { personnel: [{ id, label: "Voorbeeldpersoon" }] } });
    expect(result.recipients[0].channels).toEqual(["in_app"]); expect(result.recipients[0]).not.toHaveProperty("email"); expect(result.recipients[0]).not.toHaveProperty("endpoint"); expect(result.selectionToken).toBe("stable"); expect(result.options.personnel[0].label).toBe("Voorbeeldpersoon");
  });
  it("keeps selected-channel reachable and suppressed totals separate from the selected audience", () => {
    const partial = projectRecipients({ recipients: [{ id, channels: [], excluded_reason: "policy_suppressed" }], counts: { total: 2, reachable: 1, email: 1, in_app: 0, push: 0, unreachable: 1, suppressed: 1 } });
    expect(partial.counts).toEqual({ total: 2, reachable: 1, email: 1, inApp: 0, push: 0, unreachable: 1, suppressed: 1 });
    expect(projectRecipients({ counts: { total: 5 } }).counts.reachable).toBe(0);
    expect(partial.recipients[0].excludedReason).toContain("Onderdrukt");
  });
  it("requires reviewed exact-recipient token before publishing", () => {
    expect(() => notificationCommandPayload("campaign_publish", { id, version: 1 })).toThrow();
    expect(notificationCommandPayload("campaign_publish", { id, version: 2, selectionToken: "reviewed" })).toEqual({ id, expected_revision: 2, selection_token: "reviewed", reason: undefined });
  });
  it("preserves source and exact scope when revising a campaign", () => {
    const campaign = projectCampaign({ id, revision: 4, source_kind: "work_order", source_id: id, criteria: { kind: "staff", personnel_ids: [id] } });
    expect(campaign.sourceKind).toBe("work_order"); expect(campaign.sourceId).toBe(id);
    const payload = notificationCommandPayload("campaign_save", { id, version: 4, title: "Testonderwerp", body: "Voorbeeldtekst", priority: "normal", criteria: campaign.criteria, channels: ["in_app"], timezone: "Europe/Amsterdam", ackRequired: false, actionLabel: "Openen", sourceKind: campaign.sourceKind, sourceId: campaign.sourceId });
    expect(payload.expected_revision).toBe(4); expect(payload.source_id).toBe(id); expect(payload.criteria).toMatchObject({ personnel_ids: [id] });
  });
  it("refuses arbitrary recipient emails and incomplete source links", () => {
    expect(() => recipientCriteriaSchema.parse({ kind: "customer", emails: ["external@example.invalid"] })).toThrow();
    expect(() => notificationCommandPayload("campaign_save", { version: 0, title: "Titel", body: "Tekst", priority: "normal", criteria: recipientCriteriaSchema.parse({ kind: "staff" }), channels: ["in_app"], timezone: "Europe/Amsterdam", ackRequired: false, actionLabel: "Openen", sourceKind: "object" })).toThrow();
  });
  it("keeps own policy mode separate from server-effective higher block", () => {
    const policy = projectPolicy({ scope: "tenant", mode: "on", effective: false, reason: "Geblokkeerd door platform", revision: 5 }); expect(policy.mode).toBe("on"); expect(policy.effective).toBe(false);
    expect(notificationCommandPayload("policy_save", { version: 0, scope: "platform", mode: "off", reason: "Gepland onderhoud" })).toMatchObject({ scope: "platform", mode: "off", expected_revision: 0 });
    expect(() => notificationCommandPayload("policy_save", { version: 0, scope: "global", mode: "off", reason: "Gepland onderhoud" })).toThrow();
  });
  it("does not treat unknown template fields as editable and rejects unknown/missing variables", () => {
    const template = projectTemplate({ variables: [{ name: "tenant_name", required: true }], allowed_fields: ["body"] });
    expect(template.allowedFields).toEqual(["body"]);
    expect(templateDraftError({ title: "Titel", body: "{wrong}", ctaLabel: "Openen" }, template)).toContain("Onbekende");
    expect(templateDraftError({ title: "Titel", body: "Ontbreekt", ctaLabel: "Openen" }, template)).toContain("Verplichte");
    expect(templateDraftError({ title: "Titel", body: "{tenant_name} <script>bad</script>", ctaLabel: "Openen" }, template)).toContain("HTML");
    expect(templatePreviewText("Bericht van {tenant_name}", ["tenant_name"])).toBe("Bericht van Voorbeeldorganisatie");
  });
  it("keeps inherited bundling distinct from an explicit zero and restricts its policy dimension", () => {
    const input = { version: 0, scope: "tenant", typeCode: "work_order.rescheduled", channel: null, mode: "inherit", reason: "Wijzigingen kort bundelen" };
    expect(notificationCommandPayload("policy_save", { ...input, bundleSeconds: 0 })).toMatchObject({ bundle_seconds: 0 });
    expect(notificationCommandPayload("policy_save", { ...input, bundleSeconds: null })).toMatchObject({ bundle_seconds: null });
    expect(notificationCommandPayload("policy_save", input)).not.toHaveProperty("bundle_seconds");
    for (const bundleSeconds of [-1, 301, 1.5]) expect(() => notificationCommandPayload("policy_save", { ...input, bundleSeconds })).toThrow();
    expect(() => notificationCommandPayload("policy_save", { ...input, channel: "email", bundleSeconds: 30 })).toThrow();
    expect(() => notificationCommandPayload("policy_save", { ...input, typeCode: "manual.tenant", bundleSeconds: 30 })).toThrow();
    expect(projectRule({ code: "work_order.rescheduled" }).bundleSeconds).toBe(30);
    expect(projectPolicy({ bundle_seconds: null, effective_bundle_seconds: 30 })).toMatchObject({ bundleSeconds: null, effectiveBundleSeconds: 30 });
    expect(projectPolicy({ bundle_seconds: 0, effective_bundle_seconds: 0 })).toMatchObject({ bundleSeconds: 0, effectiveBundleSeconds: 0 });
  });
});
