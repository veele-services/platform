import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";
import { requireLocalApiUrl } from "./local-target";

// One-use credentials must not enter traces, screenshots, videos or logs.
test.use({ trace: "off", screenshot: "off", video: "off" });
test("signed Auth hook sends once; scanner GET does not consume recovery; explicit confirmation does", async ({ page, request }) => {
  const url = requireLocalApiUrl();
  const admin = createClient(url.href, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `auth-hook-${randomUUID()}@fieldgrid.test`, password = "Fictitious-Recovery-2026";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Local Auth fixture unavailable");
  try {
    const generated = await admin.auth.admin.generateLink({ type: "recovery", email });
    if (generated.error || !generated.data.properties) throw new Error("Local recovery fixture unavailable");
    const token = generated.data.properties.hashed_token;
    const body = JSON.stringify({ user: { id: created.data.user.id, email }, email_data: { email_action_type: "recovery", token_hash: token, redirect_to: "http://127.0.0.1:3000/auth/confirm?next=/auth/reset" } });
    const id = `fixture-${randomUUID()}`, timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", Buffer.from("FICTITIOUS-LOCAL-AUTH-HOOK-KEY-ONLY-2026")).update(`${id}.${timestamp}.${body}`).digest("base64");
    const options = { data: body, headers: { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}`, "content-type": "application/json" } };
    expect((await request.post("/api/email/auth", options)).status()).toBe(200);
    expect((await request.post("/api/email/auth", options)).status()).toBe(200);
    const mails = await (await fetch(`http://127.0.0.1:59329/messages?recipient=${encodeURIComponent(email)}`)).json();
    expect(mails.length).toBe(1);
    expect(mails[0].subject).toBe("Nieuw wachtwoord voor Fieldgrid");
    expect(mails[0].tracking_settings.click_tracking.enable).toBe(false);
    // Inspect only booleans: failed assertions must not serialize an Auth token.
    const html = mails[0].content.find((c: { type: string }) => c.type === "text/html").value as string;
    expect(html.includes("/auth/verify#token_hash=")).toBe(true);
    await page.goto("/auth/verify");
    await expect(page.getByRole("button", { name: "Bevestigen en doorgaan" })).toBeVisible();
    const activation = `http://127.0.0.1:3000/auth/verify#${new URLSearchParams({ token_hash: token, type: "recovery" })}`;
    try { await page.goto(activation); } catch { throw new Error("Local confirmation navigation failed"); }
    await expect.poll(() => page.evaluate(() => location.hash === "")).toBe(true);
    await page.getByRole("button", { name: "Bevestigen en doorgaan" }).click();
    await page.waitForURL("**/auth/reset");
    await page.getByLabel("Nieuw wachtwoord").fill(`${password}-changed`);
    await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();
    await page.waitForURL("**/app");
    await request.post("/auth/signout");
    await page.context().clearCookies();
    try { await page.goto(activation); } catch { throw new Error("Local replay navigation failed"); }
    await page.getByRole("button", { name: "Bevestigen en doorgaan" }).click();
    await expect(page.locator(".auth-message[role='alert']")).toContainText("ongeldig, verlopen of al gebruikt");
  } finally { await admin.auth.admin.deleteUser(created.data.user.id); }
});
