import { describe, expect, it } from "vitest";
import { authMailDestination, authMailMessages, authMailPayload } from "./auth-message";
const origin = "https://staging.fieldgrid.nl";
const fixture = (type = "recovery") => authMailPayload.parse({ user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "old@example.test", new_email: "new@example.test", user_metadata: { tenant_id: "untrusted" } }, email_data: { email_action_type: type, token_hash: "a".repeat(64), token: "123456" } });
describe("Auth email destination and content", () => {
  it("accepts only the canonical platform and tenant origins", () => {
    expect(authMailDestination("https://test.staging.fieldgrid.nl/auth/confirm?next=https://evil.test", origin, "staging")).toEqual({ origin: "https://test.staging.fieldgrid.nl", slug: "test", staffOtp: false });
    expect(authMailDestination("", origin, "staging").slug).toBeNull();
    for (const target of ["https://www.fieldgrid.nl", "https://evil.test", "http://staging.fieldgrid.nl", "https://staging.fieldgrid.nl:444", "https://user:pass@staging.fieldgrid.nl", "https://a.b.staging.fieldgrid.nl", "https://staging.fieldgrid.nl/api/worker", "https://staging.fieldgrid.nl/#token"]) expect(() => authMailDestination(target, origin, "staging")).toThrow();
  });
  it("drops user metadata and keeps tokens exclusively in fragments", () => {
    const p = fixture("invite"), message = authMailMessages(p, origin, "FICTITIOUS tenant")[0];
    expect(p.user).not.toHaveProperty("user_metadata");
    const url = new URL(message.targetUrl);
    expect(url.pathname).toBe("/auth/verify"); expect(url.search).toBe("");
    expect(new URLSearchParams(url.hash.slice(1)).get("token_hash")).toBe(p.email_data.token_hash);
    expect(message.subject).toContain("FICTITIOUS tenant");
  });
  it("maps secure email change hashes to the correct two recipients", () => {
    const p = fixture("email_change"); p.email_data.token_new = "654321"; p.email_data.token_hash_new = "b".repeat(64);
    const messages = authMailMessages(p, origin, "Fieldgrid");
    expect(messages.map(m => m.recipient)).toEqual(["old@example.test", "new@example.test"]);
    expect(messages[0].targetUrl).toContain("b".repeat(64)); expect(messages[1].targetUrl).toContain("a".repeat(64));
    p.email_data.token_new = ""; expect(() => authMailMessages(p, origin, "Fieldgrid")).toThrow();
  });
  it("supports single-address changes, OTP and security notices without exposing other metadata", () => {
    expect(authMailMessages(fixture("email_change"), origin, "Fieldgrid").map(m => m.recipient)).toEqual(["new@example.test"]);
    expect(authMailMessages(fixture("reauthentication"), origin, "Fieldgrid")[0]).toMatchObject({ otp: true, targetUrl: origin });
    for (const type of ["signup", "invite", "magiclink", "email", "password_changed_notification", "phone_changed_notification", "identity_linked_notification", "identity_unlinked_notification", "mfa_factor_enrolled_notification", "mfa_factor_unenrolled_notification"]) expect(authMailMessages(fixture(type), origin, "Fieldgrid")).toHaveLength(1);
    expect(() => authMailMessages(fixture("unknown"), origin, "Fieldgrid")).toThrow();
    const p = fixture("email_changed_notification"); p.email_data.old_email = "prior@example.test";
    expect(authMailMessages(p, origin, "Fieldgrid").map(m => m.recipient)).toEqual(["old@example.test", "prior@example.test"]);
  });
  it("recovery requests never send a password-reset credential or offer a password login", () => {
    const payload = fixture("recovery");
    const message = authMailMessages(payload, origin, "Fieldgrid")[0];
    expect(message.targetUrl).toBe(`${origin}/login`);
    expect(message.body).toContain("eenmalige e-mailcode");
    expect(JSON.stringify(message)).not.toContain(payload.email_data.token_hash);
    expect(JSON.stringify(message)).not.toContain(payload.email_data.token);
  });
  it.each(["magiclink", "email"])("renders every %s sign-in as a code regardless of workspace", (type) => {
    const payload = fixture(type);
    const message = authMailMessages(payload, origin, "Fieldgrid")[0];
    expect(message).toMatchObject({ recipient: "old@example.test", subject: "Je inlogcode voor Fieldgrid", otp: true, targetUrl: `${origin}/login`, label: "" });
    expect(message.body).toContain(payload.email_data.token);
    expect(message.body).not.toContain("personeelsapp");
    expect(authMailMessages(payload, origin, "Fieldgrid", true)).toEqual([message]);
    expect(message.targetUrl).not.toContain(payload.email_data.token_hash);
    payload.email_data.token = "12345";
    expect(() => authMailMessages(payload, origin, "Fieldgrid")).toThrow("Invalid Auth login code");
  });
});
