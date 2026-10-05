import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";
import { requireLocalApiUrl } from "./local-target";

// One-use credentials must not enter traces, screenshots, videos or logs.
test.use({ trace: "off", screenshot: "off", video: "off" });
test("signed Auth hook sends one branded eight-digit OTP without a login link; only the full code logs in and replay is denied", async ({ page, request }) => {
  const url = requireLocalApiUrl();
  const admin = createClient(url.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `auth-hook-${randomUUID()}@fieldgrid.test`;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Local Auth fixture unavailable");
  try {
    const elevated = await admin.from("platform_admins").insert({ user_id: created.data.user.id });
    if (elevated.error) throw new Error("Local platform OTP fixture unavailable");
    await page.goto("/login?next=%2Fplatform");
    await expect(page.getByLabel("Wachtwoord", { exact: true })).toHaveCount(0);
    await page.getByLabel("E-mailadres", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Inlogcode versturen", exact: true }).click();
    await expect(page.getByLabel("Inlogcode", { exact: true })).toBeVisible();
    // The local Auth hook is exercised explicitly against the test-only
    // SendGrid sink. Generate its authentic one-use OTP after the product
    // request, replacing that fixture's earlier SMTP code without sending it.
    const generated = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: "http://127.0.0.1:3000/login" } });
    if (generated.error || !generated.data.properties) throw new Error("Local OTP fixture unavailable");
    let oneTimeCode = generated.data.properties.email_otp;
    const tokenHash = generated.data.properties.hashed_token;
    if (!/^\d{8}$/.test(oneTimeCode)) throw new Error("Local Auth OTP fixture must contain eight digits");
    const body = JSON.stringify({ user: { id: created.data.user.id, email }, email_data: { email_action_type: "magiclink", token: oneTimeCode, token_hash: tokenHash, redirect_to: "http://127.0.0.1:3000/login" } });
    const id = `fixture-${randomUUID()}`, timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", Buffer.from("FICTITIOUS-LOCAL-AUTH-HOOK-KEY-ONLY-2026")).update(`${id}.${timestamp}.${body}`).digest("base64");
    const options = { data: body, headers: { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}`, "content-type": "application/json" } };
    expect((await request.post("/api/email/auth", options)).status()).toBe(200);
    expect((await request.post("/api/email/auth", options)).status()).toBe(200);
    const mails = await (await fetch(`http://127.0.0.1:59329/messages?recipient=${encodeURIComponent(email)}`)).json();
    expect(mails.length).toBe(1);
    expect(mails[0].subject).toBe("Je inlogcode voor Fieldgrid");
    expect(mails[0].from).toMatchObject({ email: "noreply@fieldgrid.test", name: "Fieldgrid" });
    expect(mails[0].tracking_settings.click_tracking.enable).toBe(false);
    // Inspect only booleans: failed assertions must not serialize an Auth token.
    const html = mails[0].content.find((c: { type: string }) => c.type === "text/html").value as string;
    expect(html.includes(oneTimeCode)).toBe(true);
    expect(html.includes(tokenHash)).toBe(false);
    expect(html.includes("/auth/verify")).toBe(false);
    expect(html.includes("/auth/v1/verify")).toBe(false);
    expect(mails[0].content.some((c: { type: string; value: string }) => c.type === "text/plain" && c.value.includes(oneTimeCode))).toBe(true);
    const input = page.getByLabel("Inlogcode", { exact: true });
    await input.fill(oneTimeCode);
    expect((await input.inputValue()).length, "The login form must retain the full provider-issued Auth code").toBe(8);
    await page.getByRole("button", { name: "Code controleren", exact: true }).click();
    await page.waitForURL("**/platform");
    await expect(page.getByRole("heading", { name: "Grip op iedere tenant.", exact: true })).toBeVisible();
    await request.post("/auth/signout");
    await page.context().clearCookies();
    const anonymous = createClient(url.href, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const replay = await anonymous.auth.verifyOtp({ email, token: oneTimeCode, type: "email" });
    oneTimeCode = "";
    expect(Boolean(replay.error)).toBe(true);
    expect(Boolean(replay.data.session)).toBe(false);
    await page.goto("/auth/confirm?code=fictitious-legacy-code&next=%2Fplatform");
    await expect(page).toHaveURL(url => url.pathname === "/login" && url.searchParams.get("error") === "otp_required" && url.searchParams.get("next") === "/platform");
    await expect(page.getByLabel("E-mailadres", { exact: true })).toBeVisible();
  } finally {
    await admin.from("platform_admins").delete().eq("user_id", created.data.user.id);
    await admin.auth.admin.deleteUser(created.data.user.id);
  }
});
