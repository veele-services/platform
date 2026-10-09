"use client";

import Image from "next/image";
import { useState } from "react";

export function FieldgridBrand({ tenantName, logoUrl }: { tenantName?: string | null; logoUrl?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span className="fieldgrid-brand">
      {logoUrl && logoUrl !== failedUrl
        ? <span className="brand-logo-image"><Image src={logoUrl} alt={`Logo van ${tenantName ?? "tenant"}`} width={144} height={80} unoptimized onError={() => setFailedUrl(logoUrl)}/></span>
        : tenantName
          ? <span className="brand-name-fallback">{tenantName}</span>
          : <ProductBrand/>}
    </span>
  );
}

export function ProductBrand({ variant = "logo", tone = "default" }: { variant?: "logo" | "wordmark" | "icon"; tone?: "default" | "light" }) {
  const dimensions = variant === "logo" ? { width: 462, height: 146 } : variant === "wordmark" ? { width: 310, height: 100 } : { width: 140, height: 140 };
  return <span className={`product-brand product-brand-${variant}`}>
    <Image src={`/branding/fieldgrid-${variant}${tone === "light" ? "-light" : ""}.svg`} alt="Fieldgrid" {...dimensions} unoptimized/>
  </span>;
}
