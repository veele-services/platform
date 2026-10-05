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
          : <span className="brand-placeholder" aria-label="Tekstplaceholder voor tenantlogo">LOGO</span>}
    </span>
  );
}

export function ProductBrand() {
  return <span className="product-brand" aria-label="Fieldgrid">Fieldgrid</span>;
}
