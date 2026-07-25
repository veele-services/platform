const HEX_COLOR_PATTERN = /^#([0-9a-f]{6})$/iu;

function relativeLuminance(color: string): number | null {
  const match = HEX_COLOR_PATTERN.exec(color.trim());
  if (!match) return null;

  const [red, green, blue] = [0, 2, 4]
    .map(
      (offset) =>
        Number.parseInt(match[1]!.slice(offset, offset + 2), 16) / 255,
    )
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

export function brandContrastRatio(
  foreground: string,
  background: string,
): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) return 1;

  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function accessibleBrandTextColor(
  background: string,
): "#081D3A" | "#FFFFFF" | "#000000" {
  const candidates = ["#081D3A", "#FFFFFF", "#000000"] as const;
  return candidates.reduce((best, candidate) =>
    brandContrastRatio(candidate, background) >
    brandContrastRatio(best, background)
      ? candidate
      : best,
  );
}

export function ensureAccessibleBrandTextColor(
  background: string,
  preferred: string,
  minimumRatio = 4.5,
): string {
  return brandContrastRatio(preferred, background) >= minimumRatio
    ? preferred
    : accessibleBrandTextColor(background);
}
