import {quoteLabels} from "@/lib/commercial/model";
import {quoteAccess} from "@/lib/commercial/access";
import {QuoteDocument} from "@/components/fieldgrid/commercial/document";
import {brandThemeStyle} from "@/lib/branding/palette";
import {QuoteForm} from "./quote-form";
export default async function QuotePage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;const access=await quoteAccess(token);
 if(!access)return <main className="auth-page"><section className="auth-card"><h1>Offerte niet beschikbaar</h1><p>Controleer de link of vraag de afzender om een actueel voorstel.</p></section></main>;
 const {quote:q,snapshot:s,tenant,active}=access;
 if(!active)return <main className="auth-page"><section className="auth-card"><h1>Dit voorstel is niet meer actueel</h1><p>De offerte van {tenant.name} is verlopen, vervangen of ingetrokken. Je kunt via deze link geen nieuw akkoord geven.</p>{s.brand?.sender_email&&<a className="primary-button" href={`mailto:${s.brand.sender_email}`}>Contact opnemen</a>}</section></main>;
 return <main className="commercial-external" style={brandThemeStyle(s.brand?.primary,s.brand?.accent)}><QuoteDocument snapshot={s} timezone={tenant.timezone} logoUrl={q.logo_path?`/api/files/commercial/${q.id}?token=${token}&asset=logo`:null} attachmentHref={id=>`/api/files/commercial/${id}?token=${token}`}/>{q.pdf_path&&<a className="secondary-button" href={`/api/files/commercial/${q.id}?token=${token}&asset=pdf`}>Offerte-PDF downloaden</a>}{access.token.consumed_at||!["awaiting_acceptance","sent"].includes(q.status)?<p className="auth-message success">Deze offerteversie is behandeld: {quoteLabels[q.status]||"besluit opgeslagen"}.</p>:<QuoteForm token={token}/>}</main>;
}
