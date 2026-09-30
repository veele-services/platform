import Link from "next/link";
import { redirect } from "next/navigation";
import { getObjectActor } from "@/lib/objects/auth";
import { brandThemeStyle } from "@/lib/branding/palette";
import { FieldgridBrand } from "@/components/fieldgrid/brand";
import { commercialDate, money } from "@/lib/commercial/model";
type PortalData = {
  documents: Array<{
    id: string;
    title: string;
    version: number;
    category: string;
    date: string | null;
    validUntil: string | null;
  }>;
  reports: Array<{
    id: string;
    body: string;
    at: string;
    orderId: string;
    number: string;
    object: string;
  }>;
  invoices: Array<{
    id: string;
    number: string;
    date: string;
    due: string;
    total: number;
    paid: number;
    status: string;
    pdf: boolean;
  }>;
};
export default async function CustomerDocuments() {
  const actor = await getObjectActor().catch(() => null);
  if (!actor) redirect("/login?next=/klant/documenten");
  const { db, admin, tenant } = actor;
  const [r, b] = await Promise.all([
    db.rpc("customer_portal_documents", { target_tenant: tenant.id }),
    admin
      .from("tenant_branding")
      .select("primary_color,accent_color,logo_path")
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
  ]);
  if (r.error)
    throw new Error("Je documenten zijn tijdelijk niet beschikbaar.");
  const data = r.data as unknown as PortalData,
    brand = b.data;
  return (
    <main
      className="object-portal"
      style={brandThemeStyle(brand?.primary_color, brand?.accent_color)}
    >
      <div className="object-portal-brand">
        <FieldgridBrand
          tenantName={tenant.name}
          logoUrl={
            brand?.logo_path ? `/api/branding/${tenant.id}/email-logo` : null
          }
        />
        <Link href="/klant" className="secondary-button">
          Mijn afspraken
        </Link>
      </div>
      <div className="object-dossier">
        <header>
          <h1>Mijn documenten & facturen</h1>
          <p>
            Alleen gedeelde informatie voor de objecten waaraan je account is
            gekoppeld.
          </p>
          <Link href="/klant/aanvragen" className="text-link">
            Mijn aanvragen en offertes →
          </Link>
        </header>
        <section className="dossier-card">
          <h2>Gedeelde documenten</h2>
          {data.documents.map((d) => (
            <article className="dossier-event" key={d.id}>
              <div>
                <strong>{d.title}</strong>
                <small>
                  Versie {d.version} · {commercialDate(d.date, tenant.timezone)}
                </small>
              </div>
              <a
                className="resource-action"
                href={`/api/customer-files/document/${d.id}`}
              >
                Download
              </a>
            </article>
          ))}
          {!data.documents.length && <p>Nog geen documenten met je gedeeld.</p>}
        </section>
        <section className="dossier-card">
          <h2>Gedeelde rapporten</h2>
          {data.reports.map((r) => (
            <article className="object-record" key={r.id}>
              <h3>
                {r.number} · {r.object}
              </h3>
              <p className="object-prose">{r.body}</p>
              <small>{commercialDate(r.at, tenant.timezone)}</small>
            </article>
          ))}
          {!data.reports.length && (
            <p>Nog geen goedgekeurde rapporten met je gedeeld.</p>
          )}
        </section>
        <section className="dossier-card">
          <h2>Facturen & betalingen</h2>
          <div className="table-scroll">
            <table className="resource-table">
              <thead>
                <tr>
                  <th>Factuur</th>
                  <th>Datum / vervalt</th>
                  <th>Totaal</th>
                  <th>Betaald</th>
                  <th>Status</th>
                  <th>Document</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((i) => (
                  <tr key={i.id}>
                    <td>{i.number}</td>
                    <td>
                      {commercialDate(i.date, tenant.timezone)}
                      <small>{commercialDate(i.due, tenant.timezone)}</small>
                    </td>
                    <td>{money(i.total)}</td>
                    <td>{money(i.paid)}</td>
                    <td>
                      {{
                        sent: "Openstaand",
                        partially_paid: "Deels betaald",
                        paid: "Betaald",
                        overdue: "Te laat",
                        credited: "Gecrediteerd",
                      }[i.status] || "Openstaand"}
                    </td>
                    <td>
                      {i.pdf ? (
                        <a
                          className="resource-action"
                          href={`/api/customer-files/invoice/${i.id}`}
                        >
                          Download PDF
                        </a>
                      ) : (
                        "PDF nog niet beschikbaar"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.invoices.length && (
            <p>
              Geen toegankelijke facturen. Een factuur met meerdere objecten is
              alleen zichtbaar als je toegang tot al die objecten hebt.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
