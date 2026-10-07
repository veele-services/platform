import { test, expect, type Page } from "@playwright/test";
import { confirmMollieTestCheckout, MollieTestCheckoutError, type CheckoutDiagnostic } from "../../lib/operations/mollie-test-checkout";

test.use({ trace: "off", screenshot: "off", video: "off" });
const tenant = "https://fictional-staging-tenant.example.invalid";
const checkout = "https://checkout.mollie.com/checkout/fictional-local-test";
async function fixture(page: Page, body: string, nested?: string) {
  await page.route("https://**/*", route => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: route.request().url().startsWith(tenant) ? "<h1>Fictieve klantfacturen</h1>" : nested && route.request().url().endsWith("/nested") ? nested : body,
  }));
  await page.goto(checkout);
}

test("paid option submits its own form and skips a hidden duplicate", async ({ page }) => {
  await fixture(page, `<form onsubmit="event.preventDefault();document.body.dataset.wrong='true'"><button>Wrong submit</button></form>
    <form hidden><select><option value="paid">Paid</option></select><button>Continue</button></form>
    <form onsubmit="event.preventDefault();if(this.elements.status.value==='success')location.href='${tenant}/klant'">
      <select name="status"><option value="open">Open</option><option value="success">Paid</option></select><button>Continue</button>
    </form>`);
  await confirmMollieTestCheckout(page, tenant, undefined, 8_000);
  await expect(page).toHaveURL(`${tenant}/klant`);
});

test("Paid choice still requires Continue after delayed simulator loading", async ({ page }) => {
  await fixture(page, `<button onclick="this.disabled=true;setTimeout(()=>{document.querySelector('#next').hidden=false},1500)">Paid</button>
    <button id="next" hidden onclick="location.href='${tenant}/klant'">Continue</button>`);
  const actions: string[] = [];
  await confirmMollieTestCheckout(page, tenant, diagnostic => actions.push(diagnostic.action), 8_000);
  expect(actions).toEqual(["paid_button", "continue"]);
  await expect(page).toHaveURL(`${tenant}/klant`);
});

test("current iDEAL Wero name opens a labelled radio simulator", async ({ page }) => {
  await fixture(page, `<button onclick="document.querySelector('#pay').disabled=false">iDEAL | Wero</button>
    <button id="pay" disabled onclick="document.body.innerHTML=document.querySelector('template').innerHTML">Pay €1.00</button>
    <template><label><input type="radio" name="status" value="success">Betaald</label>
      <button type="button" onclick="if(document.querySelector('input').checked)location.href='${tenant}/klant'">Continue</button></template>`);
  const actions: string[] = [];
  await confirmMollieTestCheckout(page, tenant, diagnostic => actions.push(diagnostic.action), 8_000);
  expect(actions).toEqual(["ideal", "pay", "paid_radio", "continue"]);
  await expect(page).toHaveURL(`${tenant}/klant`);
});

test("Mollie frame status is followed through provider return", async ({ page }) => {
  await fixture(page, '<iframe src="/nested"></iframe>', `<form onsubmit="event.preventDefault();if(this.elements.status.value==='paid')top.location.href='${tenant}/klant'">
    <select name="status"><option>Open</option><option value="paid">Paid</option></select><button type="submit">Continue</button></form>`);
  const reports: CheckoutDiagnostic[] = [];
  await confirmMollieTestCheckout(page, tenant, diagnostic => reports.push(diagnostic), 8_000);
  expect(reports.some(item => item.frames === 2 && item.action === "paid_select")).toBe(true);
  await expect(page).toHaveURL(`${tenant}/klant`);
});

test("an unchanged loading button is clicked once and diagnosis contains no page data", async ({ page }) => {
  await fixture(page, '<p>PRIVATE_PROVIDER_REFERENCE</p><button onclick="window.clicks=(window.clicks||0)+1">Pay</button>');
  const reports: CheckoutDiagnostic[] = [];
  await expect(confirmMollieTestCheckout(page, tenant, diagnostic => reports.push(diagnostic), 1_500)).rejects.toMatchObject({ kind: "unrecognized_step" });
  expect(await page.evaluate(() => (window as Window & { clicks?: number }).clicks)).toBe(1);
  expect(JSON.stringify(reports)).not.toMatch(/PRIVATE_PROVIDER_REFERENCE|https:|fictional-local-test/);
});

test("a new provider document at the same URL can use Continue again", async ({ page }) => {
  let documents = 0;
  await page.route("https://**/*", route => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: route.request().url().startsWith(tenant) ? "<h1>Fictieve klantfacturen</h1>" : documents++ === 0
      ? '<button onclick="this.disabled=true">Paid</button><button onclick="location.reload()">Continue</button>'
      : `<button disabled>Paid</button><button onclick="location.href='${tenant}/klant'">Continue</button>`,
  }));
  await page.goto(checkout);
  const actions: string[] = [];
  await confirmMollieTestCheckout(page, tenant, diagnostic => actions.push(diagnostic.action), 8_000);
  expect(actions).toEqual(["paid_button", "continue", "continue"]);
  await expect(page).toHaveURL(`${tenant}/klant`);
});

test("a merchant return without explicitly selecting Paid never passes", async ({ page }) => {
  await fixture(page, `<button onclick="location.href='${tenant}/klant'">Continue</button>`);
  await expect(confirmMollieTestCheckout(page, tenant, undefined, 3_000)).rejects.toMatchObject({ kind: "return_without_status" });
});

test("a lookalike provider hostname is rejected before any interaction", async ({ page }) => {
  await fixture(page, '<button>Paid</button>');
  await page.goto("https://notmollie.com/checkout");
  try {
    await confirmMollieTestCheckout(page, tenant);
    throw new Error("Unexpected successful checkout");
  } catch (error) {
    expect(error).toBeInstanceOf(MollieTestCheckoutError);
    expect(error).toMatchObject({ kind: "unexpected_host", diagnostic: { host: "other" } });
  }
});
