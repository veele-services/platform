"use client";

import { createContext, useContext, type ReactNode } from "react";
import { brandThemeStyle } from "@/lib/branding/palette";
import { FieldgridBrand, ProductBrand } from "./brand";

export type SessionLoadingBrand = {
  name: string;
  logoUrl: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
};

const SessionBrandContext = createContext<SessionLoadingBrand | null>(null);

/** Reuse the host-resolved public brand for immediate route loading states. */
export function SessionBrandProvider({ brand, children }: { brand: SessionLoadingBrand | null; children: ReactNode }) {
  return <SessionBrandContext.Provider value={brand}>{children}</SessionBrandContext.Provider>;
}

export function RouteLoading({ label = "Omgeving laden", compact = false }: { label?: string; compact?: boolean }) {
  const brand = useContext(SessionBrandContext);
  return <div className={`route-loading${compact ? " route-loading-compact" : ""}`} aria-busy="true">
    <SessionLoading brand={brand} label={label}/>
  </div>;
}

/** Public tenant branding only; protected workspace content stays fenced. */
export function SessionLoading({ brand, unavailable = false, onRetry, label = "Omgeving laden" }: {
  brand?: SessionLoadingBrand | null;
  unavailable?: boolean;
  onRetry?: () => void;
  label?: string;
}) {
  return <div className="session-loading" style={brandThemeStyle(brand?.primaryColor, brand?.accentColor)}>
    <div className="session-loading-brand">
      {brand ? <FieldgridBrand tenantName={brand.name} logoUrl={brand.logoUrl}/> : <ProductBrand/>}
    </div>
    {unavailable ? <div className="session-loading-recovery" role="alert">
      <p>Verbinding tijdelijk niet beschikbaar.</p>
      <div><button type="button" onClick={onRetry}>Opnieuw proberen</button><a href="/login">Naar inloggen</a></div>
    </div> : <div className="session-loading-progress" role="progressbar" aria-label={label}><span/></div>}
  </div>;
}
