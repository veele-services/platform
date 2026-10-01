import { describe, expect, it } from "vitest";
import { ticketCommandPayload } from "./commands";
import { ticketQueryFromSearch, ticketQuerySchema, ticketQueryString } from "./model";
import { projectAccess, projectCategory, projectContexts, projectDetail, projectFile, projectList, projectScope, projectSettings, scopePayload } from "./projection";

const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const create = { subject: "Testmelding", categoryId: id, body: "Synthetische vraag" };
const hours = { version: 1, openingHours: { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }, timezone: "Europe/Amsterdam" };
describe("ticket command contracts", () => {
  it("accepts an ordinary report without elevating priority or selecting a route", () => {
    expect(ticketCommandPayload("create", create)).toEqual({ command: "create", payload: { title: "Testmelding", body: "Synthetische vraag", category_id: id, urgency: "normal", needed_before: undefined, work_order_id: undefined, object_id: undefined, module: undefined, attachment_ids: [] } });
  });
  it.each([{ route: "platform_support" }, { tenant_id: other }, { reporter_id: other }, { priority: "critical" }, { technical_context: { secret: "synthetic" } }, { urgency: "critical" }, { subject: "  " }, { categoryId: "wrong" }, { body: "x" }])("rejects unknown or invalid report values %o", patch => expect(() => ticketCommandPayload("create", { ...create, ...patch })).toThrow());
  it("limits attachment counts", () => expect(() => ticketCommandPayload("create", { ...create, uploadIds: Array(6).fill(id) })).toThrow());
  it("does not turn a category change into a platform share", () => {
    expect(ticketCommandPayload("transfer", { id, version: 4, categoryId: other, reason: "Andere afdeling" })).toEqual({ command: "category", payload: { ticket_id: id, expected_revision: 4, category_id: other, reason: "Andere afdeling" } });
  });
  it("shares only an explicit summary and selected files", () => {
    const command = ticketCommandPayload("share", { id, version: 2, subject: "Technische vraag", body: "Geselecteerde toelichting", categoryId: other, module: "planning", attachmentIds: [] });
    expect(command.command).toBe("transfer"); expect(command.payload).not.toHaveProperty("messages");
    expect(command.payload.attachment_ids).toEqual([]);
  });
  it("requires a reason for changing urgency", () => expect(() => ticketCommandPayload("priority", { id, version: 1, priority: "critical" })).toThrow());
  it("requires a solution for resolved and a reason for cancelled", () => {
    expect(() => ticketCommandPayload("status", { id, version: 1, status: "resolved" })).toThrow();
    expect(() => ticketCommandPayload("status", { id, version: 1, status: "cancelled" })).toThrow();
  });
  it("retains revision and audience in replies", () => expect(ticketCommandPayload("reply", { id, version: 3, body: "Antwoord", audience: "reporter" }).payload).toEqual({ ticket_id: id, expected_revision: 3, body: "Antwoord", audience: "reporter", attachment_ids: [] }));
  it.each([{ version: 0 }, { version: 1.5 }, { audience: "everyone" }, { source_message: other }])("rejects invalid reply values %o", patch => expect(() => ticketCommandPayload("reply", { id, version: 1, body: "Antwoord", audience: "reporter", ...patch })).toThrow());
  it("binds settings to the expected version", () => expect(ticketCommandPayload("save_settings", hours).payload.expected_revision).toBe(1));
  it.each([{ start: "99:00" }, { end: "17:60" }, { start: "17:00" }, { start: "18:00" }, { days: [1, 1] }, { days: [] }, { days: [7] }])("rejects invalid business hours %o", patch => expect(() => ticketCommandPayload("save_settings", { ...hours, openingHours: { ...hours.openingHours, ...patch } })).toThrow());
  it("rejects an unknown timezone", () => expect(() => ticketCommandPayload("save_settings", { ...hours, timezone: "Planet/Unknown" })).toThrow());
  it("uses the same allowlisted scope in verification and the final grant", () => {
    const scope = { all: false, categories: [id], personnelIds: [other], objectIds: [], customerIds: [], tenantIds: [], assignedOnly: false };
    const grant = { userId: other, permission: "tickets.internal.hr", version: 0, scope, reason: "Bevestigde HR-opdracht" };
    const request = ticketCommandPayload("save_grant", grant).payload;
    const commit = ticketCommandPayload("save_grant", { ...grant, verificationId: id }).payload;
    expect(commit).toEqual({ ...request, verification_id: id });
    expect(projectScope(request.scope)).toEqual(scope); expect(scopePayload(scope)).toEqual(request.scope);
    expect(request.expected_revision).toBe(0);
  });
  it("requires the current revision when revoking a permission", () => {
    expect(() => ticketCommandPayload("revoke_grant", { id, reason: "Opdracht vervallen" })).toThrow();
    expect(ticketCommandPayload("revoke_grant", { id, version: 2, reason: "Opdracht vervallen" }).payload.expected_revision).toBe(2);
  });
});

describe("ticket list state and safe projections", () => {
  it("preserves effective support timezone and the actual assigned group in list and detail", () => {
    const raw = { id, title: "Technische vraag", route: "platform_support", status: "new", priority: "normal", assigned_group_id: other, assigned_group_name: "Technische support", group_members: ["NEVER_SEND"], timezone: "America/New_York", permissions: { manage: true, cancel: false } };
    const row = projectList({ items: [raw] }).items[0];
    const detail = projectDetail(raw, "platform")!;
    for (const projected of [row, detail]) {
      expect(projected.assignee).toBeNull();
      expect(projected.assignedGroupName).toBe("Technische support");
      expect(projected.timezone).toBe("America/New_York");
      expect(projected.allowedActions).toContain("manage");
      expect(projected.allowedActions).not.toContain("cancel");
      expect(JSON.stringify(projected)).not.toContain("NEVER_SEND");
    }
    expect(projectDetail({ ...raw, permissions: { cancel: true } }, "staff")!.allowedActions).toContain("cancel");
  });
  it("projects only the authorized category group label, not its membership", () => {
    const category = projectCategory({ id, name: "Techniek", group_name: "Technische intake", group_members: ["NEVER_SEND"], confidential: true });
    expect(category.groupLabel).toBe("Technische intake");
    expect(category.confidential).toBe(true);
    expect(JSON.stringify(category)).not.toContain("NEVER_SEND");
  });
  it("projects only configuration audit metadata, never the private audit payload", () => {
    const settings = projectSettings({ audit: [{ id, action: "grant_save", label: "Ticketrecht aangepast", actor_name: "Beheerder", created_at: "2026-09-30T12:00:00Z", target_id: other, detail: { body: "NEVER_SEND", code: "NEVER_SEND" }, actor_email: "NEVER_SEND" }] });
    expect(settings.audit).toEqual([{ id, action: "grant_save", label: "Ticketrecht aangepast", actorName: "Beheerder", createdAt: "2026-09-30T12:00:00Z", targetId: other }]);
    expect(JSON.stringify(settings)).not.toContain("NEVER_SEND");
    expect(projectSettings({}).audit).toEqual([]);
  });
  it("round trips filters, stable sorting and page position", () => {
    const q = ticketQueryFromSearch({ search: ["vraag & antwoord"], page: "3", sort: "created", direction: "asc", categoryId: id });
    expect(ticketQueryFromSearch(Object.fromEntries(new URLSearchParams(ticketQueryString(q))))).toEqual(q);
  });
  it.each([{ sort: "tenant.secret" }, { page: 0 }, { pageSize: 100000 }, { from: "2026-02-30" }, { from: "2026-09-30", to: "2026-09-01" }, { contextId: id }, { contextKind: "object" }])("rejects unbounded or unrecognized list controls %o", query => expect(ticketQuerySchema.safeParse(query).success).toBe(false));
  it("accepts only local dossier navigation", () => {
    for (const href of ["https://private.invalid/a", "//private.invalid", "/\\private.invalid"]) expect(projectContexts([{ kind: "object", id, label: "Object", href }])[0]).not.toHaveProperty("href");
    expect(projectContexts([{ kind: "object", id, label: "Object", href: `/app/objects?object=${id}` }])[0].href).toBe(`/app/objects?object=${id}`);
  });
  it("never forwards unknown source fields or arbitrary metadata", () => {
    const raw = { id, number: "M-1", title: "Synthetisch", tenant_id: other, status: "new", priority: "normal", revision: 2, private_source: "NEVER_SEND", source_ticket: { id: other, number: "M-2" }, permissions: { reply: true }, messages: [{ id: other, body: "Publiek antwoord", audience: "reporter", secret: "NEVER_SEND" }], events: [{ id: other, audience: "reporter", metadata: { private_note: "NEVER_SEND" } }] };
    const result = projectDetail(raw, "platform")!;
    expect(JSON.stringify(result)).not.toContain("NEVER_SEND"); expect(result).not.toHaveProperty("sourceTicket");
    expect(result.allowedAudiences).toEqual(["reporter"]); expect(result.version).toBe(2);
  });
  it.each(["pending", "processing", "rejected", "error"])("does not expose a URL for %s files", scanState => {
    const result = projectFile({ id, name: "test.png", mime: "image/png", scanState }, "staff");
    expect(result).not.toHaveProperty("downloadHref"); expect(result).not.toHaveProperty("previewHref");
  });
  it("clean does not overrule a withheld release", () => expect(projectFile({ id, scanState: "clean", released: false }, "staff")).not.toHaveProperty("downloadHref"));
  it("preserves the database file DTO timestamp", () => expect(projectFile({ id, scanState: "clean", createdAt: "2026-09-30T12:00:00Z" }, "staff").createdAt).toBe("2026-09-30T12:00:00Z"));
  it("does not grant access or unknown workspaces through projection defaults", () => {
    const projected = projectAccess({ workspaces: ["staff", "evil", "__proto__"] }, "staff", id, null);
    expect(projected.allowed).toBe(false); expect(projected.workspaces).toEqual(["staff"]);
  });
});
