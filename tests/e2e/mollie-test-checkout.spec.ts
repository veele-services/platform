import { test, expect, type Page } from "@playwright/test";
import { checkoutActionFailureReason, confirmMollieTestCheckout, MollieTestCheckoutError, type CheckoutDiagnostic } from "../../lib/operations/mollie-test-checkout";

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

test("Paid radio submits its native default button without relying on its label", async ({ page }) => {
  await fixture(page, `<form onsubmit="event.preventDefault();document.body.dataset.wrong='true'"><button>Unrelated submit</button></form>
    <form onsubmit="event.preventDefault();if(this.elements.status.value==='paid'&&event.submitter.id==='confirm'&&!document.body.dataset.wrong)location.href='${tenant}/klant'">
      <label><input type="radio" name="status" value="paid">Paid</label>
      <button type="button" onclick="document.body.dataset.wrong='true'">Continue</button>
      <button commandfor="absent" onclick="document.body.dataset.wrong='true'">Unknown command</button>
      <button hidden>Hidden default submit</button><button id="confirm">Complete test payment</button>
    </form>`);
  const actions: string[] = [];
  await confirmMollieTestCheckout(page, tenant, diagnostic => actions.push(diagnostic.action), 8_000);
  expect(actions).toEqual(["paid_radio", "submit_status"]);
  await expect(page).toHaveURL(`${tenant}/klant`);
});

test("native POST waits for a slow provider redirect without submitting twice", async ({ page }) => {
  test.setTimeout(25_000);
  await fixture(page, `<form method="POST" action="/complete"><label><input type="radio" name="status" value="paid">Paid</label><button>Complete test payment</button></form>`);
  let submissions = 0;
  let selectedStatus: string | null = null;
  await page.route("https://checkout.mollie.com/complete", async route => {
    submissions++;
    expect(route.request().method()).toBe("POST");
    selectedStatus = new URLSearchParams(route.request().postData() ?? "").get("status");
    await new Promise(resolve => setTimeout(resolve, 8_000));
    // Playwright routes only the first request in an HTTP redirect chain. Use
    // a fresh navigation after the delayed native POST response so the entire
    // fictional checkout remains intercepted instead of attempting real DNS.
    await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: `<script>location.href='${tenant}/klant'</script>` });
  });
  const actions: string[] = [];
  await confirmMollieTestCheckout(page, tenant, diagnostic => actions.push(diagnostic.action), 15_000);
  expect(actions).toEqual(["paid_radio", "submit_status"]);
  expect(submissions).toBe(1);
  expect(selectedStatus).toBe("paid");
  await expect(page).toHaveURL(`${tenant}/klant`);
});

test("an intercepted submit stays blocked and emits only a fixed reason", async ({ page }) => {
  await fixture(page, `<form><label><input type="radio" name="status" value="paid" onchange="document.querySelector('#cover').hidden=false">Paid</label>
    <button style="position:absolute;top:80px;left:10px">Complete test payment</button>
    <div id="cover" hidden style="position:absolute;top:60px;left:0;width:100%;height:100px;z-index:10">PRIVATE_PROVIDER_REFERENCE</div></form>`);
  let captured: unknown;
  try { await confirmMollieTestCheckout(page, tenant, undefined, 10_000); } catch (error) { captured = error; }
  expect(captured).toBeInstanceOf(MollieTestCheckoutError);
  expect(captured).toMatchObject({ kind: "action_timeout", reason: "pointer_intercepted", diagnostic: { action: "submit_status" } });
  expect(JSON.stringify(captured)).not.toMatch(/PRIVATE_PROVIDER_REFERENCE|https:|fictional-local-test/);
});

test("failure reasons follow completed action markers without exposing call logs", () => {
  const reason = (log: string) => checkoutActionFailureReason(new Error(`Timeout with PRIVATE_PROVIDER_REFERENCE at ${checkout}\nCall log:\n${log}`));
  expect(reason("  - <div>PRIVATE_PROVIDER_REFERENCE</div> intercepts pointer events\n  - click action done\n  - waiting for scheduled navigations to finish")).toBe("navigation_pending");
  expect(reason("  - waiting for scheduled navigations to finish")).toBe("other");
  expect(reason("  - click action done\n  - waiting for scheduled navigations to finish\n  - navigations have finished")).toBe("other");
  expect(reason("  - click action done\n  - waiting for scheduled navigations to finish\n  - element is not stable")).toBe("element_unstable");
  expect(reason("\u001b[2m  - <div>PRIVATE_PROVIDER_REFERENCE</div> intercepts pointer events\u001b[22m")).toBe("pointer_intercepted");
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
