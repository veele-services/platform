import { expect, test, type Page } from "@playwright/test";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../../lib/database.types";
import { requireLocalApiUrl, requireLocalMailpitUrl } from "./local-target";

const LOCAL_APP_ORIGIN = "http://127.0.0.1:3000";
const FIXTURE_PASSWORD = "Fieldgrid-E2E-2026";

type MailSearch = { messages?: Array<{ ID: string }> };
type MailDetail = { Text?: string; HTML?: string };

function workspaceDestination(target: string) {
  const destination = new URL(target, LOCAL_APP_ORIGIN);
  if (destination.origin !== LOCAL_APP_ORIGIN || !/^\/(?:app|staff|klant|platform)(?:\/|$)/.test(destination.pathname)) {
    throw new Error("Workspace E2E authentication requires a bounded local destination");
  }
  return destination;
}

async function mailIds(email: string) {
  const endpoint = new URL("/api/v1/search", requireLocalMailpitUrl());
  endpoint.searchParams.set("query", `to:${email}`);
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error("The isolated local login mailbox is unavailable");
  const result = (await response.json()) as MailSearch;
  return new Set((result.messages ?? []).map(message => message.ID));
}

async function newMailCode(email: string, previousIds: Set<string>) {
  const mailbox = requireLocalMailpitUrl();
  const endpoint = new URL("/api/v1/search", mailbox);
  endpoint.searchParams.set("query", `to:${email}`);
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) return "";
  const result = (await response.json()) as MailSearch;
  const latest = (result.messages ?? []).find(message => !previousIds.has(message.ID));
  if (!latest) return "";
  const detailResponse = await fetch(new URL(`/api/v1/message/${encodeURIComponent(latest.ID)}`, mailbox), { cache: "no-store" });
  if (!detailResponse.ok) return "";
  const detail = (await detailResponse.json()) as MailDetail;
  return `${detail.Text ?? ""}\n${detail.HTML ?? ""}`.match(/\b\d{6,10}\b/)?.[0] ?? "";
}

/** Real product authentication. Callers must disable trace, screenshot and video. */
export async function signInWithEmailOtp(page: Page, email: string, target = "/app") {
  requireLocalApiUrl();
  const destination = workspaceDestination(target);
  const previousIds = await mailIds(email);
  await page.goto(new URL(`/login?next=${encodeURIComponent(destination.pathname + destination.search)}`, LOCAL_APP_ORIGIN).href);
  await expect(page.getByLabel("Wachtwoord", { exact: true })).toHaveCount(0);
  await page.getByLabel("E-mailadres", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Inlogcode versturen", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Als dit account toegang heeft");
  await expect(page.getByRole("button", { name: /Nieuwe code aanvragen \(\d+s\)/ })).toBeDisabled();

  let oneTimeCode = "";
  await expect.poll(async () => {
    oneTimeCode = await newMailCode(email, previousIds);
    return oneTimeCode.length;
  }, { message: "A fresh local login email must contain the full eight-digit Auth code" }).toBe(8);
  const input = page.getByLabel("Inlogcode", { exact: true });
  await input.fill(oneTimeCode);
  expect((await input.inputValue()).length, "The login form must retain the full eight-digit Auth code").toBe(8);
  oneTimeCode = "";
  await page.getByRole("button", { name: "Code controleren", exact: true }).click();
  await page.waitForURL(url => url.pathname === destination.pathname && url.search === destination.search);
}

/**
 * Non-auth product tests install a real isolated Supabase fixture session
 * directly, so they cannot consume OTP emails or rely on a password form.
 * This is not an application bypass: ordinary SSR cookies and every product
 * authorization check remain in force. Direct password API use is test-only.
 */
export async function authenticateWorkspace(page: Page, email: string, target = "/app", password = FIXTURE_PASSWORD) {
  const destination = workspaceDestination(target);
  const api = requireLocalApiUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("The isolated local anonymous fixture key is unavailable");

  await test.step("Authenticate the synthetic workspace fixture directly", async () => {
    const jar = new Map<string, string>();
    const client = createBrowserClient<Database>(api.href, anonKey, {
      isSingleton: false,
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: true },
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: items => {
          for (const { name, value } of items) {
            if (value) jar.set(name, value);
            else jar.delete(name);
          }
        },
      },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session || jar.size === 0) throw new Error("Synthetic workspace fixture authentication failed");
    const context = page.context();
    const existing = (await context.cookies()).filter(cookie => /^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name));
    for (const cookie of existing) await context.clearCookies({ name: cookie.name, domain: cookie.domain, path: cookie.path });
    await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: LOCAL_APP_ORIGIN })));
    await page.goto(destination.href);
    if (new URL(page.url()).pathname === "/login") throw new Error("Synthetic workspace fixture session was not accepted");
  });
}
