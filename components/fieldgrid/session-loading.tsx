"use client";

import { brandThemeStyle } from "@/lib/branding/palette";
import { FieldgridBrand, ProductBrand } from "./brand";

export type SessionLoadingBrand = {
  name: string;
  logoUrl: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
};

/** Public tenant branding only; protected workspace content stays fenced. */
export function SessionLoading({ brand, unavailable = false, onRetry }: {
  brand?: SessionLoadingBrand | null;
  unavailable?: boolean;
  onRetry: () => void;
}) {
  return <div className="session-loading" style={brandThemeStyle(brand?.primaryColor, brand?.accentColor)}>
    <div className="session-loading-brand">
      {brand ? <FieldgridBrand tenantName={brand.name} logoUrl={brand.logoUrl}/> : <ProductBrand/>}
    </div>
    {unavailable ? <div className="session-loading-recovery" role="alert">
      <p>Verbinding tijdelijk niet beschikbaar.</p>
      <div><button type="button" onClick={onRetry}>Opnieuw proberen</button><a href="/login">Naar inloggen</a></div>
    </div> : <div className="session-loading-progress" role="progressbar" aria-label="Omgeving laden"><span/></div>}
  </div>;
}
