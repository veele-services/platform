/* eslint-disable @next/next/no-img-element -- private/version-bound document logos must bypass the public image optimizer */
import {commercialDate,money,priceBases,workKinds,type QuoteSnapshot} from "@/lib/commercial/model";

export function QuoteDocument({snapshot:s,logoUrl,timezone="Europe/Amsterdam",attachmentHref}:{snapshot:QuoteSnapshot;logoUrl?:string|null;timezone?:string;attachmentHref?:(id:string)=>string}){
 if(!s.schema)return <div className="dossier-notice">Historische prijsopgave. De oorspronkelijke registratie blijft bewaard; voor een uitgebreide nieuwe aanbieding maak je een nieuwe versie.</div>;
 const address=(a:Record<string,unknown>)=>[a?.street,a?.postal_code,a?.city].filter(Boolean).join(", ");
 return <article className="commercial-document" aria-label="Offertevoorbeeld">
  <header style={{borderColor:s.brand.accent}}>{logoUrl?<img src={logoUrl} alt={s.brand.name} width={180} height={72}/>:<strong>{s.brand.name}</strong>}<div><span>OFFERTE · VERSIE {s.revision}</span><h2>{s.quote_number}</h2></div></header>
  <h2>{s.subject}</h2><div className="commercial-document-meta"><div><h3>Voor {s.customer.name}</h3><p>{s.contact.name}<br/>{address(s.customer.billing_address)}</p></div><div><h3>{s.object.name||"Object nog vaststellen"}</h3><p>{address(s.object.address)}<br/>Geldig tot {commercialDate(s.expires_at,timezone)}</p></div></div>
  <p>{s.terms.introduction}</p><h3>Werkzaamheden · {workKinds[s.work_kind]}</h3><p className="commercial-prewrap">{s.terms.scope}</p>
  <div className="table-scroll"><table className="resource-table commercial-document-lines"><thead><tr><th>Omschrijving</th><th>Aantal / eenheid</th><th>Tarief</th><th>Korting</th><th>Btw</th><th>Excl. btw</th></tr></thead><tbody>{s.lines.map((l,i)=><tr key={l.id||i}><td>{l.task_code&&<small>{l.task_code}</small>}{l.description}</td><td>{String(l.quantity)} {l.unit}</td><td>{money(l.price_cents)}</td><td>{l.discount_basis_points/100}%</td><td>{l.vat_basis_points/100}%</td><td>{money(l.net_cents??0)}</td></tr>)}</tbody></table></div>
  <dl className="commercial-totals"><div><dt>Subtotaal excl. btw · {priceBases[s.price_basis]}</dt><dd>{money(s.subtotal_cents)}</dd></div>{s.taxes?.map(t=><div key={t.basis_points}><dt>Btw {t.basis_points/100}% over {money(t.base_cents)}</dt><dd>{money(t.tax_cents)}</dd></div>)}<div><dt>Totaal incl. btw · {priceBases[s.price_basis]}</dt><dd>{money(s.total_cents)}</dd></div></dl>
  <p><strong>Prijsafspraak:</strong> {{fixed:"Vaste prijs",estimate:"Indicatieve prijs",actual:"Nacalculatie"}[s.terms.pricing_method]}</p>
  {s.work_kind==="recurring"&&<p><strong>Bezoekfrequentie:</strong> {s.terms.frequency}<br/>Start: {commercialDate(s.terms.starts_on,timezone)}{s.terms.ends_on&&` · Einddatum: ${commercialDate(s.terms.ends_on,timezone)}`}<br/>De bezoekfrequentie en de prijsbasis zijn afzonderlijke afspraken.</p>}
  {([["included","Inbegrepen"],["excluded","Niet inbegrepen"],["preparation","Voorbereiding door de klant"],["conditions","Voorwaarden"]] as const).map(([k,label])=>s.terms[k]&&<section key={k}><h3>{label}</h3><p className="commercial-prewrap">{s.terms[k]}</p></section>)}
  {s.attachments?.length>0&&<section><h3>Bijlagen bij deze versie</h3>{s.attachments.map(d=><p key={d.id}>{attachmentHref?<a className="text-link" href={attachmentHref(d.id)}>{d.title}</a>:d.title}</p>)}</section>}
  <footer>{s.brand.footer&&<p>{s.brand.footer}</p>}{Object.entries(s.brand.business??{}).filter(([,v])=>typeof v==="string"&&v).map(([k,v])=><span key={k}>{v} · </span>)}{!s.brand.white_label&&<small>Powered by Fieldgrid</small>}</footer>
 </article>;
}
