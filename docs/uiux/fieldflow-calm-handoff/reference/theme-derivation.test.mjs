import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CANONICAL_FIXTURE_RAW_SHA256,
  NATIVE_COLD_START_FALLBACK,
  NATIVE_STATUS_BAR_TIE_LUMINANCE,
  SAFE_PLATFORM_FALLBACK_RAW_SHA256,
  SAFE_PLATFORM_FALLBACK_RAW_THEME,
  appearanceAssetModesSha256,
  appearanceContextSha256,
  chooseNativeStatusBarStyleFromLuminance,
  contrastRatio,
  deriveTheme,
  mixHex,
  rawBrandThemeSha256,
  resolveAppearance,
  resolveTheme,
  semanticResolutionSha256,
  sha256,
  stableStringify,
  validateThemeDerivation,
  verifyManifest,
} from "./theme-derivation.mjs";

const manifest = JSON.parse(
  await readFile(
    new URL("../manifests/theme-derivation.json", import.meta.url),
    "utf8",
  ),
);
const tokenManifest = JSON.parse(
  await readFile(
    new URL("../manifests/fieldflow-tokens.json", import.meta.url),
    "utf8",
  ),
);

const minimumContrast = (foreground, backgrounds) =>
  Math.min(
    ...backgrounds.map((background) => contrastRatio(foreground, background)),
  );

test("manifest outputs and hashes match the reference implementation", async () => {
  assert.equal(manifest.fixtures.length, 9);
  assert.deepEqual(await verifyManifest(manifest), []);
});

test("production appearance, explicit asset modes and cold start stay closed contracts", () => {
  assert.equal(
    manifest.appearanceResolutionContract.productionEntryPoint,
    "resolveAppearance",
  );
  assert.deepEqual(
    manifest.appearanceResolutionContract.internalOnlyEntryPoints,
    ["deriveTheme", "resolveTheme"],
  );
  assert.deepEqual(
    manifest.assetSelectionContract.storageMigration.modeColumns,
    ["logo_mode", "favicon_mode", "splash_mode"],
  );
  assert.deepEqual(
    manifest.assetSelectionContract.storageMigration.modeValues,
    ["inherit", "asset", "none"],
  );
  assert.deepEqual(
    manifest.runtimePolicy.nativeColdStartFallback,
    NATIVE_COLD_START_FALLBACK,
  );
  assert.ok(
    manifest.documentAppearanceSnapshotContract.snapshotFields.includes(
      "logoContentSha256",
    ),
  );
  assert.ok(
    manifest.documentAppearanceSnapshotContract.snapshotFields.includes(
      "pdfPalette.primaryColor",
    ),
  );
});

test("canonical raw pixel fixture remains byte-canonical", () => {
  const fixture = manifest.fixtures.find(({ id }) => id === "default");
  assert.equal(fixture.outputMode, "authored-pixel-fixture");
  assert.deepEqual(
    fixture.rawBrandTheme,
    tokenManifest.canonicalVisualFixture.rawBrandTheme,
  );
  assert.equal(
    rawBrandThemeSha256(fixture.rawBrandTheme),
    CANONICAL_FIXTURE_RAW_SHA256,
  );
  assert.equal(
    tokenManifest.canonicalVisualFixture.rawBrandThemeSha256,
    CANONICAL_FIXTURE_RAW_SHA256,
  );
});

test("safe platform fallback is hash-pinned to FIELDGRID_DEFAULT_BRAND_THEME", async () => {
  const source = await readFile(
    new URL("../../../../lib/db/src/tenant-branding.ts", import.meta.url),
    "utf8",
  );
  const body = source.match(
    /export const FIELDGRID_DEFAULT_BRAND_THEME:[^=]+\=\s*\{([\s\S]*?)\n\};/,
  )?.[1];
  assert.ok(body, "FIELDGRID_DEFAULT_BRAND_THEME object was not found");
  const extracted = {};
  for (const field of Object.keys(SAFE_PLATFORM_FALLBACK_RAW_THEME)) {
    const value = body.match(
      new RegExp(`\\b${field}:\\s*(null|"(?:\\\\.|[^"\\\\])*")`),
    )?.[1];
    assert.ok(value, `FIELDGRID_DEFAULT_BRAND_THEME.${field} was not found`);
    extracted[field] = value === "null" ? null : JSON.parse(value);
  }
  assert.deepEqual(extracted, SAFE_PLATFORM_FALLBACK_RAW_THEME);
  assert.equal(
    rawBrandThemeSha256(extracted),
    SAFE_PLATFORM_FALLBACK_RAW_SHA256,
  );
  assert.deepEqual(manifest.safePlatformFallback.rawBrandTheme, extracted);
  assert.equal(
    manifest.safePlatformFallback.rawBrandThemeSha256,
    SAFE_PLATFORM_FALLBACK_RAW_SHA256,
  );
  assert.equal(
    validateThemeDerivation(deriveTheme(extracted)).safe,
    true,
    "pinned platform fallback itself must remain safe",
  );
});

test("sRGB mixing rounds every 8-bit channel half-up", () => {
  assert.equal(mixHex("#000000", "#FFFFFF", 50), "#808080");
  assert.equal(mixHex("#07554E", "#000000", 88), "#064B45");
  assert.equal(mixHex("#07554E", "#FFFFFF", 10), "#E6EEED");
});

test("all nine effective outputs satisfy every declared text, boundary and focus pair", () => {
  for (const fixture of manifest.fixtures) {
    const token = fixture.expectedSemanticOutput;
    const surfaces = [
      token.rootBackground,
      token.canvas,
      token.surface,
      token.surfaceSubtle,
      token.mutedSurface,
    ];
    const primaryStates = [
      token.primary,
      token.primaryHover,
      token.primaryPressed,
    ];
    const accentStates = [
      token.accentStrong,
      token.accentHover,
      token.accentPressed,
    ];
    const sidebarStops = [
      token.sidebarBackgroundStart,
      token.sidebarBackgroundMid,
      token.sidebarBackgroundEnd,
    ];
    const atLeast = (actual, expected, label) =>
      assert.ok(
        actual + Number.EPSILON >= expected,
        `${fixture.id}.${label}: ${actual} < ${expected}`,
      );

    atLeast(minimumContrast(token.text, surfaces), 4.5, "text");
    atLeast(minimumContrast(token.foreground, surfaces), 4.5, "foreground");
    atLeast(minimumContrast(token.textMuted, surfaces), 4.5, "textMuted");
    for (const [index, state] of primaryStates.entries()) {
      atLeast(
        minimumContrast(state, [token.canvas, token.surface]),
        3,
        `primary[${index}]`,
      );
    }
    for (const [index, foreground] of [
      token.textOnPrimary,
      token.textOnPrimaryHover,
      token.textOnPrimaryPressed,
    ].entries()) {
      atLeast(
        contrastRatio(foreground, primaryStates[index]),
        4.5,
        `textOnPrimary[${index}]`,
      );
    }
    for (const [index, state] of accentStates.entries()) {
      atLeast(
        minimumContrast(state, [token.canvas, token.surface]),
        3,
        `accent[${index}]`,
      );
    }
    for (const [index, foreground] of [
      token.textOnAccent,
      token.textOnAccentHover,
      token.textOnAccentPressed,
    ].entries()) {
      atLeast(
        contrastRatio(foreground, accentStates[index]),
        4.5,
        `textOnAccent[${index}]`,
      );
    }
    atLeast(
      minimumContrast(token.selectionBorder, [token.selection, token.surface]),
      3,
      "selectionBorder",
    );
    atLeast(
      minimumContrast(token.selectionHoverBorder, [
        token.selectionHover,
        token.surface,
      ]),
      3,
      "selectionHoverBorder",
    );
    atLeast(
      minimumContrast(token.textOnSelection, [
        token.selection,
        token.selectionHover,
      ]),
      4.5,
      "textOnSelection",
    );
    atLeast(
      minimumContrast(token.borderControl, [token.canvas, token.surface]),
      3,
      "borderControl",
    );
    atLeast(
      minimumContrast(token.focusRing, [token.canvas, token.surface]),
      3,
      "focusRing",
    );
    atLeast(
      minimumContrast(token.focusRingOffset, primaryStates),
      3,
      "focusRingOffset",
    );
    atLeast(
      minimumContrast(token.sidebarText, sidebarStops),
      4.5,
      "sidebarText",
    );
    atLeast(
      minimumContrast(token.sidebarMuted, sidebarStops),
      4.5,
      "sidebarMuted",
    );
    atLeast(
      minimumContrast(token.sidebarActiveBackground, sidebarStops),
      3,
      "sidebarActive",
    );
    atLeast(
      minimumContrast(token.sidebarActiveHover, sidebarStops),
      3,
      "sidebarActiveHover",
    );
    atLeast(
      minimumContrast(token.sidebarActiveIndicator, sidebarStops),
      3,
      "sidebarActiveIndicator",
    );
    atLeast(
      minimumContrast(token.sidebarActiveIndicatorHover, sidebarStops),
      3,
      "sidebarActiveIndicatorHover",
    );
    atLeast(
      contrastRatio(token.sidebarActiveText, token.sidebarActiveBackground),
      4.5,
      "sidebarActiveText",
    );
    atLeast(
      contrastRatio(token.sidebarActiveHoverText, token.sidebarActiveHover),
      4.5,
      "sidebarActiveHoverText",
    );
    assert.equal(
      fixture.expectedResolutionSha256,
      semanticResolutionSha256(
        fixture.expectedSemanticOutput,
        fixture.expectedDiagnostics,
      ),
    );
    assert.equal(
      fixture.expectedSemanticOutputSha256,
      sha256(stableStringify(fixture.expectedSemanticOutput)),
    );
    assert.ok(
      fixture.expectedDiagnostics.every(
        ({ thresholdMet }) => thresholdMet !== false,
      ),
    );
  }
});

test("black/white and inverse valid raw themes fail closed to one complete platform snapshot", () => {
  const safe = resolveTheme(SAFE_PLATFORM_FALLBACK_RAW_THEME);
  assert.equal(safe.status, "resolved");
  for (const id of [
    "black-canvas-white-surface",
    "white-canvas-black-surface",
  ]) {
    const fixture = manifest.fixtures.find((candidate) => candidate.id === id);
    const candidate = deriveTheme(fixture.rawBrandTheme);
    const validation = validateThemeDerivation(candidate);
    assert.equal(
      validation.safe,
      false,
      `${id} must remain an adversarial fixture`,
    );
    assert.equal(validation.reason, "UNRESOLVABLE_CONTRAST");
    assert.ok(validation.contrastErrors.length > 0);

    const first = resolveTheme(fixture.rawBrandTheme, { mode: "runtime" });
    const second = resolveTheme(fixture.rawBrandTheme, { mode: "runtime" });
    assert.equal(first.status, "fallback");
    assert.equal(first.reason, "UNRESOLVABLE_CONTRAST");
    assert.equal(
      first.requestedRawBrandThemeSha256,
      fixture.rawBrandThemeSha256,
    );
    assert.equal(
      first.effectiveRawBrandThemeSha256,
      SAFE_PLATFORM_FALLBACK_RAW_SHA256,
    );
    assert.deepEqual(first.semanticOutput, safe.semanticOutput);
    assert.deepEqual(first.effectiveDiagnostics, safe.effectiveDiagnostics);
    assert.equal(first.resultSha256, second.resultSha256);
    assert.equal(
      first.resultSha256,
      fixture.expectedResolveResult.resultSha256,
    );
    assert.equal(
      first.effectiveSemanticOutputSha256,
      fixture.expectedSemanticOutputSha256,
    );
    assert.equal(
      first.effectiveResolutionSha256,
      fixture.expectedResolutionSha256,
    );
  }
});

test("editor rejection preserves the supplied last-safe tenant snapshot", () => {
  const candidate = manifest.fixtures.find(
    ({ id }) => id === "black-canvas-white-surface",
  ).rawBrandTheme;
  const lastSafeRaw = manifest.fixtures.find(
    ({ id }) => id === "dark",
  ).rawBrandTheme;
  const lastSafe = resolveTheme(lastSafeRaw);
  const rejected = resolveTheme(candidate, {
    mode: "activation",
    safeFallback: {
      rawTheme: lastSafeRaw,
      rawBrandThemeSha256: rawBrandThemeSha256(lastSafeRaw),
      source: "editor-last-safe-effective-theme",
    },
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.reason, "UNRESOLVABLE_CONTRAST");
  assert.equal(rejected.fallbackSource, "editor-last-safe-effective-theme");
  assert.equal(
    rejected.effectiveRawBrandThemeSha256,
    rawBrandThemeSha256(lastSafeRaw),
  );
  assert.deepEqual(rejected.semanticOutput, lastSafe.semanticOutput);
});

test("stale and hash-mismatched runtime snapshots use the same atomic fallback", () => {
  const raw = manifest.fixtures.find(({ id }) => id === "light").rawBrandTheme;
  const safe = resolveTheme(SAFE_PLATFORM_FALLBACK_RAW_THEME);
  for (const [integrity, reason] of [
    ["stale", "STALE_THEME_SNAPSHOT"],
    ["hash-mismatch", "THEME_HASH_MISMATCH"],
  ]) {
    const result = resolveTheme(raw, { mode: "runtime", integrity });
    assert.equal(result.status, "fallback");
    assert.equal(result.reason, reason);
    assert.deepEqual(result.semanticOutput, safe.semanticOutput);
    assert.equal(
      result.effectiveRawBrandThemeSha256,
      SAFE_PLATFORM_FALLBACK_RAW_SHA256,
    );
  }
});

test("an unverified fallback hash never emits fallback tokens", () => {
  const raw = manifest.fixtures.find(
    ({ id }) => id === "black-canvas-white-surface",
  ).rawBrandTheme;
  assert.throws(
    () =>
      resolveTheme(raw, {
        safeFallback: {
          rawTheme: SAFE_PLATFORM_FALLBACK_RAW_THEME,
          rawBrandThemeSha256: "0".repeat(64),
          source: "tampered",
        },
      }),
    /SAFE_FALLBACK_HASH_MISMATCH/,
  );
});

test("FFC-BRAND-019 exposes typed light, dark and adversarial native runtime chrome", () => {
  const expectedStyles = {
    light: "Style.Dark",
    dark: "Style.Light",
    "low-contrast": "Style.Dark",
  };
  for (const [id, expectedStyle] of Object.entries(expectedStyles)) {
    const output = manifest.fixtures.find(
      (fixture) => fixture.id === id,
    ).expectedSemanticOutput;
    assert.equal(output.nativeStatusBarBackground, output.canvas);
    assert.equal(output.nativeSafeAreaBackground, output.canvas);
    assert.equal(output.nativeStatusBarStyle, expectedStyle);
  }
  assert.deepEqual(
    NATIVE_COLD_START_FALLBACK,
    manifest.runtimePolicy.nativeColdStartFallback,
  );
  assert.equal(
    NATIVE_COLD_START_FALLBACK.nativeStatusBarBackground,
    SAFE_PLATFORM_FALLBACK_RAW_THEME.backgroundColor,
  );
  assert.equal(
    chooseNativeStatusBarStyleFromLuminance(NATIVE_STATUS_BAR_TIE_LUMINANCE),
    "Style.Dark",
  );
});

test("complete appearance binds identity, assets, communication and semantics to trusted context", () => {
  const raw = manifest.fixtures.find(({ id }) => id === "light").rawBrandTheme;
  const context = {
    host: "northlight.example.test",
    tenantId: "11111111-1111-4111-8111-111111111111",
    themeRevision: 7,
    entitlement: "enterprise",
    canUseCustomBranding: true,
    tenantThemeOverrideEnabled: true,
    whiteLabelPresentationEnabled: true,
  };
  const result = resolveAppearance(raw, {
    trustedContext: context,
    expectedContextSha256: appearanceContextSha256(context),
    expectedRawBrandThemeSha256: rawBrandThemeSha256(raw),
    assetModes: { logo: "inherit", favicon: "inherit", splash: "inherit" },
    expectedAssetModesSha256: appearanceAssetModesSha256({
      logo: "inherit",
      favicon: "inherit",
      splash: "inherit",
    }),
  });
  assert.equal(result.status, "resolved");
  assert.deepEqual(result.appearance.context, context);
  assert.equal(
    result.appearance.contextSha256,
    appearanceContextSha256(context),
  );
  assert.equal(result.appearance.identity.brandName, raw.brandName);
  assert.equal(result.appearance.identity.platformAttributionName, null);
  assert.deepEqual(result.appearance.identity.logo, {
    mode: "inherit",
    url: raw.logoUrl,
    storagePath: raw.logoStoragePath,
  });
  assert.deepEqual(result.appearance.communication, {
    emailFooterText: raw.emailFooterText,
    emailSignature: raw.emailSignature,
  });
  assert.deepEqual(result.appearance.semanticOutput, result.semanticOutput);
  assert.match(result.appearanceSha256, /^[0-9a-f]{64}$/u);
  assert.match(result.resultSha256, /^[0-9a-f]{64}$/u);
});

test("context or raw-hash drift falls back as one complete appearance", () => {
  const raw = manifest.fixtures.find(({ id }) => id === "dark").rawBrandTheme;
  const trustedContext = {
    host: "tenant-b.example.test",
    tenantId: "22222222-2222-4222-8222-222222222222",
    themeRevision: 12,
    entitlement: "enterprise",
    canUseCustomBranding: true,
    tenantThemeOverrideEnabled: true,
    whiteLabelPresentationEnabled: true,
  };
  const staleContext = {
    ...trustedContext,
    tenantId: "11111111-1111-4111-8111-111111111111",
  };
  const assetModes = { logo: "inherit", favicon: "inherit", splash: "inherit" };
  for (const options of [
    {
      snapshotContext: staleContext,
      expectedRawBrandThemeSha256: rawBrandThemeSha256(raw),
    },
    {
      snapshotContext: trustedContext,
      expectedRawBrandThemeSha256: "0".repeat(64),
    },
  ]) {
    const result = resolveAppearance(raw, {
      trustedContext,
      expectedContextSha256: appearanceContextSha256(trustedContext),
      assetModes,
      expectedAssetModesSha256: appearanceAssetModesSha256(assetModes),
      ...options,
    });
    assert.equal(result.status, "fallback");
    assert.equal(result.reason, "THEME_HASH_MISMATCH");
    assert.equal(result.appearance.identity.brandName, "Fieldgrid");
    assert.equal(result.appearance.identity.logo.url, null);
    assert.equal(
      result.appearance.communication.emailSignature,
      SAFE_PLATFORM_FALLBACK_RAW_THEME.emailSignature,
    );
    assert.equal(
      result.appearance.rawBrandThemeSha256,
      SAFE_PLATFORM_FALLBACK_RAW_SHA256,
    );
    assert.deepEqual(result.appearance.semanticOutput, result.semanticOutput);
  }
});

test("missing trusted raw or asset-mode integrity hashes cannot resolve", () => {
  const raw = SAFE_PLATFORM_FALLBACK_RAW_THEME;
  const context = {
    host: "integrity.example.test",
    tenantId: "44444444-4444-4444-8444-444444444444",
    themeRevision: 4,
    entitlement: "enterprise",
    canUseCustomBranding: true,
    tenantThemeOverrideEnabled: true,
    whiteLabelPresentationEnabled: false,
  };
  const assetModes = { logo: "none", favicon: "none", splash: "none" };
  for (const options of [
    {
      assetModes,
      expectedAssetModesSha256: appearanceAssetModesSha256(assetModes),
    },
    { expectedRawBrandThemeSha256: rawBrandThemeSha256(raw), assetModes },
  ]) {
    const result = resolveAppearance(raw, {
      trustedContext: context,
      expectedContextSha256: appearanceContextSha256(context),
      ...options,
    });
    assert.equal(result.status, "fallback");
    assert.equal(result.reason, "THEME_HASH_MISMATCH");
  }
});

test("explicit asset modes distinguish inherit, owned asset and clear", () => {
  const raw = {
    ...SAFE_PLATFORM_FALLBACK_RAW_THEME,
    logoUrl: "https://assets.example.test/tenant/logo.png",
    logoStoragePath: "tenant-theme/tenant-id/logo.png",
    faviconUrl: "https://assets.example.test/platform/favicon.png",
    faviconStoragePath: null,
    splashUrl: "https://assets.example.test/tenant/old-splash.png",
    splashStoragePath: "tenant-theme/tenant-id/old-splash.png",
  };
  const context = {
    host: "asset-modes.example.test",
    tenantId: "33333333-3333-4333-8333-333333333333",
    themeRevision: 3,
    entitlement: "enterprise",
    canUseCustomBranding: true,
    tenantThemeOverrideEnabled: true,
    whiteLabelPresentationEnabled: false,
  };
  const assetModes = { logo: "asset", favicon: "inherit", splash: "none" };
  const result = resolveAppearance(raw, {
    trustedContext: context,
    expectedContextSha256: appearanceContextSha256(context),
    expectedRawBrandThemeSha256: rawBrandThemeSha256(raw),
    assetModes,
    expectedAssetModesSha256: appearanceAssetModesSha256(assetModes),
  });
  assert.equal(result.status, "resolved");
  assert.deepEqual(result.appearance.identity.logo, {
    mode: "asset",
    url: raw.logoUrl,
    storagePath: raw.logoStoragePath,
  });
  assert.deepEqual(result.appearance.identity.favicon, {
    mode: "inherit",
    url: raw.faviconUrl,
    storagePath: null,
  });
  assert.deepEqual(result.appearance.identity.splash, {
    mode: "none",
    url: null,
    storagePath: null,
  });
});

test("an invalid or forged trusted appearance context emits nothing", () => {
  const raw = SAFE_PLATFORM_FALLBACK_RAW_THEME;
  assert.throws(
    () =>
      resolveAppearance(raw, {
        trustedContext: {
          host: "https://TENANT.example.test/path",
          tenantId: "not-a-tenant",
          themeRevision: -1,
          entitlement: "starter",
          canUseCustomBranding: true,
          tenantThemeOverrideEnabled: true,
          whiteLabelPresentationEnabled: true,
        },
      }),
    /INVALID_TRUSTED_APPEARANCE_CONTEXT/u,
  );
});

test("low-contrast fixture exposes invalid-input and readability diagnostics without mutating raw", () => {
  const fixture = manifest.fixtures.find(({ id }) => id === "low-contrast");
  const before = structuredClone(fixture.rawBrandTheme);
  const result = deriveTheme(fixture.rawBrandTheme);
  assert.deepEqual(fixture.rawBrandTheme, before);
  assert.ok(
    result.diagnostics.some(({ code }) => code === "INVALID_HEX_FALLBACK"),
  );
  assert.ok(
    result.diagnostics.some(({ code }) => code === "INVALID_ENUM_FALLBACK"),
  );
  assert.ok(
    result.diagnostics.some(({ code }) => code === "FOREGROUND_ADJUSTED"),
  );
  assert.ok(
    result.diagnostics.some(({ code }) => code === "INTERACTIVE_FILL_ADJUSTED"),
  );
  const runtime = resolveTheme(fixture.rawBrandTheme);
  assert.equal(runtime.status, "fallback");
  assert.equal(runtime.reason, "INVALID_RAW_THEME");
  assert.equal(
    runtime.effectiveRawBrandThemeSha256,
    SAFE_PLATFORM_FALLBACK_RAW_SHA256,
  );
});

test("authored fixture keeps existing canonical pixel values and fixed status colors stay out of derivation", () => {
  const fixture = manifest.fixtures.find(({ id }) => id === "default");
  const canonical = tokenManifest.colors.canonical;
  const output = fixture.expectedSemanticOutput;
  assert.equal(output.canvas, canonical.appBackground);
  assert.equal(output.surface, canonical.panel);
  assert.equal(output.foreground, canonical.foreground);
  assert.equal(output.text, canonical.text);
  assert.notEqual(output.foreground, output.text);
  assert.equal(output.mutedSurface, canonical.muted);
  assert.equal(output.secondarySoft, canonical.secondary);
  assert.notEqual(output.mutedSurface, output.secondarySoft);
  assert.equal(output.line, canonical.line);
  assert.equal(output.borderSubtle, canonical.border);
  assert.notEqual(output.line, output.borderSubtle);
  assert.equal(output.borderControl, canonical.input);
  assert.equal(output.focusRing, canonical.ring);
  assert.equal(output.sidebarBackgroundMid, canonical.sidebarBackgroundMid);
  assert.equal(output.sidebarActiveBackground, "#D9F6E8");
  assert.equal(output.sidebarActiveHover, "#D9F6E8");
  assert.equal(output.sidebarActiveText, "#083F35");
  assert.equal(output.sidebarActiveHoverText, "#083F35");
  assert.equal(output.sidebarActiveIndicator, "#25B77F");
  assert.equal(output.sidebarActiveIndicatorHover, "#25B77F");
  assert.equal(manifest.canonicalBridgeMapping["--foreground"], "foreground");
  assert.equal(
    manifest.canonicalBridgeMapping["--card-foreground"],
    "foreground",
  );
  assert.equal(
    manifest.canonicalBridgeMapping["--popover-foreground"],
    "foreground",
  );
  assert.equal(manifest.canonicalBridgeMapping["--muted"], "mutedSurface");
  assert.equal(manifest.canonicalBridgeMapping["--line"], "line");
  for (const forbidden of [
    "success",
    "warning",
    "danger",
    "info",
    "locked",
    "planMint",
  ]) {
    assert.equal(Object.hasOwn(output, forbidden), false);
  }
});

test("authored active-navigation values are pinned to the archived prototype CSS", async () => {
  const evidence = manifest.canonicalPrototypeEvidence;
  const manifestUrl = new URL(
    "../manifests/theme-derivation.json",
    import.meta.url,
  );
  const archivePath = fileURLToPath(new URL(evidence.archive, manifestUrl));
  const css = execFileSync("tar", ["-xOf", archivePath, evidence.member], {
    encoding: "utf8",
  });
  const active = css.match(
    /\.primary-sidebar \.nav-item\.is-active\s*\{([^}]*)\}/,
  )?.[1];
  assert.ok(active, `${evidence.selector} not found in archived prototype CSS`);
  assert.match(active, /color:\s*#083f35\s*;/i);
  assert.match(active, /background:\s*#d9f6e8\s*;/i);
  assert.match(active, /box-shadow:\s*inset 3px 0 #25b77f\s*;/i);
  assert.ok(
    css.indexOf(".primary-sidebar .nav-item:hover") <
      css.indexOf(".primary-sidebar .nav-item.is-active"),
    "active rule must follow equal-specificity hover rule so the pinned active colors also win on hover",
  );
  const normalization = await readFile(
    new URL("../evidence/visual/reference-normalization.css", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(normalization, /\.primary-sidebar \.nav-item\.is-active/);
});
