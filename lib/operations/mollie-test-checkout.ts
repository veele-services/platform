import type { Frame, Locator, Page } from "@playwright/test";

type CheckoutAction = "paid_select" | "paid_radio" | "paid_button" | "submit_status" | "pay" | "ideal" | "bank" | "continue" | "return";
type ControlState = { count: number; visible: boolean; enabled: boolean };
export type CheckoutDiagnostic = {
  step: number;
  host: "mollie" | "tenant" | "other";
  frames: number;
  statusSelected: boolean;
  action: CheckoutAction | "wait";
  controls: Partial<Record<CheckoutAction, ControlState>>;
};
export class MollieTestCheckoutError extends Error {
  constructor(readonly kind: "unrecognized_step" | "action_timeout" | "action_failed" | "unexpected_host" | "return_without_status", readonly diagnostic: CheckoutDiagnostic) {
    super(`Mollie test checkout: ${kind}`);
  }
}

function isMollieHost(url: string) {
  try {
    const host = new URL(url).hostname;
    return host === "mollie.com" || host.endsWith(".mollie.com");
  } catch { return false; }
}

async function available(locator: Locator): Promise<Locator | undefined> {
  for (let index = 0; index < Math.min(await locator.count(), 12); index++) {
    const item = locator.nth(index);
    if (await item.isVisible() && await item.isEnabled()) return item;
  }
}

function controls(frame: Frame) {
  const paidName = /^(Paid|Betaald)$/i;
  return {
    paid_select: frame.locator("select").filter({ has: frame.locator('option[value="paid"]').or(frame.getByRole("option", { name: paidName })) }),
    paid_radio: frame.locator('input[type="radio"][value="paid"]').or(frame.getByRole("radio", { name: paidName })),
    paid_button: frame.getByRole("button", { name: paidName }),
    pay: frame.getByRole("button", { name: /^(Pay|Betalen|Pay now)(?:\s+[€\d].*)?$/i }),
    ideal: frame.getByText(/^iDEAL(?:\s*\|\s*Wero)?$/i, { exact: true }),
    bank: frame.getByText(/^(Test bank|Testbank|ING)$/i, { exact: true }).filter({ visible: true }),
    continue: frame.getByRole("button", { name: /^(Continue|Verder|Proceed|Doorgaan|Confirm|Bevestigen)$/i }),
    return: frame.getByRole("button", { name: /^(Return|Back|Go back|Terug)(?:\s+(?:to|naar).*)?$/i }).or(frame.getByRole("link", { name: /^(Return|Back|Go back|Terug)(?:\s+(?:to|naar).*)?$/i })),
  };
}

/** Drive only a genuine hosted Mollie test checkout. Output is a fixed schema
 * of control counts/booleans and action enums, never DOM text or payment URLs.
 * Selecting Paid is not confirmation: continue through the provider redirect;
 * the caller must independently verify provider status and the entire ledger.
 */
export async function confirmMollieTestCheckout(page: Page, tenantOrigin: string, report: (diagnostic: CheckoutDiagnostic) => void = () => undefined, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let statusSelected = false;
  let statusForm: Locator | undefined;
  let statusFrame: Frame | undefined;
  let step = 0;
  const generations = new WeakMap<Frame, number>();
  const performed = new Set<string>();
  const navigated = (frame: Frame) => {
    generations.set(frame, (generations.get(frame) ?? 0) + 1);
    if (frame === statusFrame) { statusForm = undefined; statusFrame = undefined; }
  };
  page.on("framenavigated", navigated);
  let diagnostic: CheckoutDiagnostic = { step, host: "mollie", frames: 0, statusSelected, action: "wait", controls: {} };
  try {
    while (Date.now() < deadline) {
      step++;
      const current = new URL(page.url());
      const host = current.origin === tenantOrigin ? "tenant" : isMollieHost(current.href) ? "mollie" : "other";
      diagnostic = { step, host, frames: page.frames().length, statusSelected, action: "wait", controls: {} };
      if (host === "tenant") {
        if (!statusSelected) throw new MollieTestCheckoutError("return_without_status", diagnostic);
        return;
      }
      if (host !== "mollie") throw new MollieTestCheckoutError("unexpected_host", diagnostic);
      let acted = false;
      for (const frame of page.frames().filter(item => isMollieHost(item.url()))) {
        const candidates: Partial<Record<CheckoutAction, Locator>> = controls(frame);
        if (statusForm && await statusForm.count()) candidates.submit_status = statusForm.locator('button[type="submit"], input[type="submit"]').or(statusForm.getByRole("button", { name: /^(Continue|Verder|Proceed|Doorgaan|Confirm|Bevestigen)$/i }));
        const visible: Partial<Record<CheckoutAction, Locator>> = {};
        for (const [name, locator] of Object.entries(candidates) as Array<[CheckoutAction, Locator]>) {
          visible[name] = await available(locator);
          diagnostic.controls[name] = { count: Math.min(await locator.count(), 12), visible: await locator.filter({ visible: true }).count() > 0, enabled: Boolean(visible[name]) };
        }
        const actions: CheckoutAction[] = statusSelected
          ? ["submit_status", "continue", "pay", "return"]
          : ["paid_select", "paid_radio", "paid_button", "ideal", "bank", "pay", "continue"];
        for (const action of actions) {
          const control = visible[action];
          // A provider page may retain its button while loading. Do not click it
          // repeatedly; a changed document/control state permits the next action.
          const key = JSON.stringify([frame.url(), generations.get(frame) ?? 0, action, ["ideal", "bank"].includes(action) ? null : diagnostic.controls]);
          if (!control || performed.has(key)) continue;
          diagnostic.action = action;
          report(diagnostic);
          try {
            if (action === "paid_select") {
              const valuePaid = control.locator('option[value="paid"]');
              if (await valuePaid.count()) await control.selectOption("paid", { timeout: 5_000 });
              else await control.selectOption({ label: await control.getByRole("option", { name: /^(Paid|Betaald)$/i }).first().textContent() ?? "Paid" }, { timeout: 5_000 });
            } else if (action === "paid_radio" && await control.getAttribute("type") === "radio") {
              await control.check({ timeout: 5_000 });
            } else await control.click({ timeout: 5_000 });
            if (["paid_select", "paid_radio", "paid_button"].includes(action)) {
              statusSelected = true;
              statusForm = control.locator("xpath=ancestor::form[1]");
              statusFrame = frame;
            }
            performed.add(key);
            acted = true;
          } catch (error) {
            throw new MollieTestCheckoutError(error instanceof Error && error.name === "TimeoutError" ? "action_timeout" : "action_failed", diagnostic);
          }
          break;
        }
        if (acted) break;
      }
      await page.waitForTimeout(acted ? 250 : 500);
    }
    report(diagnostic);
    throw new MollieTestCheckoutError("unrecognized_step", diagnostic);
  } finally { page.off("framenavigated", navigated); }
}
