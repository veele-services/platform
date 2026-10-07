import { expect, type Locator } from "@playwright/test";

/** Keep fragment crops stable when preceding guides/tabs end on a fraction of a pixel. */
export async function expectPixelAlignedScreenshot(
  locator: Locator,
  name: string,
  options?: { stylePath?: string; mask?: Locator[] },
) {
  await locator.page().evaluate(() => document.fonts.ready.then(() => undefined));
  await locator.scrollIntoViewIfNeeded();
  const original = await locator.evaluate((element: HTMLElement) => {
    const previous = { value: element.style.getPropertyValue("translate"), priority: element.style.getPropertyPriority("translate") };
    const bounds = element.getBoundingClientRect();
    const x = bounds.left + window.scrollX, y = bounds.top + window.scrollY;
    element.style.setProperty("translate", `${Math.round(x) - x}px ${Math.round(y) - y}px`, "important");
    return previous;
  });
  try {
    await expect(locator).toHaveScreenshot(name, options);
  } finally {
    await locator.evaluate((element: HTMLElement, previous) => {
      if (previous.value) element.style.setProperty("translate", previous.value, previous.priority);
      else element.style.removeProperty("translate");
    }, original);
  }
}
