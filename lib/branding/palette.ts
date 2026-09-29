import type { CSSProperties } from "react";
import { FIELDGRID_PRIMARY, FIELDGRID_SECONDARY } from "../communications/templates";

const WHITE = "#ffffff";
const INK = "#152330";

function normalize(color: string | null | undefined, fallback: string): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback.toLowerCase();
}

function channels(hex: string): number[] {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}

/** Blend a brand seed into a neutral base, without introducing a different hue. */
function mix(color: string, base: string, weight: number): string {
  const target = channels(base);
  return `#${channels(color).map((channel, index) => Math.round(channel * weight + target[index] * (1 - weight)).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex: string): number {
  const [red, green, blue] = channels(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function contrastRatio(first: string, second: string): number {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function readable(color: string, background: string, minimum = 4.5): string {
  const target = contrastRatio(WHITE, background) > contrastRatio(INK, background) ? WHITE : INK;
  for (let step = 0; step <= 100; step++) {
    const candidate = mix(target, color, step / 100);
    if (contrastRatio(candidate, background) >= minimum) return candidate;
  }
  return target;
}

/** Raw seeds remain unchanged in storage; semantic UI tones are derived only. */
export function createBrandPalette(primaryColor?: string | null, accentColor?: string | null) {
  const primary = normalize(primaryColor, FIELDGRID_PRIMARY);
  const accent = normalize(accentColor, FIELDGRID_SECONDARY);
  const canvas = mix(primary, "#f5f7f9", 0.015);
  const surface = mix(primary, WHITE, 0.035);
  const accentSoft = mix(accent, WHITE, 0.09);
  const sidebar = mix(primary, "#19232d", 0.22);
  const sidebarEnd = mix(primary, "#101a24", 0.16);
  const sidebarActive = mix(accent, sidebar, 0.17);
  // Reserve contrast headroom for the hero's translucent decorative layers.
  const heroStart = readable(mix(primary, "#101d2b", 0.27), WHITE, 10);
  const heroEnd = readable(mix(accent, mix(primary, "#294455", 0.3), 0.14), WHITE, 10);
  const action = readable(mix(accent, "#354956", 0.85), WHITE, 4.6);
  return {
    primary, accent, canvas, surface, accentSoft,
    border: mix(primary, "#e2e8ed", 0.065),
    accentBorder: mix(accent, WHITE, 0.3),
    ink: readable(mix(primary, INK, 0.35), canvas, 7),
    muted: readable(mix(primary, "#657582", 0.12), canvas, 4.6),
    accentText: readable(accent, accentSoft, 4.6),
    action, actionHover: mix(action, INK, 0.86), actionForeground: WHITE,
    focus: readable(accent, canvas, 3.1),
    sidebar, sidebarEnd, sidebarActive,
    sidebarText: readable("#d8e2e9", sidebarActive, 7),
    sidebarMuted: readable("#a4b5c1", sidebar, 4.6),
    sidebarHighlight: readable(mix(accent, WHITE, 0.65), sidebarActive, 4.6),
    heroStart, heroEnd, heroForeground: WHITE,
    heroMuted: readable("#d3e0e7", heroEnd, 7),
    heroAccent: readable(mix(accent, WHITE, 0.55), heroEnd, 4.6),
    heroGlow: mix(accent, WHITE, 0.65),
  };
}

export function brandThemeStyle(primary?: string | null, accent?: string | null): CSSProperties {
  const palette = createBrandPalette(primary, accent);
  const tokens = Object.fromEntries(Object.entries(palette).map(([key, value]) => [
    `--brand-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, value,
  ]));
  return {
    ...tokens,
    // Compatibility seeds for unrelated document/email rendering. UI uses roles above.
    "--tenant-primary": palette.primary, "--tenant-accent": palette.accent,
    "--primary": palette.action, "--primary-foreground": palette.actionForeground,
    "--ring": palette.focus, "--foreground": palette.ink,
  } as CSSProperties;
}
