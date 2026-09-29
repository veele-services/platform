import Image from "next/image";

export function FieldgridBrand({ tenantName, logoUrl }: { tenantName?: string | null; logoUrl?: string | null }) {
  return (
    <span className="fieldgrid-brand">
      {logoUrl
        ? <span className="brand-logo-image"><Image src={logoUrl} alt={`Logo van ${tenantName ?? "tenant"}`} width={144} height={80} unoptimized/></span>
        : <span className="brand-placeholder" aria-label="Tekstplaceholder voor tenantlogo">LOGO</span>}
      <span className="brand-copy">
        {tenantName && <strong>{tenantName}</strong>}
        <small>Powered by Fieldgrid</small>
      </span>
    </span>
  );
}

export function ProductBrand() {
  return <span className="product-brand" aria-label="Fieldgrid">Fieldgrid</span>;
}
