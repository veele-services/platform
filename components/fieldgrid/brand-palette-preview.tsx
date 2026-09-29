import { createBrandPalette } from "@/lib/branding/palette";

export function BrandPalettePreview({ primary, accent }: { primary: string; accent: string }) {
  const palette = createBrandPalette(primary, accent);
  const swatches = [
    ["Navigatie", palette.sidebar], ["Tekst", palette.ink], ["Acties", palette.action],
    ["Zacht accent", palette.accentSoft], ["Randen", palette.border], ["Achtergrond", palette.canvas],
  ];
  return <section className="brand-palette-preview" aria-label="Afgeleid kleurenpalet">
    <strong>Van merkkleur naar schermkleur</strong>
    <p>Lichte en donkere varianten zorgen automatisch voor rust en leesbaarheid. Je hoeft alleen de twee merkkleuren te kiezen.</p>
    <div className="brand-palette-swatches">{swatches.map(([label, color]) => <div key={label}>
      <span style={{ backgroundColor: color }} aria-hidden="true"/><strong>{label}</strong><small>{color.toUpperCase()}</small>
    </div>)}</div>
  </section>;
}
