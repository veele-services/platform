import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../scripts/fieldgrid-dashboard-ui-audit.mjs", import.meta.url),
  "utf8",
);

test("dashboard audit covers the complete responsive and zoom matrix", () => {
  for (const contract of [
    /mobile-320[\s\S]*width:\s*320/u,
    /mobile-390[\s\S]*width:\s*390/u,
    /mobile-430[\s\S]*width:\s*430/u,
    /tablet-768[\s\S]*width:\s*768/u,
    /tablet-landscape-1024[\s\S]*width:\s*1024/u,
    /desktop-1280[\s\S]*width:\s*1280/u,
    /desktop-1440[\s\S]*width:\s*1440/u,
    /desktop-1920[\s\S]*width:\s*1920/u,
    /zoom-200-1024[\s\S]*cssZoom:\s*2/u,
  ]) {
    assert.match(source, contract);
  }
});

test("dashboard audit fails broken authenticated and accessible runtime states", () => {
  for (const contract of [
    /responseStatus === null \|\| responseStatus >= 400/u,
    /isAuthenticationRedirect\(responseUrl\)/u,
    /samePathname\(responseUrl, url\)/u,
    /undersizedTouchTargetCount/u,
    /rect\.width < 44 \|\| rect\.height < 44/u,
    /page\.keyboard\.press\("Tab"\)/u,
    /focused-control-has-no-visible-indicator/u,
    /AxeBuilder/u,
    /seriousOrCriticalViolations/u,
    /results\.length > 0[\s\S]*"passed"[\s\S]*"manual"/u,
  ]) {
    assert.match(source, contract);
  }
});
