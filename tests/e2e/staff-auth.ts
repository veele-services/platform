import { expect, test, type Page } from "@playwright/test";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../../lib/database.types";
import { requireLocalApiUrl, requireLocalMailpitUrl } from "./local-target";

export const E2E_APP_ORIGIN = "http://127.0.0.1:3000";
export const E2E_STAFF_PASSWORD = "Fieldgrid-E2E-2026";

type MailSummary = { ID: string };
type MailSearch = { messages?: MailSummary[] };
type MailDetail = { Text?: string; HTML?: string };

function staffDestination(target: string) {
  const destination = new URL(target, E2E_APP_ORIGIN);
  if (
    destination.origin !== E2E_APP_ORIGIN ||
    (destination.pathname !== "/staff" && !destination.pathname.startsWith("/staff/"))
  ) {
    throw new Error("Staff E2E authentication requires a local /staff destination");
  }
  return destination;
}

async function mailIds(email: string) {
  const mailbox = requireLocalMailpitUrl();
  const endpoint = new URL("/api/v1/search", mailbox);
  endpoint.searchParams.set("query", `to:${email}`);
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error("Local staff test mailbox is unavailable");
  const result = (await response.json()) as MailSearch;
  return new Set((result.messages ?? []).map((message) => message.ID));
}

async function newMailCode(email: string, previousIds: Set<string>) {
  const mailbox = requireLocalMailpitUrl();
  const endpoint = new URL("/api/v1/search", mailbox);
  endpoint.searchParams.set("query", `to:${email}`);
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) return "";
  const result = (await response.json()) as MailSearch;
  const latest = (result.messages ?? []).find((message) => !previousIds.has(message.ID));
  if (!latest) return "";
  const detailResponse = await fetch(new URL(`/api/v1/message/${encodeURIComponent(latest.ID)}`, mailbox), { cache: "no-store" });
  if (!detailResponse.ok) return "";
  const detail = (await detailResponse.json()) as MailDetail;
  return `${detail.Text ?? ""}\n${detail.HTML ?? ""}`.match(/\b\d{6}\b/)?.[0] ?? "";
}

/**
 * The one spec that proves the actual product login uses this helper. Its
 * caller must disable trace, screenshots and video: the code is one-use auth
 * material and must not be retained in a Playwright artifact.
 */
export async function signInStaffWithEmailOtp(page: Page, email: string, target = "/staff") {
  const destination = staffDestination(target);
  const previousIds = await mailIds(email);

  await page.goto(new URL(`/login?next=${encodeURIComponent(destination.pathname + destination.search)}`, E2E_APP_ORIGIN).href);
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByRole("button", { name: "Inlogcode versturen", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Als dit account toegang heeft");
  await expect(page.getByRole("button", { name: /Nieuwe code aanvragen \(\d+s\)/ })).toBeDisabled();

  let oneTimeCode = "";
  await expect.poll(async () => {
    oneTimeCode = await newMailCode(email, previousIds);
    return oneTimeCode.length;
  }, { message: "A fresh local staff login email should contain a six-digit code" }).toBe(6);

  await page.getByLabel("Inlogcode").fill(oneTimeCode);
  oneTimeCode = "";
  await page.getByRole("button", { name: "Code controleren", exact: true }).click();
  await page.waitForURL((url) => url.pathname === destination.pathname && url.search === destination.search);
}

/**
 * Non-auth specs need an authenticated browser but must not consume the local
 * email rate limit. This creates an ordinary password session against the
 * isolated local Supabase API and installs the exact SSR cookies in the test
 * context. No application endpoint or production-only bypass is involved.
 */
export async function authenticateStaff(
  page: Page,
  email: string,
  target = "/staff",
  password = E2E_STAFF_PASSWORD,
) {
  const destination = staffDestination(target);
  const api = requireLocalApiUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("Local Supabase anonymous key is unavailable for staff E2E authentication");

  await test.step("Authenticate the synthetic staff fixture directly", async () => {
    const jar = new Map<string, string>();
    const client = createBrowserClient<Database>(api.href, anonKey, {
      isSingleton: false,
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: true },
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (items) => {
          for (const { name, value } of items) {
            if (value) jar.set(name, value);
            else jar.delete(name);
          }
        },
      },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session || jar.size === 0) throw new Error("Synthetic staff fixture authentication failed");

    const context = page.context();
    const existing = (await context.cookies()).filter((cookie) => /^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name));
    for (const cookie of existing) {
      await context.clearCookies({ name: cookie.name, domain: cookie.domain, path: cookie.path });
    }
    await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: E2E_APP_ORIGIN })));
    await page.goto(destination.href);
    if (new URL(page.url()).pathname === "/login") throw new Error("Synthetic staff session was not accepted");
  });
}
