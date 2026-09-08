#!/usr/bin/env node

/**
 * Fieldflow Calm tenant-theme derivation reference.
 *
 * The exported derivation functions are deliberately dependency-free and use
 * only 8-bit sRGB channels plus the WCAG 2.x relative-luminance formula. The
 * small CLI at the bottom is a manifest generator/verifier; production code
 * may port the pure functions, but must reproduce the fixture hashes exactly.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const ALGORITHM_ID = "fieldflow-calm-srgb-wcag";
export const ALGORITHM_VERSION = "2.0.0";
export const CANONICAL_FIXTURE_RAW_SHA256 =
  "9ca02c8def0805d87b21681edc909c2fc209793224e4c2568e75cf3a1e4d48e1";
export const NATIVE_STATUS_BAR_TIE_LUMINANCE = Math.sqrt(0.0525) - 0.05;
export const NATIVE_COLD_START_FALLBACK = Object.freeze({
  nativeStatusBarBackground: "#F8FAFC",
  nativeStatusBarStyle: "Style.Dark",
  nativeSafeAreaBackground: "#F8FAFC",
  source: "fieldgrid-code-platform-fallback",
});
export const CANONICAL_PROTOTYPE_ACTIVE_NAV = Object.freeze({
  background: "#D9F6E8",
  hoverBackground: "#D9F6E8",
  text: "#083F35",
  hoverText: "#083F35",
  indicator: "#25B77F",
  hoverIndicator: "#25B77F",
});
export const SAFE_PLATFORM_FALLBACK_RAW_THEME = Object.freeze({
  brandName: "Fieldgrid",
  platformName: "Fieldgrid",
  logoUrl: null,
  logoStoragePath: null,
  faviconUrl: null,
  faviconStoragePath: null,
  splashUrl: null,
  splashStoragePath: null,
  primaryColor: "#081D3A",
  secondaryColor: "#133D6B",
  accentColor: "#00B7B3",
  backgroundColor: "#F8FAFC",
  surfaceColor: "#FFFFFF",
  textColor: "#081D3A",
  mutedColor: "#64748B",
  sidebarBackgroundColor: "#081D3A",
  sidebarTextColor: "#FFFFFF",
  sidebarAccentColor: "#00B7B3",
  fontFamily: "inter",
  headingFontFamily: "poppins",
  borderRadius: "md",
  density: "comfortable",
  emailFooterText:
    "Dit is een automatisch bericht van Fieldgrid. U ontvangt dit bericht omdat u betrokken bent bij een aanvraag, opdracht, rapportage, factuur of portaalmelding.",
  emailSignature: "Met vriendelijke groet,\nFieldgrid",
});
export const SAFE_PLATFORM_FALLBACK_RAW_SHA256 =
  "b25dbedfeb0b05e4051a6a05c76d3d8435665f62d73644edc87f550b821d3c80";

export const APPEARANCE_CONTEXT_FIELDS = Object.freeze([
  "host",
  "tenantId",
  "themeRevision",
  "entitlement",
  "canUseCustomBranding",
  "tenantThemeOverrideEnabled",
  "whiteLabelPresentationEnabled",
]);

export const APPEARANCE_ASSET_KINDS = Object.freeze([
  "logo",
  "favicon",
  "splash",
]);
export const APPEARANCE_ASSET_MODES = Object.freeze([
  "inherit",
  "asset",
  "none",
]);
export const SAFE_PLATFORM_FALLBACK_ASSET_MODES = Object.freeze({
  logo: "none",
  favicon: "none",
  splash: "none",
});

export const BRAND_THEME_FIELD_ORDER = Object.freeze([
  "brandName",
  "platformName",
  "logoUrl",
  "logoStoragePath",
  "faviconUrl",
  "faviconStoragePath",
  "splashUrl",
  "splashStoragePath",
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "backgroundColor",
  "surfaceColor",
  "textColor",
  "mutedColor",
  "sidebarBackgroundColor",
  "sidebarTextColor",
  "sidebarAccentColor",
  "fontFamily",
  "headingFontFamily",
  "borderRadius",
  "density",
  "emailFooterText",
  "emailSignature",
]);

const COLOR_FIELDS = Object.freeze([
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "backgroundColor",
  "surfaceColor",
  "textColor",
  "mutedColor",
  "sidebarBackgroundColor",
  "sidebarTextColor",
  "sidebarAccentColor",
]);

const FALLBACK = Object.freeze({
  primaryColor: "#07554E",
  secondaryColor: "#173B37",
  accentColor: "#15996E",
  backgroundColor: "#F5F7F6",
  surfaceColor: "#FFFFFF",
  textColor: "#123532",
  mutedColor: "#5D716E",
  sidebarBackgroundColor: "#074B46",
  sidebarTextColor: "#E9FAF5",
  sidebarAccentColor: "#169A6C",
  fontFamily: "system",
  headingFontFamily: "system",
  borderRadius: "md",
  density: "comfortable",
});

const ENUMS = Object.freeze({
  fontFamily: Object.freeze(["inter", "poppins", "system"]),
  headingFontFamily: Object.freeze(["inter", "poppins", "system"]),
  borderRadius: Object.freeze(["sm", "md", "lg"]),
  density: Object.freeze(["compact", "comfortable", "spacious"]),
});

export const ALGORITHM_CONTRACT = Object.freeze({
  id: ALGORITHM_ID,
  version: ALGORITHM_VERSION,
  input:
    "complete raw BrandTheme snapshot; raw values remain editor/audit data",
  colorSpace:
    "8-bit sRGB; no HSL, OKLCH, browser color parser or ICC conversion",
  normalization:
    "accept exactly #RRGGBB case-insensitively and emit uppercase #RRGGBB",
  channelRounding:
    "round-half-up per channel: floor(((first * firstPercent) + (second * (100 - firstPercent))) / 100 + 0.5)",
  mixPercentages: Object.freeze({
    surfaceSubtle: Object.freeze({ background: 64, surface: 36 }),
    mutedSurface: Object.freeze({ text: 7, surface: 93 }),
    primaryHover: Object.freeze({ primary: 88, black: 12 }),
    primaryPressed: Object.freeze({ primary: 76, black: 24 }),
    primarySoft: Object.freeze({ primary: 10, surface: 90 }),
    primarySoftHover: Object.freeze({ primary: 16, surface: 84 }),
    secondarySoft: Object.freeze({ secondary: 10, surface: 90 }),
    accentHover: Object.freeze({ accent: 88, black: 12 }),
    accentPressed: Object.freeze({ accent: 76, black: 24 }),
    accentSoft: Object.freeze({ accent: 12, surface: 88 }),
    selectionHover: Object.freeze({ accent: 18, surface: 82 }),
    borderSubtle: Object.freeze({ text: 14, surface: 86 }),
    line: Object.freeze({ text: 12, surface: 88 }),
    borderControlBase: Object.freeze({ text: 38, surface: 62 }),
    sidebarMid: Object.freeze({ sidebarBackground: 88, black: 12 }),
    sidebarEnd: Object.freeze({ sidebarBackground: 76, black: 24 }),
    sidebarMutedBase: Object.freeze({ sidebarText: 68, sidebarMid: 32 }),
    sidebarActiveSoft: Object.freeze({ sidebarActiveIndicator: 14, white: 86 }),
    sidebarActiveSoftHover: Object.freeze({
      sidebarActiveIndicator: 20,
      white: 80,
    }),
    sidebarActiveIndicatorHover: Object.freeze({
      sidebarActiveIndicator: 88,
      black: 12,
    }),
  }),
  contrast: Object.freeze({
    formula:
      "WCAG 2.x relative luminance and (lighter + 0.05) / (darker + 0.05)",
    normalText: 4.5,
    meaningfulBoundary: 3,
    focus:
      "two-layer ring: 2px surface offset separates the primary control, 3px solid outer ring must be >=3:1 against canvas and surface",
  }),
  foregroundChoice: Object.freeze({
    preservePreferredWhen:
      "minimum contrast against every supplied background is >=4.5:1",
    correctionOrder: Object.freeze(["#081D3A", "#FFFFFF", "#000000"]),
    exhaustedFallback:
      "candidate with highest minimum contrast; ties retain correctionOrder",
  }),
  gamutCorrection: Object.freeze({
    candidates:
      "base; 1..100% mixes toward black; 1..100% mixes toward white; then #000000..#FFFFFF neutral grays",
    choice:
      "closest squared Euclidean 8-bit sRGB distance that meets every threshold; ties by uppercase hex; if none meets, highest minimum contrast then distance then hex",
  }),
  interactiveFillCorrection: Object.freeze({
    rule: "primary/accent/sidebar fills search the same finite candidate gamut until every generated state has a >=3:1 environment boundary and its declared foreground has >=4.5:1",
    foregroundModes: Object.freeze({
      primaryAndAccent: "per-state foreground",
      sidebarGradient: "one shared foreground across all stops",
      sidebarActive: "per-state foreground on soft active backgrounds",
    }),
    stateWeights: Object.freeze({
      primaryAndAccent: Object.freeze([100, 88, 76]),
      sidebarGradient: Object.freeze([100, 88, 76]),
      sidebarActive: Object.freeze([
        "14%-indicator soft",
        "20%-indicator soft",
      ]),
    }),
    sidebarMuted:
      "start at 68% sidebarText over sidebarMid, then increase sidebarText one integer percentage point through 100 until 4.5:1 is met across every gradient stop",
  }),
  fixedFunctionalColorRule:
    "success, warning, danger, info, locked and planboard palettes are not derived from tenant colors and remain authoritative in fieldflow-tokens.json",
  nativeRuntimeChrome: Object.freeze({
    background: "semantic canvas; safe-area background is identical",
    style:
      "Style.Dark when black icon contrast is greater than or exactly equal to white icon contrast; Style.Light otherwise",
    exactTieBreak: "Style.Dark",
    coldStartFallback: NATIVE_COLD_START_FALLBACK,
    scope:
      "Capacitor runtime status bar and web safe-area only; native launcher name/package/icon, OS splash and build-time notification/channel assets are excluded",
  }),
  failClosedResolution: Object.freeze({
    candidateSafety:
      "safe only when raw input has no invalid field diagnostics, no correction reports thresholdMet=false and every declared semantic contrast pair passes",
    activationFailure:
      "status rejected; do not persist/activate; return the complete last-safe effective snapshot supplied by the editor",
    runtimeFailure:
      "status fallback; atomically return the complete hash-verified safe platform fallback; never merge candidate and fallback tokens",
    integrityFailure:
      "stale or hash-mismatched snapshots bypass candidate activation and use the same atomic fallback path",
    safePlatformFallbackRawSha256: SAFE_PLATFORM_FALLBACK_RAW_SHA256,
    reasons: Object.freeze([
      "INVALID_RAW_THEME",
      "UNRESOLVABLE_CONTRAST",
      "STALE_THEME_SNAPSHOT",
      "THEME_HASH_MISMATCH",
    ]),
  }),
  hashes: Object.freeze({
    rawBrandTheme:
      "SHA-256 of compact JSON serialized in BRAND_THEME_FIELD_ORDER; this preserves the existing canonical fixture hash",
    semanticOutputAndDiagnostics:
      "SHA-256 of recursively key-sorted compact JSON with no trailing newline",
  }),
});

function assertPercent(value) {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new TypeError(
      `Mix percentage must be an integer from 0 through 100; received ${value}`,
    );
  }
}

export function normalizeHex(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value.toUpperCase()
    : null;
}

function channels(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized)
    throw new TypeError(`Expected #RRGGBB, received ${String(hex)}`);
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

function channelHex(value) {
  return value.toString(16).toUpperCase().padStart(2, "0");
}

export function mixHex(first, second, firstPercent) {
  assertPercent(firstPercent);
  const a = channels(first);
  const b = channels(second);
  return `#${a
    .map((value, index) =>
      channelHex(
        Math.floor(
          (value * firstPercent + b[index] * (100 - firstPercent)) / 100 + 0.5,
        ),
      ),
    )
    .join("")}`;
}

function linearSrgb(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex) {
  const [red, green, blue] = channels(hex).map(linearSrgb);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function chooseNativeStatusBarStyleFromLuminance(luminance) {
  if (
    typeof luminance !== "number" ||
    !Number.isFinite(luminance) ||
    luminance < 0 ||
    luminance > 1
  ) {
    throw new TypeError(
      `Expected relative luminance from 0 through 1; received ${luminance}`,
    );
  }
  return luminance >= NATIVE_STATUS_BAR_TIE_LUMINANCE
    ? "Style.Dark"
    : "Style.Light";
}

export function chooseNativeStatusBarStyle(background) {
  return chooseNativeStatusBarStyleFromLuminance(relativeLuminance(background));
}

export function deriveNativeRuntimeChrome(canvas) {
  const background = normalizeHex(canvas);
  if (!background)
    throw new TypeError(
      "deriveNativeRuntimeChrome requires a normalized canvas color",
    );
  return {
    nativeStatusBarBackground: background,
    nativeStatusBarStyle: chooseNativeStatusBarStyle(background),
    nativeSafeAreaBackground: background,
  };
}

function minimumContrast(color, backgrounds) {
  return Math.min(
    ...backgrounds.map((background) => contrastRatio(color, background)),
  );
}

function diagnosticRatio(value) {
  return Number(value.toFixed(3));
}

function squaredDistance(first, second) {
  const a = channels(first);
  const b = channels(second);
  return a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);
}

function compareHex(first, second) {
  return first < second ? -1 : first > second ? 1 : 0;
}

function correctionCandidates(base) {
  const result = new Set([base]);
  for (let percentage = 1; percentage <= 100; percentage += 1) {
    result.add(mixHex("#000000", base, percentage));
    result.add(mixHex("#FFFFFF", base, percentage));
  }
  for (let value = 0; value <= 255; value += 1) {
    const part = channelHex(value);
    result.add(`#${part}${part}${part}`);
  }
  return [...result];
}

export function closestAccessibleColor(base, backgrounds, threshold) {
  const normalizedBase = normalizeHex(base);
  const normalizedBackgrounds = backgrounds.map(normalizeHex);
  if (!normalizedBase || normalizedBackgrounds.some((value) => !value)) {
    throw new TypeError(
      "closestAccessibleColor requires normalized #RRGGBB inputs",
    );
  }

  const assessed = correctionCandidates(normalizedBase).map((color) => ({
    color,
    distance: squaredDistance(normalizedBase, color),
    minimumRatio: minimumContrast(color, normalizedBackgrounds),
  }));
  const passing = assessed
    .filter((entry) => entry.minimumRatio + Number.EPSILON >= threshold)
    .sort((a, b) => a.distance - b.distance || compareHex(a.color, b.color));
  if (passing.length > 0) return { ...passing[0], thresholdMet: true };

  assessed.sort(
    (a, b) =>
      b.minimumRatio - a.minimumRatio ||
      a.distance - b.distance ||
      compareHex(a.color, b.color),
  );
  return { ...assessed[0], thresholdMet: false };
}

function chooseForeground(preferred, backgrounds, context, diagnostics) {
  const threshold = ALGORITHM_CONTRACT.contrast.normalText;
  const before = minimumContrast(preferred, backgrounds);
  if (before + Number.EPSILON >= threshold) return preferred;

  const ordered = ALGORITHM_CONTRACT.foregroundChoice.correctionOrder;
  let chosen = accessibleForegroundCandidate(preferred, backgrounds);
  if (!chosen) {
    chosen = ordered
      .map((candidate, index) => ({
        candidate,
        index,
        ratio: minimumContrast(candidate, backgrounds),
      }))
      .sort((a, b) => b.ratio - a.ratio || a.index - b.index)[0].candidate;
  }
  diagnostics.push({
    code: "FOREGROUND_ADJUSTED",
    context,
    input: preferred,
    output: chosen,
    minimumContrastBefore: diagnosticRatio(before),
    minimumContrastAfter: diagnosticRatio(minimumContrast(chosen, backgrounds)),
    threshold,
  });
  return chosen;
}

function accessibleForegroundCandidate(preferred, backgrounds) {
  const threshold = ALGORITHM_CONTRACT.contrast.normalText;
  const ordered = [
    preferred,
    ...ALGORITHM_CONTRACT.foregroundChoice.correctionOrder,
  ].filter((candidate, index, values) => values.indexOf(candidate) === index);
  return ordered.find(
    (candidate) =>
      minimumContrast(candidate, backgrounds) + Number.EPSILON >= threshold,
  );
}

function closestInteractiveFill(
  base,
  environmentBackgrounds,
  stateWeights,
  preferredForeground,
  foregroundMode,
) {
  const boundaryThreshold = ALGORITHM_CONTRACT.contrast.meaningfulBoundary;
  const assessed = correctionCandidates(base).map((color) => {
    const states = stateWeights.map((weight) =>
      weight === 100 ? color : mixHex(color, "#000000", weight),
    );
    const boundaryRatio = Math.min(
      ...states.flatMap((state) =>
        environmentBackgrounds.map((background) =>
          contrastRatio(state, background),
        ),
      ),
    );
    const foregrounds =
      foregroundMode === "shared"
        ? states.map(() =>
            accessibleForegroundCandidate(preferredForeground, states),
          )
        : states.map((state) =>
            accessibleForegroundCandidate(preferredForeground, [state]),
          );
    return {
      color,
      states,
      foregrounds,
      boundaryRatio,
      foregroundRatio: foregrounds.every(Boolean)
        ? Math.min(
            ...foregrounds.map((foreground, index) =>
              contrastRatio(foreground, states[index]),
            ),
          )
        : 0,
      distance: squaredDistance(base, color),
    };
  });
  const passing = assessed
    .filter(
      (entry) =>
        entry.boundaryRatio + Number.EPSILON >= boundaryThreshold &&
        entry.foregrounds.every(Boolean),
    )
    .sort((a, b) => a.distance - b.distance || compareHex(a.color, b.color));
  if (passing.length > 0) return { ...passing[0], thresholdMet: true };

  assessed.sort(
    (a, b) =>
      Number(b.foregrounds.every(Boolean)) -
        Number(a.foregrounds.every(Boolean)) ||
      b.boundaryRatio - a.boundaryRatio ||
      b.foregroundRatio - a.foregroundRatio ||
      a.distance - b.distance ||
      compareHex(a.color, b.color),
  );
  return { ...assessed[0], thresholdMet: false };
}

function correctInteractiveFill({
  color,
  environmentBackgrounds,
  stateWeights,
  preferredForeground,
  foregroundMode,
  context,
  code,
  diagnostics,
}) {
  const beforeStates = stateWeights.map((weight) =>
    weight === 100 ? color : mixHex(color, "#000000", weight),
  );
  const beforeBoundary = Math.min(
    ...beforeStates.flatMap((state) =>
      environmentBackgrounds.map((background) =>
        contrastRatio(state, background),
      ),
    ),
  );
  const beforeForegrounds =
    foregroundMode === "shared"
      ? beforeStates.map(() =>
          accessibleForegroundCandidate(preferredForeground, beforeStates),
        )
      : beforeStates.map((state) =>
          accessibleForegroundCandidate(preferredForeground, [state]),
        );
  if (
    beforeBoundary + Number.EPSILON >=
      ALGORITHM_CONTRACT.contrast.meaningfulBoundary &&
    beforeForegrounds.every(Boolean)
  ) {
    return { color, states: beforeStates, foregrounds: beforeForegrounds };
  }

  const correction = closestInteractiveFill(
    color,
    environmentBackgrounds,
    stateWeights,
    preferredForeground,
    foregroundMode,
  );
  diagnostics.push({
    code,
    context,
    input: color,
    output: correction.color,
    minimumBoundaryContrastBefore: diagnosticRatio(beforeBoundary),
    minimumBoundaryContrastAfter: diagnosticRatio(correction.boundaryRatio),
    foregrounds: correction.foregrounds,
    minimumForegroundContrastAfter: diagnosticRatio(correction.foregroundRatio),
    boundaryThreshold: ALGORITHM_CONTRACT.contrast.meaningfulBoundary,
    foregroundThreshold: ALGORITHM_CONTRACT.contrast.normalText,
    thresholdMet: correction.thresholdMet,
  });
  return correction;
}

function correctBoundary(
  color,
  backgrounds,
  context,
  diagnostics,
  code = "BOUNDARY_ADJUSTED",
) {
  const threshold = ALGORITHM_CONTRACT.contrast.meaningfulBoundary;
  const before = minimumContrast(color, backgrounds);
  if (before + Number.EPSILON >= threshold) return color;

  const correction = closestAccessibleColor(color, backgrounds, threshold);
  diagnostics.push({
    code,
    context,
    input: color,
    output: correction.color,
    minimumContrastBefore: diagnosticRatio(before),
    minimumContrastAfter: diagnosticRatio(correction.minimumRatio),
    threshold,
    thresholdMet: correction.thresholdMet,
  });
  return correction.color;
}

function correctNormalText(color, backgrounds, context, diagnostics) {
  const threshold = ALGORITHM_CONTRACT.contrast.normalText;
  const before = minimumContrast(color, backgrounds);
  if (before + Number.EPSILON >= threshold) return color;
  const correction = closestAccessibleColor(color, backgrounds, threshold);
  diagnostics.push({
    code: "TEXT_CONTRAST_ADJUSTED",
    context,
    input: color,
    output: correction.color,
    minimumContrastBefore: diagnosticRatio(before),
    minimumContrastAfter: diagnosticRatio(correction.minimumRatio),
    threshold,
    thresholdMet: correction.thresholdMet,
  });
  return correction.color;
}

function normalizeRawTheme(rawTheme, diagnostics) {
  const normalized = { ...rawTheme };
  for (const field of COLOR_FIELDS) {
    const value = normalizeHex(rawTheme[field]);
    if (value) {
      normalized[field] = value;
      continue;
    }
    normalized[field] = FALLBACK[field];
    diagnostics.push({
      code: "INVALID_HEX_FALLBACK",
      field,
      input: rawTheme[field] ?? null,
      output: FALLBACK[field],
    });
  }
  for (const [field, allowed] of Object.entries(ENUMS)) {
    if (allowed.includes(rawTheme[field])) continue;
    normalized[field] = FALLBACK[field];
    diagnostics.push({
      code: "INVALID_ENUM_FALLBACK",
      field,
      input: rawTheme[field] ?? null,
      output: FALLBACK[field],
      allowed,
    });
  }
  return normalized;
}

/**
 * Pure raw BrandTheme -> normalized semantic token derivation.
 * No object outside the returned value is read or mutated.
 */
export function deriveTheme(rawTheme) {
  const diagnostics = [];
  const normalizedRawTheme = normalizeRawTheme(rawTheme, diagnostics);
  const color = normalizedRawTheme;

  const rootBackground = color.backgroundColor;
  const canvas = color.backgroundColor;
  const surface = color.surfaceColor;
  const surfaceSubtle = mixHex(canvas, surface, 64);
  const surfaceElevated = surface;
  const textBackgrounds = [rootBackground, canvas, surface, surfaceSubtle];
  let text = chooseForeground(
    color.textColor,
    textBackgrounds,
    "text",
    diagnostics,
  );
  let mutedSurface = mixHex(text, surface, 7);
  text = chooseForeground(
    text,
    [...textBackgrounds, mutedSurface],
    "text including muted-surface",
    diagnostics,
  );
  mutedSurface = mixHex(text, surface, 7);
  const foreground = text;
  const textMuted = correctNormalText(
    color.mutedColor,
    [...textBackgrounds, mutedSurface],
    "text-muted",
    diagnostics,
  );

  const primaryCorrection = correctInteractiveFill({
    color: color.primaryColor,
    environmentBackgrounds: [canvas, surface],
    stateWeights: [100, 88, 76],
    preferredForeground: "#FFFFFF",
    foregroundMode: "per-state",
    context: "primary default/hover/pressed",
    code: "INTERACTIVE_FILL_ADJUSTED",
    diagnostics,
  });
  const [primary, primaryHover, primaryPressed] = primaryCorrection.states;
  const primarySoft = mixHex(primary, surface, 10);
  const primarySoftHover = mixHex(primary, surface, 16);
  const textOnPrimary = chooseForeground(
    "#FFFFFF",
    [primary],
    "text-on-primary",
    diagnostics,
  );
  const textOnPrimaryHover = chooseForeground(
    "#FFFFFF",
    [primaryHover],
    "text-on-primary-hover",
    diagnostics,
  );
  const textOnPrimaryPressed = chooseForeground(
    "#FFFFFF",
    [primaryPressed],
    "text-on-primary-pressed",
    diagnostics,
  );

  const secondaryStrong = correctBoundary(
    color.secondaryColor,
    [canvas, surface],
    "secondary against canvas/surface",
    diagnostics,
  );
  const secondarySoft = mixHex(secondaryStrong, surface, 10);
  const textOnSecondary = chooseForeground(
    text,
    [secondarySoft],
    "text-on-secondary-soft",
    diagnostics,
  );

  const accentCorrection = correctInteractiveFill({
    color: color.accentColor,
    environmentBackgrounds: [canvas, surface],
    stateWeights: [100, 88, 76],
    preferredForeground: "#FFFFFF",
    foregroundMode: "per-state",
    context: "accent default/hover/pressed",
    code: "INTERACTIVE_FILL_ADJUSTED",
    diagnostics,
  });
  const [accentStrong, accentHover, accentPressed] = accentCorrection.states;
  const accentSoft = mixHex(accentStrong, surface, 12);
  const textOnAccent = chooseForeground(
    "#FFFFFF",
    [accentStrong],
    "text-on-accent",
    diagnostics,
  );
  const textOnAccentHover = chooseForeground(
    "#FFFFFF",
    [accentHover],
    "text-on-accent-hover",
    diagnostics,
  );
  const textOnAccentPressed = chooseForeground(
    "#FFFFFF",
    [accentPressed],
    "text-on-accent-pressed",
    diagnostics,
  );
  const textOnAccentSoft = chooseForeground(
    text,
    [accentSoft],
    "text-on-accent-soft",
    diagnostics,
  );

  const selection = accentSoft;
  const selectionHover = mixHex(accentStrong, surface, 18);
  const selectionBorder = correctBoundary(
    accentStrong,
    [selection, surface],
    "selection-border default",
    diagnostics,
  );
  const selectionHoverBorder = correctBoundary(
    selectionBorder,
    [selectionHover, surface],
    "selection-border hover",
    diagnostics,
  );
  const textOnSelection = chooseForeground(
    text,
    [selection, selectionHover],
    "text-on-selection",
    diagnostics,
  );

  const borderSubtle = mixHex(text, surface, 14);
  const line = mixHex(text, surface, 12);
  const borderControlBase = mixHex(text, surface, 38);
  const borderControl = correctBoundary(
    borderControlBase,
    [canvas, surface],
    "border-control",
    diagnostics,
  );

  const focusRing = correctBoundary(
    accentStrong,
    [canvas, surface],
    "focus-ring outer layer",
    diagnostics,
    "FOCUS_RING_ADJUSTED",
  );
  const focusRingOffset = surface;

  const sidebarCorrection = correctInteractiveFill({
    color: color.sidebarBackgroundColor,
    environmentBackgrounds: [canvas, surface],
    stateWeights: [100, 88, 76],
    preferredForeground: color.sidebarTextColor,
    foregroundMode: "shared",
    context: "sidebar gradient against canvas/surface with shared text",
    code: "SIDEBAR_BACKGROUND_ADJUSTED",
    diagnostics,
  });
  const [sidebarBackgroundStart, sidebarBackgroundMid, sidebarBackgroundEnd] =
    sidebarCorrection.states;
  const sidebarBackgrounds = [
    sidebarBackgroundStart,
    sidebarBackgroundMid,
    sidebarBackgroundEnd,
  ];
  const sidebarText = chooseForeground(
    color.sidebarTextColor,
    sidebarBackgrounds,
    "sidebar-text across gradient",
    diagnostics,
  );
  const sidebarMutedBase = mixHex(sidebarText, sidebarBackgroundMid, 68);
  let sidebarMuted = sidebarMutedBase;
  let sidebarMutedWeight = 68;
  while (
    sidebarMutedWeight < 100 &&
    minimumContrast(sidebarMuted, sidebarBackgrounds) + Number.EPSILON <
      ALGORITHM_CONTRACT.contrast.normalText
  ) {
    sidebarMutedWeight += 1;
    sidebarMuted = mixHex(
      sidebarText,
      sidebarBackgroundMid,
      sidebarMutedWeight,
    );
  }
  if (sidebarMuted !== sidebarMutedBase) {
    diagnostics.push({
      code: "TEXT_CONTRAST_ADJUSTED",
      context: "sidebar-muted across gradient",
      input: sidebarMutedBase,
      output: sidebarMuted,
      sidebarTextWeightBefore: 68,
      sidebarTextWeightAfter: sidebarMutedWeight,
      minimumContrastBefore: diagnosticRatio(
        minimumContrast(sidebarMutedBase, sidebarBackgrounds),
      ),
      minimumContrastAfter: diagnosticRatio(
        minimumContrast(sidebarMuted, sidebarBackgrounds),
      ),
      threshold: ALGORITHM_CONTRACT.contrast.normalText,
      thresholdMet:
        minimumContrast(sidebarMuted, sidebarBackgrounds) + Number.EPSILON >=
        ALGORITHM_CONTRACT.contrast.normalText,
    });
  }
  const sidebarActiveIndicator = correctBoundary(
    color.sidebarAccentColor,
    sidebarBackgrounds,
    "sidebar-active-indicator against gradient",
    diagnostics,
    "SIDEBAR_ACTIVE_ADJUSTED",
  );
  const sidebarActiveIndicatorHoverBase = mixHex(
    sidebarActiveIndicator,
    "#000000",
    88,
  );
  const sidebarActiveIndicatorHover = correctBoundary(
    sidebarActiveIndicatorHoverBase,
    sidebarBackgrounds,
    "sidebar-active-indicator-hover against gradient",
    diagnostics,
    "SIDEBAR_ACTIVE_ADJUSTED",
  );
  const sidebarActiveBackgroundBase = mixHex(
    sidebarActiveIndicator,
    "#FFFFFF",
    14,
  );
  const sidebarActiveBackground = correctBoundary(
    sidebarActiveBackgroundBase,
    sidebarBackgrounds,
    "sidebar-active soft background against gradient",
    diagnostics,
    "SIDEBAR_ACTIVE_ADJUSTED",
  );
  const sidebarActiveHoverBase = mixHex(sidebarActiveIndicator, "#FFFFFF", 20);
  const sidebarActiveHover = correctBoundary(
    sidebarActiveHoverBase,
    sidebarBackgrounds,
    "sidebar-active soft hover against gradient",
    diagnostics,
    "SIDEBAR_ACTIVE_ADJUSTED",
  );
  const sidebarActiveText = chooseForeground(
    sidebarText,
    [sidebarActiveBackground],
    "sidebar-active-text",
    diagnostics,
  );
  const sidebarActiveHoverText = chooseForeground(
    sidebarText,
    [sidebarActiveHover],
    "sidebar-active-hover-text",
    diagnostics,
  );

  const semanticOutput = {
    rootBackground,
    canvas,
    surface,
    surfaceSubtle,
    surfaceElevated,
    foreground,
    text,
    textMuted,
    mutedSurface,
    primary,
    primaryHover,
    primaryPressed,
    primarySoft,
    primarySoftHover,
    textOnPrimary,
    textOnPrimaryHover,
    textOnPrimaryPressed,
    secondaryStrong,
    secondarySoft,
    textOnSecondary,
    accentStrong,
    accentHover,
    accentPressed,
    accentSoft,
    textOnAccent,
    textOnAccentHover,
    textOnAccentPressed,
    textOnAccentSoft,
    selection,
    selectionHover,
    selectionBorder,
    selectionHoverBorder,
    textOnSelection,
    borderSubtle,
    line,
    borderControl,
    focusRing,
    focusRingOffset,
    sidebarBackgroundStart,
    sidebarBackgroundMid,
    sidebarBackgroundEnd,
    sidebarText,
    sidebarMuted,
    sidebarActiveBackground,
    sidebarActiveHover,
    sidebarActiveText,
    sidebarActiveHoverText,
    sidebarActiveIndicator,
    sidebarActiveIndicatorHover,
    fontBody: normalizedRawTheme.fontFamily,
    fontHeading: normalizedRawTheme.headingFontFamily,
    radiusPreset: normalizedRawTheme.borderRadius,
    densityPreset: normalizedRawTheme.density,
  };
  Object.assign(
    semanticOutput,
    deriveNativeRuntimeChrome(semanticOutput.canvas),
  );

  return {
    normalizedRawTheme,
    semanticOutput,
    diagnostics,
  };
}

export function canonicalBrandThemeStringify(rawTheme) {
  const ordered = {};
  for (const field of BRAND_THEME_FIELD_ORDER) ordered[field] = rawTheme[field];
  return JSON.stringify(ordered);
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function rawBrandThemeSha256(rawTheme) {
  return sha256(canonicalBrandThemeStringify(rawTheme));
}

export function semanticResolutionSha256(semanticOutput, diagnostics) {
  return sha256(stableStringify({ diagnostics, semanticOutput }));
}

export function semanticContrastErrors(token) {
  const errors = [];
  const requireMinimum = (label, foreground, backgrounds, threshold) => {
    const ratio = minimumContrast(foreground, backgrounds);
    if (ratio + Number.EPSILON < threshold) {
      errors.push(
        `${label} ${diagnosticRatio(ratio)}:1 is below ${threshold}:1`,
      );
    }
  };
  const surfaces = [
    token.rootBackground,
    token.canvas,
    token.surface,
    token.surfaceSubtle,
    token.mutedSurface,
  ];
  const sidebarStops = [
    token.sidebarBackgroundStart,
    token.sidebarBackgroundMid,
    token.sidebarBackgroundEnd,
  ];

  requireMinimum("text/surfaces", token.text, surfaces, 4.5);
  requireMinimum("foreground/surfaces", token.foreground, surfaces, 4.5);
  requireMinimum("textMuted/surfaces", token.textMuted, surfaces, 4.5);
  requireMinimum(
    "textOnPrimary/primary",
    token.textOnPrimary,
    [token.primary],
    4.5,
  );
  requireMinimum(
    "textOnPrimaryHover/primaryHover",
    token.textOnPrimaryHover,
    [token.primaryHover],
    4.5,
  );
  requireMinimum(
    "textOnPrimaryPressed/primaryPressed",
    token.textOnPrimaryPressed,
    [token.primaryPressed],
    4.5,
  );
  requireMinimum(
    "textOnSecondary/secondarySoft",
    token.textOnSecondary,
    [token.secondarySoft],
    4.5,
  );
  requireMinimum(
    "textOnAccent/accentStrong",
    token.textOnAccent,
    [token.accentStrong],
    4.5,
  );
  requireMinimum(
    "textOnAccentHover/accentHover",
    token.textOnAccentHover,
    [token.accentHover],
    4.5,
  );
  requireMinimum(
    "textOnAccentPressed/accentPressed",
    token.textOnAccentPressed,
    [token.accentPressed],
    4.5,
  );
  requireMinimum(
    "textOnAccentSoft/accentSoft",
    token.textOnAccentSoft,
    [token.accentSoft],
    4.5,
  );
  requireMinimum(
    "textOnSelection/selection",
    token.textOnSelection,
    [token.selection],
    4.5,
  );
  requireMinimum(
    "textOnSelection/selectionHover",
    token.textOnSelection,
    [token.selectionHover],
    4.5,
  );
  requireMinimum("sidebarText/gradient", token.sidebarText, sidebarStops, 4.5);
  requireMinimum(
    "sidebarMuted/gradient",
    token.sidebarMuted,
    sidebarStops,
    4.5,
  );
  requireMinimum(
    "sidebarActiveText/sidebarActiveBackground",
    token.sidebarActiveText,
    [token.sidebarActiveBackground],
    4.5,
  );
  requireMinimum(
    "sidebarActiveHoverText/sidebarActiveHover",
    token.sidebarActiveHoverText,
    [token.sidebarActiveHover],
    4.5,
  );

  for (const [label, value] of [
    ["primary", token.primary],
    ["primaryHover", token.primaryHover],
    ["primaryPressed", token.primaryPressed],
    ["secondaryStrong", token.secondaryStrong],
    ["accentStrong", token.accentStrong],
    ["accentHover", token.accentHover],
    ["accentPressed", token.accentPressed],
    ["borderControl", token.borderControl],
    ["focusRing", token.focusRing],
    ["sidebarBackgroundStart", token.sidebarBackgroundStart],
    ["sidebarBackgroundMid", token.sidebarBackgroundMid],
    ["sidebarBackgroundEnd", token.sidebarBackgroundEnd],
  ]) {
    requireMinimum(
      `${label}/canvas+surface`,
      value,
      [token.canvas, token.surface],
      3,
    );
  }
  requireMinimum(
    "selectionBorder/selection+surface",
    token.selectionBorder,
    [token.selection, token.surface],
    3,
  );
  requireMinimum(
    "selectionHoverBorder/selectionHover+surface",
    token.selectionHoverBorder,
    [token.selectionHover, token.surface],
    3,
  );
  requireMinimum(
    "focusRingOffset/primary states",
    token.focusRingOffset,
    [token.primary, token.primaryHover, token.primaryPressed],
    3,
  );
  requireMinimum(
    "sidebarActiveBackground/gradient",
    token.sidebarActiveBackground,
    sidebarStops,
    3,
  );
  requireMinimum(
    "sidebarActiveHover/gradient",
    token.sidebarActiveHover,
    sidebarStops,
    3,
  );
  requireMinimum(
    "sidebarActiveIndicator/gradient",
    token.sidebarActiveIndicator,
    sidebarStops,
    3,
  );
  requireMinimum(
    "sidebarActiveIndicatorHover/gradient",
    token.sidebarActiveIndicatorHover,
    sidebarStops,
    3,
  );

  if (token.nativeStatusBarBackground !== token.canvas) {
    errors.push("nativeStatusBarBackground must equal canvas");
  }
  if (token.nativeSafeAreaBackground !== token.canvas) {
    errors.push("nativeSafeAreaBackground must equal canvas");
  }
  const expectedStyle = chooseNativeStatusBarStyle(token.canvas);
  if (token.nativeStatusBarStyle !== expectedStyle) {
    errors.push(
      `nativeStatusBarStyle must be ${expectedStyle} for ${token.canvas}`,
    );
  }
  return errors;
}

export function validateThemeDerivation(
  derivation,
  { rejectInvalidRaw = true } = {},
) {
  const invalidInputDiagnostics = derivation.diagnostics.filter(({ code }) =>
    ["INVALID_HEX_FALLBACK", "INVALID_ENUM_FALLBACK"].includes(code),
  );
  const failedCorrectionDiagnostics = derivation.diagnostics.filter(
    ({ thresholdMet }) => thresholdMet === false,
  );
  const contrastErrors = semanticContrastErrors(derivation.semanticOutput);
  const errors = [];
  if (rejectInvalidRaw && invalidInputDiagnostics.length > 0) {
    errors.push(
      ...invalidInputDiagnostics.map(({ code, field }) => `${code}:${field}`),
    );
  }
  errors.push(
    ...failedCorrectionDiagnostics.map(
      ({ code, context }) => `${code}:${context}:threshold-not-met`,
    ),
    ...contrastErrors,
  );
  return {
    safe: errors.length === 0,
    reason:
      rejectInvalidRaw && invalidInputDiagnostics.length > 0
        ? "INVALID_RAW_THEME"
        : errors.length > 0
          ? "UNRESOLVABLE_CONTRAST"
          : null,
    errors,
    invalidInputDiagnostics,
    failedCorrectionDiagnostics,
    contrastErrors,
  };
}

function finalizeResolveResult(payload) {
  const effectiveSemanticOutputSha256 = sha256(
    stableStringify(payload.semanticOutput),
  );
  const effectiveResolutionSha256 = semanticResolutionSha256(
    payload.semanticOutput,
    payload.effectiveDiagnostics,
  );
  const withOutputHashes = {
    ...payload,
    effectiveSemanticOutputSha256,
    effectiveResolutionSha256,
  };
  return {
    ...withOutputHashes,
    resultSha256: sha256(stableStringify(withOutputHashes)),
  };
}

/**
 * Internal fail-closed color/geometry resolver. Production callers never
 * publish this partial result; resolveAppearance() binds it atomically to the
 * trusted context, identity, explicit asset modes and communication fields.
 */
export function resolveTheme(
  rawTheme,
  {
    mode = "runtime",
    integrity = "valid",
    safeFallback = {
      rawTheme: SAFE_PLATFORM_FALLBACK_RAW_THEME,
      rawBrandThemeSha256: SAFE_PLATFORM_FALLBACK_RAW_SHA256,
      source: "fieldgrid-code-platform-fallback",
    },
  } = {},
) {
  if (!new Set(["runtime", "activation"]).has(mode)) {
    throw new TypeError(`Unknown resolve mode: ${mode}`);
  }
  if (!new Set(["valid", "stale", "hash-mismatch"]).has(integrity)) {
    throw new TypeError(`Unknown integrity status: ${integrity}`);
  }

  const requestedRawBrandThemeSha256 = rawBrandThemeSha256(rawTheme);
  const candidate = deriveTheme(rawTheme);
  const candidateValidation = validateThemeDerivation(candidate);
  const integrityReason =
    integrity === "stale"
      ? "STALE_THEME_SNAPSHOT"
      : integrity === "hash-mismatch"
        ? "THEME_HASH_MISMATCH"
        : null;
  const reason = integrityReason ?? candidateValidation.reason;

  if (!reason) {
    return finalizeResolveResult({
      status: "resolved",
      reason: null,
      mode,
      integrity,
      algorithm: `${ALGORITHM_ID}@${ALGORITHM_VERSION}`,
      requestedRawBrandThemeSha256,
      effectiveRawBrandThemeSha256: requestedRawBrandThemeSha256,
      fallbackSource: null,
      candidateDiagnostics: candidate.diagnostics,
      candidateValidationErrors: [],
      effectiveDiagnostics: candidate.diagnostics,
      semanticOutput: candidate.semanticOutput,
    });
  }

  const calculatedFallbackHash = rawBrandThemeSha256(safeFallback.rawTheme);
  if (calculatedFallbackHash !== safeFallback.rawBrandThemeSha256) {
    throw new Error(
      `SAFE_FALLBACK_HASH_MISMATCH: expected ${safeFallback.rawBrandThemeSha256}, received ${calculatedFallbackHash}`,
    );
  }
  const fallback = deriveTheme(safeFallback.rawTheme);
  const fallbackValidation = validateThemeDerivation(fallback);
  if (!fallbackValidation.safe) {
    throw new Error(
      `UNSAFE_FALLBACK_THEME: ${fallbackValidation.errors.join(" | ")}`,
    );
  }

  return finalizeResolveResult({
    status: mode === "activation" ? "rejected" : "fallback",
    reason,
    mode,
    integrity,
    algorithm: `${ALGORITHM_ID}@${ALGORITHM_VERSION}`,
    requestedRawBrandThemeSha256,
    effectiveRawBrandThemeSha256: calculatedFallbackHash,
    fallbackSource: safeFallback.source,
    candidateDiagnostics: candidate.diagnostics,
    candidateValidationErrors: candidateValidation.errors,
    effectiveDiagnostics: fallback.diagnostics,
    semanticOutput: fallback.semanticOutput,
  });
}

function canonicalAppearanceContext(context) {
  const canonical = {};
  for (const field of APPEARANCE_CONTEXT_FIELDS)
    canonical[field] = context?.[field];
  return canonical;
}

export function appearanceContextSha256(context) {
  return sha256(stableStringify(canonicalAppearanceContext(context)));
}

function validateAppearanceContext(context) {
  const errors = [];
  if (
    typeof context?.host !== "string" ||
    context.host !== context.host.toLowerCase() ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(context.host)
  ) {
    errors.push(
      "host must be a canonical lowercase hostname without scheme, port or path",
    );
  }
  if (
    typeof context?.tenantId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      context.tenantId,
    )
  ) {
    errors.push("tenantId must be a lowercase RFC 4122 UUID");
  }
  if (
    !Number.isSafeInteger(context?.themeRevision) ||
    context.themeRevision < 0
  ) {
    errors.push("themeRevision must be a non-negative safe integer");
  }
  if (
    !new Set(["starter", "professional", "enterprise"]).has(
      context?.entitlement,
    )
  ) {
    errors.push("entitlement must be starter, professional or enterprise");
  }
  for (const field of [
    "canUseCustomBranding",
    "tenantThemeOverrideEnabled",
    "whiteLabelPresentationEnabled",
  ]) {
    if (typeof context?.[field] !== "boolean")
      errors.push(`${field} must be boolean`);
  }
  if (
    context?.canUseCustomBranding !==
    (context?.entitlement === "enterprise")
  ) {
    errors.push(
      "canUseCustomBranding must equal the Enterprise entitlement decision",
    );
  }
  if (context?.tenantThemeOverrideEnabled && !context?.canUseCustomBranding) {
    errors.push("tenantThemeOverrideEnabled requires canUseCustomBranding");
  }
  if (
    context?.whiteLabelPresentationEnabled &&
    !context?.canUseCustomBranding
  ) {
    errors.push("whiteLabelPresentationEnabled requires canUseCustomBranding");
  }
  return errors;
}

function canonicalAssetModes(assetModes) {
  const canonical = {};
  for (const kind of APPEARANCE_ASSET_KINDS)
    canonical[kind] = assetModes?.[kind];
  return canonical;
}

export function appearanceAssetModesSha256(assetModes) {
  return sha256(stableStringify(canonicalAssetModes(assetModes)));
}

function validateAssetModes(assetModes, rawTheme) {
  const errors = [];
  for (const kind of APPEARANCE_ASSET_KINDS) {
    const mode = assetModes?.[kind];
    if (!APPEARANCE_ASSET_MODES.includes(mode)) {
      errors.push(`${kind} mode must be inherit, asset or none`);
      continue;
    }
    const storagePath = rawTheme?.[`${kind}StoragePath`];
    if (
      mode === "asset" &&
      (typeof storagePath !== "string" || storagePath.trim() === "")
    ) {
      errors.push(`${kind} asset mode requires a server-owned storagePath`);
    }
  }
  return errors;
}

function resolvedAsset(rawTheme, kind, mode) {
  if (mode === "none") return { mode, url: null, storagePath: null };
  return {
    mode,
    url: rawTheme[`${kind}Url`],
    storagePath: rawTheme[`${kind}StoragePath`],
  };
}

function appearanceIdentity(rawTheme, context, assetModes) {
  return {
    brandName: rawTheme.brandName,
    platformAttributionName: context.whiteLabelPresentationEnabled
      ? null
      : rawTheme.platformName,
    logo: resolvedAsset(rawTheme, "logo", assetModes.logo),
    favicon: resolvedAsset(rawTheme, "favicon", assetModes.favicon),
    splash: resolvedAsset(rawTheme, "splash", assetModes.splash),
  };
}

function appearanceCommunication(rawTheme) {
  return {
    emailFooterText: rawTheme.emailFooterText,
    emailSignature: rawTheme.emailSignature,
  };
}

/**
 * Production activation boundary for the complete tenant appearance. Unlike
 * resolveTheme(), this result binds identity, assets, e-mail presentation and
 * semantic tokens to one trusted host/tenant/revision/entitlement context.
 */
export function resolveAppearance(
  rawTheme,
  {
    mode = "runtime",
    trustedContext,
    snapshotContext = trustedContext,
    expectedContextSha256 = appearanceContextSha256(trustedContext),
    expectedRawBrandThemeSha256,
    assetModes,
    expectedAssetModesSha256,
    safeFallback = {
      rawTheme: SAFE_PLATFORM_FALLBACK_RAW_THEME,
      rawBrandThemeSha256: SAFE_PLATFORM_FALLBACK_RAW_SHA256,
      assetModes: SAFE_PLATFORM_FALLBACK_ASSET_MODES,
      source: "fieldgrid-code-platform-fallback",
    },
  } = {},
) {
  const trustedContextErrors = validateAppearanceContext(trustedContext);
  if (trustedContextErrors.length > 0) {
    throw new TypeError(
      `INVALID_TRUSTED_APPEARANCE_CONTEXT: ${trustedContextErrors.join(" | ")}`,
    );
  }
  const trustedContextHash = appearanceContextSha256(trustedContext);
  if (trustedContextHash !== expectedContextSha256) {
    throw new Error(
      `TRUSTED_APPEARANCE_CONTEXT_HASH_MISMATCH: expected ${expectedContextSha256}, received ${trustedContextHash}`,
    );
  }

  const snapshotContextErrors = validateAppearanceContext(snapshotContext);
  const snapshotContextHash =
    snapshotContextErrors.length === 0
      ? appearanceContextSha256(snapshotContext)
      : null;
  const assetModeErrors = validateAssetModes(assetModes, rawTheme);
  const suppliedRawHashIsValid =
    typeof expectedRawBrandThemeSha256 === "string" &&
    /^[0-9a-f]{64}$/u.test(expectedRawBrandThemeSha256);
  const suppliedAssetModeHashIsValid =
    typeof expectedAssetModesSha256 === "string" &&
    /^[0-9a-f]{64}$/u.test(expectedAssetModesSha256);
  const rawHashMatches =
    suppliedRawHashIsValid &&
    rawBrandThemeSha256(rawTheme) === expectedRawBrandThemeSha256;
  const assetModesHash = appearanceAssetModesSha256(assetModes);
  const assetModesHashMatches =
    suppliedAssetModeHashIsValid && assetModesHash === expectedAssetModesSha256;
  const integrity =
    snapshotContextErrors.length === 0 &&
    snapshotContextHash === trustedContextHash &&
    rawHashMatches &&
    assetModeErrors.length === 0 &&
    assetModesHashMatches
      ? "valid"
      : "hash-mismatch";
  const themeResult = resolveTheme(rawTheme, { mode, integrity, safeFallback });
  const effectiveRawTheme =
    themeResult.status === "resolved" ? rawTheme : safeFallback.rawTheme;
  const effectiveAssetModes =
    themeResult.status === "resolved" ? assetModes : safeFallback.assetModes;
  const fallbackAssetModeErrors = validateAssetModes(
    effectiveAssetModes,
    effectiveRawTheme,
  );
  if (fallbackAssetModeErrors.length > 0) {
    throw new Error(
      `UNSAFE_FALLBACK_ASSET_MODES: ${fallbackAssetModeErrors.join(" | ")}`,
    );
  }
  const context = canonicalAppearanceContext(trustedContext);
  const appearance = {
    context,
    contextSha256: trustedContextHash,
    rawBrandThemeSha256: themeResult.effectiveRawBrandThemeSha256,
    assetModesSha256: appearanceAssetModesSha256(effectiveAssetModes),
    identity: appearanceIdentity(
      effectiveRawTheme,
      context,
      effectiveAssetModes,
    ),
    communication: appearanceCommunication(effectiveRawTheme),
    semanticOutput: themeResult.semanticOutput,
  };
  const appearanceSha256 = sha256(stableStringify(appearance));
  const { resultSha256: semanticResultSha256, ...themePayload } = themeResult;
  const result = {
    ...themePayload,
    semanticResultSha256,
    requestedContextSha256: snapshotContextHash,
    effectiveContextSha256: trustedContextHash,
    contextValidationErrors: snapshotContextErrors,
    assetModeValidationErrors: assetModeErrors,
    appearance,
    appearanceSha256,
  };
  return {
    ...result,
    resultSha256: sha256(stableStringify(result)),
  };
}

export function summarizeResolveResult(result) {
  return {
    status: result.status,
    reason: result.reason,
    mode: result.mode,
    integrity: result.integrity,
    algorithm: result.algorithm,
    requestedRawBrandThemeSha256: result.requestedRawBrandThemeSha256,
    effectiveRawBrandThemeSha256: result.effectiveRawBrandThemeSha256,
    fallbackSource: result.fallbackSource,
    candidateValidationErrors: result.candidateValidationErrors,
    candidateDiagnosticsCount: result.candidateDiagnostics.length,
    candidateDiagnosticsSha256: sha256(
      stableStringify(result.candidateDiagnostics),
    ),
    effectiveDiagnosticsCount: result.effectiveDiagnostics.length,
    effectiveDiagnosticsSha256: sha256(
      stableStringify(result.effectiveDiagnostics),
    ),
    effectiveSemanticOutputSha256: result.effectiveSemanticOutputSha256,
    effectiveResolutionSha256: result.effectiveResolutionSha256,
    resultSha256: result.resultSha256,
  };
}

/**
 * Keeps the approved Fieldflow reference pixels authoritative while adding new
 * state tokens from the algorithm. This policy is legal only for fixture
 * `default`; runtime tenant themes always publish the complete output of
 * resolveAppearance(), whose semanticOutput is produced by the internal
 * resolver without applying this authored fixture exception.
 */
export function applyAuthoredCanonicalPixelValues(
  algorithmicOutput,
  canonicalColors,
) {
  const accentStrong = canonicalColors.brandAccent;
  const accentHover = mixHex(accentStrong, "#000000", 88);
  const accentPressed = mixHex(accentStrong, "#000000", 76);
  const selection = canonicalColors.accent;
  const selectionHover = mixHex(accentStrong, canonicalColors.panel, 18);
  const selectionBorder = canonicalColors.brandAccent;
  const selectionHoverBorder = correctBoundary(
    selectionBorder,
    [selectionHover, canonicalColors.panel],
    "canonical selection-border hover",
    [],
  );

  const output = {
    ...algorithmicOutput,
    rootBackground: canonicalColors.background,
    canvas: canonicalColors.appBackground,
    surface: canonicalColors.panel,
    surfaceSubtle: canonicalColors.panelSecondary,
    surfaceElevated: canonicalColors.card,
    foreground: canonicalColors.foreground,
    text: canonicalColors.text,
    textMuted: canonicalColors.mutedText,
    mutedSurface: canonicalColors.muted,
    primary: canonicalColors.primary,
    textOnPrimary: canonicalColors.primaryForeground,
    textOnPrimaryHover: chooseForeground(
      canonicalColors.primaryForeground,
      [algorithmicOutput.primaryHover],
      "canonical text-on-primary-hover",
      [],
    ),
    textOnPrimaryPressed: chooseForeground(
      canonicalColors.primaryForeground,
      [algorithmicOutput.primaryPressed],
      "canonical text-on-primary-pressed",
      [],
    ),
    secondarySoft: canonicalColors.secondary,
    textOnSecondary: canonicalColors.secondaryForeground,
    accentStrong,
    accentHover,
    accentPressed,
    accentSoft: canonicalColors.accent,
    textOnAccent: chooseForeground(
      "#FFFFFF",
      [accentStrong],
      "canonical text-on-accent",
      [],
    ),
    textOnAccentHover: chooseForeground(
      "#FFFFFF",
      [accentHover],
      "canonical text-on-accent-hover",
      [],
    ),
    textOnAccentPressed: chooseForeground(
      "#FFFFFF",
      [accentPressed],
      "canonical text-on-accent-pressed",
      [],
    ),
    textOnAccentSoft: canonicalColors.accentForeground,
    selection,
    selectionHover,
    selectionBorder,
    selectionHoverBorder,
    textOnSelection: canonicalColors.accentForeground,
    borderSubtle: canonicalColors.border,
    line: canonicalColors.line,
    borderControl: canonicalColors.input,
    focusRing: canonicalColors.ring,
    focusRingOffset: canonicalColors.panel,
    sidebarBackgroundStart: canonicalColors.sidebarBackgroundStart,
    sidebarBackgroundMid: canonicalColors.sidebarBackgroundMid,
    sidebarBackgroundEnd: canonicalColors.sidebarBackgroundEnd,
    sidebarText: canonicalColors.sidebarText,
    sidebarMuted: canonicalColors.sidebarMuted,
    sidebarActiveBackground: CANONICAL_PROTOTYPE_ACTIVE_NAV.background,
    sidebarActiveHover: CANONICAL_PROTOTYPE_ACTIVE_NAV.hoverBackground,
    sidebarActiveText: CANONICAL_PROTOTYPE_ACTIVE_NAV.text,
    sidebarActiveHoverText: CANONICAL_PROTOTYPE_ACTIVE_NAV.hoverText,
    sidebarActiveIndicator: CANONICAL_PROTOTYPE_ACTIVE_NAV.indicator,
    sidebarActiveIndicatorHover: CANONICAL_PROTOTYPE_ACTIVE_NAV.hoverIndicator,
  };
  Object.assign(output, deriveNativeRuntimeChrome(output.canvas));
  return output;
}

function equal(first, second) {
  return stableStringify(first) === stableStringify(second);
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

async function materializeManifest(manifest) {
  const canonicalTokenManifest = await readJson(
    new URL("../manifests/fieldflow-tokens.json", import.meta.url),
  );
  const safeFallbackDerivation = deriveTheme(SAFE_PLATFORM_FALLBACK_RAW_THEME);
  const safeFallbackValidation = validateThemeDerivation(
    safeFallbackDerivation,
  );
  if (!safeFallbackValidation.safe) {
    throw new Error(
      `Reference safe platform fallback is unsafe: ${safeFallbackValidation.errors.join(" | ")}`,
    );
  }
  const materialized = {
    ...manifest,
    algorithm: ALGORITHM_CONTRACT,
    safePlatformFallback: {
      sourceAuthority:
        "lib/db/src/tenant-branding.ts#FIELDGRID_DEFAULT_BRAND_THEME",
      rawBrandTheme: SAFE_PLATFORM_FALLBACK_RAW_THEME,
      rawBrandThemeSha256: SAFE_PLATFORM_FALLBACK_RAW_SHA256,
      expectedSemanticOutputSha256: sha256(
        stableStringify(safeFallbackDerivation.semanticOutput),
      ),
      expectedResolutionSha256: semanticResolutionSha256(
        safeFallbackDerivation.semanticOutput,
        safeFallbackDerivation.diagnostics,
      ),
      expectedDiagnostics: safeFallbackDerivation.diagnostics,
    },
    fixtures: manifest.fixtures.map((fixture) => {
      const result = expectedFixtureResolution(fixture, canonicalTokenManifest);
      const expectedSemanticOutput = result.semanticOutput;
      const expectedDiagnostics = result.effectiveDiagnostics;
      return {
        id: fixture.id,
        purpose: fixture.purpose,
        outputMode: fixture.outputMode,
        rawBrandTheme: fixture.rawBrandTheme,
        rawBrandThemeSha256: rawBrandThemeSha256(fixture.rawBrandTheme),
        expectedResolveResult: summarizeResolveResult(result),
        expectedSemanticOutput,
        expectedDiagnostics,
        expectedSemanticOutputSha256: sha256(
          stableStringify(expectedSemanticOutput),
        ),
        expectedResolutionSha256: semanticResolutionSha256(
          expectedSemanticOutput,
          expectedDiagnostics,
        ),
      };
    }),
  };
  return materialized;
}

function expectedFixtureResolution(fixture, canonicalTokenManifest) {
  const derived = deriveTheme(fixture.rawBrandTheme);
  if (fixture.outputMode === "authored-pixel-fixture") {
    return finalizeResolveResult({
      status: "authored-pixel-fixture",
      reason: null,
      mode: "visual-ci",
      integrity: "pinned",
      algorithm: `${ALGORITHM_ID}@${ALGORITHM_VERSION}`,
      requestedRawBrandThemeSha256: rawBrandThemeSha256(fixture.rawBrandTheme),
      effectiveRawBrandThemeSha256: rawBrandThemeSha256(fixture.rawBrandTheme),
      fallbackSource: null,
      candidateDiagnostics: derived.diagnostics,
      candidateValidationErrors: [],
      effectiveDiagnostics: [],
      semanticOutput: applyAuthoredCanonicalPixelValues(
        derived.semanticOutput,
        canonicalTokenManifest.colors.canonical,
      ),
    });
  }
  return resolveTheme(fixture.rawBrandTheme, { mode: "runtime" });
}

export async function verifyManifest(manifest) {
  const errors = [];
  if (!equal(manifest.algorithm, ALGORITHM_CONTRACT)) {
    errors.push("algorithm contract differs from the reference implementation");
  }
  const canonicalTokenManifest = await readJson(
    new URL("../manifests/fieldflow-tokens.json", import.meta.url),
  );
  const fallbackHash = rawBrandThemeSha256(SAFE_PLATFORM_FALLBACK_RAW_THEME);
  const fallbackDerivation = deriveTheme(SAFE_PLATFORM_FALLBACK_RAW_THEME);
  const fallbackValidation = validateThemeDerivation(fallbackDerivation);
  if (fallbackHash !== SAFE_PLATFORM_FALLBACK_RAW_SHA256) {
    errors.push("reference safe platform fallback constant hash is invalid");
  }
  if (!fallbackValidation.safe) {
    errors.push(
      `reference safe platform fallback is unsafe: ${fallbackValidation.errors.join(" | ")}`,
    );
  }
  if (
    !equal(
      manifest.safePlatformFallback?.rawBrandTheme,
      SAFE_PLATFORM_FALLBACK_RAW_THEME,
    ) ||
    manifest.safePlatformFallback?.rawBrandThemeSha256 !==
      SAFE_PLATFORM_FALLBACK_RAW_SHA256
  ) {
    errors.push(
      "safePlatformFallback raw snapshot/hash differs from the reference",
    );
  }
  if (
    manifest.safePlatformFallback?.expectedSemanticOutputSha256 !==
    sha256(stableStringify(fallbackDerivation.semanticOutput))
  ) {
    errors.push("safePlatformFallback semantic hash mismatch");
  }
  if (
    manifest.safePlatformFallback?.expectedResolutionSha256 !==
    semanticResolutionSha256(
      fallbackDerivation.semanticOutput,
      fallbackDerivation.diagnostics,
    )
  ) {
    errors.push("safePlatformFallback resolution hash mismatch");
  }
  if (
    !equal(
      manifest.safePlatformFallback?.expectedDiagnostics,
      fallbackDerivation.diagnostics,
    )
  ) {
    errors.push("safePlatformFallback diagnostics mismatch");
  }
  const canonicalRaw =
    canonicalTokenManifest.canonicalVisualFixture.rawBrandTheme;
  const canonicalFixture = manifest.fixtures.find(
    (fixture) => fixture.id === "default",
  );
  if (!canonicalFixture) {
    errors.push("missing required fixture: default");
  } else {
    if (!equal(canonicalFixture.rawBrandTheme, canonicalRaw)) {
      errors.push(
        "default rawBrandTheme differs from fieldflow-tokens canonicalVisualFixture",
      );
    }
    if (
      rawBrandThemeSha256(canonicalFixture.rawBrandTheme) !==
      CANONICAL_FIXTURE_RAW_SHA256
    ) {
      errors.push(
        "default rawBrandTheme no longer has the immutable canonical hash",
      );
    }
    if (canonicalFixture.outputMode !== "authored-pixel-fixture") {
      errors.push("default must use outputMode authored-pixel-fixture");
    }
    const activeNav = canonicalFixture.expectedSemanticOutput;
    const expectedActiveNav = {
      background: activeNav.sidebarActiveBackground,
      hoverBackground: activeNav.sidebarActiveHover,
      text: activeNav.sidebarActiveText,
      hoverText: activeNav.sidebarActiveHoverText,
      indicator: activeNav.sidebarActiveIndicator,
      hoverIndicator: activeNav.sidebarActiveIndicatorHover,
    };
    if (!equal(expectedActiveNav, CANONICAL_PROTOTYPE_ACTIVE_NAV)) {
      errors.push(
        "default active navigation differs from pinned prototype CSS",
      );
    }
    const canonicalSemantic = canonicalFixture.expectedSemanticOutput;
    const requiredCanonicalSeparation = {
      foreground: canonicalTokenManifest.colors.canonical.foreground,
      text: canonicalTokenManifest.colors.canonical.text,
      mutedSurface: canonicalTokenManifest.colors.canonical.muted,
      secondarySoft: canonicalTokenManifest.colors.canonical.secondary,
      line: canonicalTokenManifest.colors.canonical.line,
      borderSubtle: canonicalTokenManifest.colors.canonical.border,
    };
    if (
      !equal(
        Object.fromEntries(
          Object.keys(requiredCanonicalSeparation).map((key) => [
            key,
            canonicalSemantic[key],
          ]),
        ),
        requiredCanonicalSeparation,
      ) ||
      canonicalSemantic.foreground === canonicalSemantic.text ||
      canonicalSemantic.mutedSurface === canonicalSemantic.secondarySoft ||
      canonicalSemantic.line === canonicalSemantic.borderSubtle
    ) {
      errors.push(
        "default collapses authored foreground/text, mutedSurface/secondarySoft or line/borderSubtle",
      );
    }
    const requiredBridge = {
      "--foreground": "foreground",
      "--card-foreground": "foreground",
      "--popover-foreground": "foreground",
      "--muted": "mutedSurface",
      "--line": "line",
    };
    for (const [variable, token] of Object.entries(requiredBridge)) {
      if (manifest.canonicalBridgeMapping?.[variable] !== token) {
        errors.push(`canonicalBridgeMapping ${variable} must map to ${token}`);
      }
    }
    if (
      !equal(
        manifest.canonicalPrototypeEvidence?.expected,
        CANONICAL_PROTOTYPE_ACTIVE_NAV,
      )
    ) {
      errors.push(
        "canonicalPrototypeEvidence.expected differs from pinned prototype CSS contract",
      );
    }
  }

  const ids = new Set();
  for (const fixture of manifest.fixtures) {
    if (ids.has(fixture.id)) errors.push(`duplicate fixture id: ${fixture.id}`);
    ids.add(fixture.id);
    const rawHash = rawBrandThemeSha256(fixture.rawBrandTheme);
    if (fixture.rawBrandThemeSha256 !== rawHash) {
      errors.push(
        `${fixture.id}: rawBrandThemeSha256 mismatch; expected ${rawHash}`,
      );
    }

    const result = expectedFixtureResolution(fixture, canonicalTokenManifest);
    const expectedOutput = result.semanticOutput;
    const expectedDiagnostics = result.effectiveDiagnostics;
    const expectedResolveResult = summarizeResolveResult(result);
    const expectedStatus =
      fixture.outputMode === "authored-pixel-fixture"
        ? "authored-pixel-fixture"
        : fixture.outputMode === "runtime-fallback"
          ? "fallback"
          : "resolved";
    if (result.status !== expectedStatus) {
      errors.push(
        `${fixture.id}: outputMode ${fixture.outputMode} requires resolve status ${expectedStatus}, received ${result.status}`,
      );
    }
    if (!equal(fixture.expectedResolveResult, expectedResolveResult)) {
      errors.push(
        `${fixture.id}: expectedResolveResult does not match fail-closed resolution`,
      );
    }
    if (fixture.outputMode === "runtime-fallback") {
      if (
        result.effectiveRawBrandThemeSha256 !==
          SAFE_PLATFORM_FALLBACK_RAW_SHA256 ||
        !equal(result.semanticOutput, fallbackDerivation.semanticOutput) ||
        result.reason === null ||
        result.candidateValidationErrors.length === 0
      ) {
        errors.push(
          `${fixture.id}: fallback must atomically equal the hashed safe platform snapshot and retain candidate failure evidence`,
        );
      }
    }
    if (!equal(fixture.expectedSemanticOutput, expectedOutput)) {
      errors.push(
        `${fixture.id}: expectedSemanticOutput does not match its output policy`,
      );
    }
    if (!equal(fixture.expectedDiagnostics, expectedDiagnostics)) {
      errors.push(
        `${fixture.id}: expectedDiagnostics does not match its output policy`,
      );
    }
    if (
      fixture.expectedDiagnostics.some(
        (diagnostic) => diagnostic.thresholdMet === false,
      )
    ) {
      errors.push(
        `${fixture.id}: expectedDiagnostics contains thresholdMet=false`,
      );
    }
    for (const error of semanticContrastErrors(
      fixture.expectedSemanticOutput,
    )) {
      errors.push(`${fixture.id}: ${error}`);
    }
    const semanticHash = sha256(
      stableStringify(fixture.expectedSemanticOutput),
    );
    if (fixture.expectedSemanticOutputSha256 !== semanticHash) {
      errors.push(
        `${fixture.id}: expectedSemanticOutputSha256 mismatch; expected ${semanticHash}`,
      );
    }
    const resolutionHash = semanticResolutionSha256(
      fixture.expectedSemanticOutput,
      fixture.expectedDiagnostics,
    );
    if (fixture.expectedResolutionSha256 !== resolutionHash) {
      errors.push(
        `${fixture.id}: expectedResolutionSha256 mismatch; expected ${resolutionHash}`,
      );
    }
  }

  const required = [
    "default",
    "light",
    "dark",
    "red",
    "yellow",
    "monochrome",
    "low-contrast",
    "black-canvas-white-surface",
    "white-canvas-black-surface",
  ];
  if (manifest.fixtures.length !== required.length) {
    errors.push(
      `fixture count must be exactly ${required.length}; received ${manifest.fixtures.length}`,
    );
  }
  for (const id of required)
    if (!ids.has(id)) errors.push(`missing required fixture: ${id}`);
  return errors;
}

async function cli() {
  const manifestUrl = new URL(
    "../manifests/theme-derivation.json",
    import.meta.url,
  );
  const manifest = await readJson(manifestUrl);
  const command = process.argv[2] ?? "--check";
  if (command === "--emit") {
    process.stdout.write(
      `${JSON.stringify(await materializeManifest(manifest), null, 2)}\n`,
    );
    return;
  }
  if (command === "--print") {
    const id = process.argv[3];
    const fixture = manifest.fixtures.find((candidate) => candidate.id === id);
    if (!fixture) throw new Error(`Unknown fixture: ${id}`);
    process.stdout.write(
      `${JSON.stringify(deriveTheme(fixture.rawBrandTheme), null, 2)}\n`,
    );
    return;
  }
  if (command !== "--check") throw new Error(`Unknown command: ${command}`);

  const errors = await verifyManifest(manifest);
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`ERROR ${error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `OK ${ALGORITHM_ID}@${ALGORITHM_VERSION}: ${manifest.fixtures.length} fixtures and hashes verified\n`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  cli().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
