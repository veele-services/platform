"use client";
import { useRef, useState, useTransition } from "react";
import { saveKnowledge } from "@/lib/knowledge/actions";
import { knowledgeContentSchema, knowledgeLabels, knowledgeWorkspaces, type KnowledgeArticle, type KnowledgeContent } from "@/lib/knowledge/model";
import { KnowledgeBody } from "./article";
export function KnowledgeEditor({ article, onSaved, onClose }: { article?: KnowledgeArticle; onSaved: (slug: string) => void; onClose: () => void }) {
  const [slug,setSlug]=useState(article?.slug??""), [content,setContent]=useState<KnowledgeContent>(article ? { title:article.title,summary:article.summary,body:article.body,category:article.category,tags:article.tags,audiences:article.audiences,related:article.relatedSlugs??article.related.map(a=>a.slug) } : { title:"",summary:"",body:"## Doel\n\n\n## Voor je begint\n\n\n## Stap voor stap\n\n1. \n\n## Controleer het resultaat\n\n\n## Veelgestelde vragen\n\n",category:"Aan de slag",tags:[],audiences:["backoffice"],related:[] });
  const [tagText,setTagText]=useState(content.tags.join(", ")), [relatedText,setRelatedText]=useState(content.related.join(", "));
  const [pending,start]=useTransition(),[error,setError]=useState(""),[preview,setPreview]=useState(false);
  const receipt=useRef<{ fingerprint:string; id:string }|null>(null);
  const field=<K extends keyof KnowledgeContent>(key:K,value:KnowledgeContent[K])=>setContent(previous=>({...previous,[key]:value}));
  return <section className="kb-editor resource-panel" aria-label="Artikel bewerken"><header className="kb-section-header"><div><h2>{article ? "Artikel bewerken" : "Nieuw artikel"}</h2><p>Opslaan wijzigt het concept. Publiceren maakt het apart beschikbaar voor de gekozen portalen.</p></div><button type="button" className="secondary-button" onClick={onClose} disabled={pending}>Sluiten</button></header><form onSubmit={event=>{event.preventDefault();setError("");start(async()=>{
    const parsed=knowledgeContentSchema.safeParse({...content,tags:tagText.split(",").map(s=>s.trim()).filter(Boolean),related:relatedText.split(",").map(s=>s.trim()).filter(Boolean)});if(!parsed.success){setError("Controleer de lengtes van titel, samenvatting en uitleg, en kies ten minste één doelgroep. Controleer ook trefwoorden en verwante artikelcodes.");return;}
    const operation={command:"save" as const,payload:{slug,revision:article?.revision??0,content:parsed.data}},fingerprint=JSON.stringify(operation);
    if(receipt.current?.fingerprint!==fingerprint)receipt.current={fingerprint,id:crypto.randomUUID()};
    const result=await saveKnowledge({requestId:receipt.current.id,operation});if(!result.ok){setError(result.error);return;}onSaved(result.slug);
  });}} className="kb-editor-form">
    <div className="kb-form-grid"><label>Titel<input required maxLength={180} value={content.title} onChange={e=>field("title",e.target.value)}/></label><label>Vaste artikelcode<input required disabled={Boolean(article)} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={120} value={slug} onChange={e=>setSlug(e.target.value)}/><small>Bijvoorbeeld werkbon-vrijgeven. Deze code blijft vast zodat gedeelde links blijven werken.</small></label></div>
    <label>Samenvatting<textarea required minLength={30} maxLength={600} rows={3} value={content.summary} onChange={e=>field("summary",e.target.value)}/></label>
    <div className="kb-form-grid"><label>Categorie<input required maxLength={80} value={content.category} onChange={e=>field("category",e.target.value)}/></label><label>Trefwoorden en synoniemen<input value={tagText} onChange={e=>setTagText(e.target.value)}/><small>Scheid woorden met komma’s; deze wegen mee in het zoeken.</small></label></div>
    <fieldset><legend>Zichtbaar na publiceren</legend><div className="kb-checkboxes">{knowledgeWorkspaces.map(portal=><label key={portal}><input type="checkbox" checked={content.audiences.includes(portal)} onChange={e=>field("audiences",e.target.checked?[...content.audiences,portal]:content.audiences.filter(p=>p!==portal))}/>{knowledgeLabels[portal]}</label>)}</div></fieldset>
    <label>Expliciet verwante artikelcodes<input value={relatedText} onChange={e=>setRelatedText(e.target.value)}/><small>Toegestane verwante artikelen worden ook gevonden via categorie en trefwoorden.</small></label>
    <div className="kb-section-header"><label htmlFor="kb-body">Uitgebreide uitleg</label><button type="button" className="secondary-button" onClick={()=>setPreview(v=>!v)}>{preview?"Tekst bewerken":"Voorbeeld bekijken"}</button></div>
    <small>Gebruik ## voor secties, ### voor vragen, 1. voor stappen, - voor opsommingen, **vet**, en [tekst](https://…). HTML wordt als tekst getoond.</small>
    {preview?<KnowledgeBody body={content.body}/>:<textarea id="kb-body" className="kb-body-input" required minLength={100} maxLength={60000} rows={24} value={content.body} onChange={e=>field("body",e.target.value)}/>}
    {error&&<p role="alert" className="kb-error">{error}</p>}<footer><button className="primary-button" disabled={pending}>{pending?"Opslaan…":"Concept opslaan"}</button></footer>
  </form></section>;
}
