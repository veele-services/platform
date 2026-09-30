import "server-only";
import sharp from "sharp";
import {PDFDocument,StandardFonts,rgb,type PDFPage} from "pdf-lib";
import {money,priceBases,commercialDate,type QuoteSnapshot} from "@/lib/commercial/model";

/** One offered snapshot, including all lines and terms; never reads live data. */
export async function renderQuotePdf(s:QuoteSnapshot,logo?:Uint8Array){
 const doc=await PDFDocument.create();const regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const hex=/^#[a-f\d]{6}$/i.test(s.brand.primary)?s.brand.primary:"#222c35";const ink=rgb(...[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255) as [number,number,number]);
 let page:PDFPage;let y=0;const pages:PDFPage[]=[];
 const next=()=>{page=doc.addPage([595.28,841.89]);pages.push(page);y=780;page.drawRectangle({x:0,y:815,width:595.28,height:27,color:ink});};next();
 const safe=(s:string)=>[...s.replace(/\t/g," ")].map(c=>{try{regular.encodeText(c);return c;}catch{return "?";}}).join("");
 const text=(value:string,size=10,heavy=false)=>{
  const font=heavy?bold:regular;for(const paragraph of safe(value).split('\n')){
   let line="";for(const word of paragraph.split(/\s+/)){
    if(font.widthOfTextAtSize(`${line} ${word}`,size)>490&&line){if(y<70)next();page.drawText(line,{x:52,y,size,font,color:ink});y-=size+5;line="";}
    // Long unbroken URLs/codes must wrap too.
    for(const char of (line?" ":"")+word){if(font.widthOfTextAtSize(line+char,size)>490){if(y<70)next();page.drawText(line,{x:52,y,size,font,color:ink});y-=size+5;line="";}line+=char;}
   }
   if(y<70)next();page.drawText(line,{x:52,y,size,font,color:ink});y-=size+6;
  }
 };
 if(logo){try{const image=await doc.embedPng(await sharp(logo,{limitInputPixels:16000000}).rotate().resize({width:960,height:360,fit:"inside",withoutEnlargement:true}).png().toBuffer());const scale=Math.min(160/image.width,60/image.height);page!.drawImage(image,{x:52,y:y-image.height*scale,width:image.width*scale,height:image.height*scale});y-=image.height*scale+20;}catch{text(s.brand.name,18,true);}}else text(s.brand.name,18,true);
 text(`Offerte ${s.quote_number} - versie ${s.revision}`,18,true);text(s.subject,13,true);text(`Geldig tot ${commercialDate(s.expires_at,s.timezone)}`);y-=12;
 text(`Voor: ${s.customer.name}`,12,true);text([s.customer.billing_address.street,s.customer.billing_address.postal_code,s.customer.billing_address.city].filter(Boolean).join(', '));text(`Contact: ${s.contact.name} (${s.contact.email})`);text(`Object: ${s.object.name}`,12,true);text([s.object.address.street,s.object.address.postal_code,s.object.address.city].filter(Boolean).join(', '));y-=12;
 text(s.terms.introduction);text('Werkzaamheden',12,true);text(s.terms.scope);
 for(const [i,l] of s.lines.entries()){y-=10;text(`${i+1}. ${l.task_code||''} ${l.description}`,11,true);text(`${l.quantity} ${l.unit} x ${money(l.price_cents)} | korting ${l.discount_basis_points/100}% | btw ${l.vat_basis_points/100}%`);text(`${money(l.net_cents??0)} excl. btw - ${priceBases[s.price_basis]}`);}
 y-=15;text(`Subtotaal: ${money(s.subtotal_cents)} excl. btw - ${priceBases[s.price_basis]}`,12,true);
 for(const t of s.taxes)text(`Btw ${t.basis_points/100}% over ${money(t.base_cents)}: ${money(t.tax_cents)}`);
 text(`Totaal: ${money(s.total_cents)} incl. btw - ${priceBases[s.price_basis]}`,13,true);
 text(`Prijsafspraak: ${{fixed:'Vaste prijs',estimate:'Indicatieve prijs',actual:'Nacalculatie'}[s.terms.pricing_method]}`);
 if(s.work_kind==='recurring'){text(`Bezoekfrequentie: ${s.terms.frequency}`);text(`Start: ${commercialDate(s.terms.starts_on,s.timezone)} | einde: ${commercialDate(s.terms.ends_on,s.timezone)}`);}
 for(const [key,label] of [["included","Inbegrepen"],["excluded","Uitsluitingen"],["preparation","Voorbereiding door de klant"],["conditions","Voorwaarden"]] as const){if(s.terms[key]){y-=12;text(label,12,true);text(s.terms[key]);}}
 if(s.attachments.length){text('Bijlagen bij deze versie',12,true);for(const a of s.attachments)text(a.title);}
 if(s.brand.footer)text(s.brand.footer);for(const value of Object.values(s.brand.business??{}))if(typeof value==='string')text(value);
 pages.forEach((p,i)=>p.drawText(`${s.quote_number} v${s.revision} | ${i+1} / ${pages.length}${s.brand.white_label?'':' | Powered by Fieldgrid'}`,{x:52,y:30,size:8,font:regular,color:ink}));
 doc.setTitle(`Offerte ${s.quote_number} v${s.revision}`);doc.setProducer('Fieldgrid');return doc.save();
}
