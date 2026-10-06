"use client";
import {useEffect,useState} from "react";
import {ContentSection} from "../content-section";
import Link from "next/link";
import {readCommercialOrder} from "@/app/app/commercial-actions";
import {priceBases,commercialDate} from "@/lib/commercial/model";
export function CommercialOrderContext({orderId,timezone}:{orderId:string;timezone:string}){
 const [data,setData]=useState<Record<string,string|null>|null>(null);
 useEffect(()=>{let live=true;void readCommercialOrder(orderId).then(r=>{if(live&&r.ok)setData(r.data);});return()=>{live=false;};},[orderId]);
 if(!data||!data.quote_id&&!data.request_id)return null;
 return <ContentSection title="Commerciële herkomst"><p>{data.kind==="inspection"?"Opname / inventarisatie — geen akkoord op uitvoering":"Uitvoering van vastgelegde afspraken"}</p>{data.request_id&&<Link className="text-link" href={`/app/aanvragen?record=${data.request_id}&recordKind=request`}>{data.request_number}</Link>}{data.quote_id&&<p><Link className="text-link" href={`/app/aanvragen?tab=quotes&record=${data.quote_id}&recordKind=quote`}>{data.quote_number} · geaccepteerde versie {data.revision}</Link></p>}{data.work_kind==="recurring"&&<p>Bezoekpatroon: {data.frequency}<br/>Prijsbasis: {priceBases[data.price_basis as keyof typeof priceBases]}<br/>Vanaf {commercialDate(data.starts_on,timezone)}{data.ends_on&&` t/m ${commercialDate(data.ends_on,timezone)}`}<br/>Concrete bezoeken worden afzonderlijk ingepland.</p>}{["week","month"].includes(data.price_basis||"")&&<p className="dossier-notice">Deze werkzaamheden horen bij een periodeprijs. Factureer het bedrag niet per bezoek; gebruik Periodefactuur maken bij de geaccepteerde offerte.</p>}</ContentSection>;
}
