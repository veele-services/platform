import { describe, expect, it } from "vitest";
import { brandThemeStyle, contrastRatio, createBrandPalette } from "./palette";

describe("derived brand palettes", () => {
  const seeds = [
    ["#222C35", "#41AC42"], ["#315794", "#52B3B7"], ["#214E72", "#C65D21"],
    ["#FFFFFF", "#FFFFFF"], ["#000000", "#000000"], ["#FFFF00", "#00FF00"],
    ["#FF00FF", "#00FFFF"], ["#FF0000", "#0000FF"], ["#FFF5ED", "#FFF0FA"],
  ];

  it("preserves brand seeds and derives distinct UI tones without mutating settings", () => {
    const palette = createBrandPalette("#315794", "#52B3B7");
    expect(palette.primary).toBe("#315794");
    expect(palette.accent).toBe("#52b3b7");
    expect(palette.sidebar).not.toBe(palette.primary);
    expect(palette.sidebarActive).not.toBe(palette.accent);
    expect(palette.heroStart).not.toBe(palette.heroEnd);
    expect(palette.action).not.toBe(palette.accent);
    expect(createBrandPalette("#315794", "#52B3B7")).toEqual(palette);
  });

  it.each(seeds)("keeps text and focus readable with %s / %s", (primary, accent) => {
    const p = createBrandPalette(primary, accent);
    for (const [text, background] of [
      [p.ink, p.canvas], [p.ink, p.surface], [p.muted, p.canvas],
      [p.accentText, p.accentSoft], [p.accentText, "#ffffff"],
      [p.actionForeground, p.action], [p.actionForeground, p.actionHover],
      [p.sidebarText, p.sidebar], [p.sidebarText, p.sidebarActive],
      [p.sidebarMuted, p.sidebar], [p.sidebarHighlight, p.sidebarActive],
      [p.heroForeground, p.heroStart], [p.heroForeground, p.heroEnd],
      [p.heroMuted, p.heroStart], [p.heroMuted, p.heroEnd],
      [p.heroAccent, p.heroStart], [p.heroAccent, p.heroEnd],
    ]) expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.focus, "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(p.focus, p.canvas)).toBeGreaterThanOrEqual(3);
    for (const color of Object.values(p)) expect(color).toMatch(/^#[a-f0-9]{6}$/);
  });

  it("safely previews incomplete hex input using Fieldgrid defaults", () => {
    expect(createBrandPalette("#12", "url(https://invalid.test)")).toEqual(createBrandPalette());
    expect(createBrandPalette(null, undefined)).toEqual(createBrandPalette());
  });

  it("shares semantic tokens across dashboards and previews, without leaking tenant colours into defaults", () => {
    const defaults = brandThemeStyle();
    const tenant = brandThemeStyle("#315794", "#52B3B7") as Record<string, string>;
    expect(tenant["--tenant-primary"]).toBe("#315794");
    expect(tenant["--brand-sidebar"]).toBe(createBrandPalette("#315794", "#52B3B7").sidebar);
    expect(tenant["--brand-action-foreground"]).toBe("#ffffff");
    expect(defaults).toEqual(brandThemeStyle());
    expect(defaults).not.toEqual(tenant);
  });
});
