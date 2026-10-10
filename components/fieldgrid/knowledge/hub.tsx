"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Copy, Pencil, Plus, Search } from "lucide-react";
import { PageHeading } from "../page-heading";
import { EmptyState } from "../empty-state";
import { ListPagination } from "../list-pagination";
import { ActionIcon } from "../action-icon";
import { saveKnowledge } from "@/lib/knowledge/actions";
import { knowledgeArticleSchema, knowledgeLabels, knowledgeListSchema, knowledgePaths, knowledgeWorkspaces, type KnowledgeArticle, type KnowledgeList, type KnowledgeWorkspace } from "@/lib/knowledge/model";
import { KnowledgeBody, knowledgeHeadings } from "./article";
import { KnowledgeEditor } from "./editor";
import "./knowledge.css";
export function KnowledgeHub({ workspace, actorKey, initial, article: initialArticle }: { workspace: KnowledgeWorkspace; actorKey: string; initial: KnowledgeList; article?: KnowledgeArticle }) {
  const router=useRouter(),base=knowledgePaths[workspace];
  const [data,setData]=useState(initial),[article,setArticle]=useState(initialArticle),[search,setSearch]=useState(""),[category,setCategory]=useState(""),[portal,setPortal]=useState(""),[publication,setPublication]=useState(""),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(12);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[closed,setClosed]=useState(false),[editing,setEditing]=useState(false),[editorArticle,setEditorArticle]=useState<KnowledgeArticle|undefined>(undefined),[notice,setNotice]=useState(""),[confirm,setConfirm]=useState<"publish"|"archive"|null>(null),[pending,start]=useTransition();
  const generation=useRef(0), receipt=useRef<{ fingerprint:string; id:string }|null>(null);
  useEffect(()=>{
    const controller=new AbortController(),epoch=++generation.current;
    const refresh=async()=>{
      if(document.visibilityState!=="visible")return;setBusy(true);
      try {
        const params=new URLSearchParams({workspace,...(initialArticle?{slug:initialArticle.slug}:{search,category,portal,publication,page:String(page),pageSize:String(pageSize)})});
        const response=await fetch(`/api/knowledge?${params}`,{cache:"no-store",signal:controller.signal});
        if(!response.ok){if([403,404].includes(response.status)&&epoch===generation.current){setClosed(true);setArticle(undefined);setData({...initial,items:[],categories:[],total:0,canManage:false});setEditing(false);setEditorArticle(undefined);}throw new Error();}
        const value=await response.json();if(epoch!==generation.current)return;
        if(initialArticle)setArticle(knowledgeArticleSchema.parse(value));else setData(knowledgeListSchema.parse(value));setClosed(false);setError("");
      }catch{if(!controller.signal.aborted&&epoch===generation.current)setError("De kennisbank kon niet worden vernieuwd. Probeer opnieuw.");}
      finally{if(epoch===generation.current)setBusy(false);}
    };
    const debounce=window.setTimeout(refresh,250),timer=window.setInterval(refresh,30000);
    const clear=()=>{generation.current++;controller.abort();setClosed(true);setArticle(undefined);setData({...initial,items:[],categories:[],total:0,canManage:false});setEditing(false);setEditorArticle(undefined);};
    window.addEventListener("focus",refresh);window.addEventListener("notifications-account-cleared",clear);
    return()=>{controller.abort();window.clearTimeout(debounce);window.clearInterval(timer);window.removeEventListener("focus",refresh);window.removeEventListener("notifications-account-cleared",clear);};
  },[workspace,actorKey,initial,initialArticle,search,category,portal,publication,page,pageSize]);
  const action=async(command:"publish"|"archive"|"restore",sourceRevision?:number)=>{
    if(!article)return;setError("");const operation={command,payload:{slug:article.slug,revision:article.revision,...(sourceRevision?{sourceRevision}:{})}},fingerprint=JSON.stringify(operation);
    if(receipt.current?.fingerprint!==fingerprint)receipt.current={fingerprint,id:crypto.randomUUID()};
    const result=await saveKnowledge({requestId:receipt.current.id,operation});if(!result.ok){setError(result.error);return;}
    setConfirm(null);setNotice(command==="publish"?"Artikel gepubliceerd.":command==="archive"?"Artikel gearchiveerd.":"Versie hersteld als concept. Publiceer apart na controle.");router.refresh();
  };
  if(closed)return <EmptyState title="Kennisbank niet beschikbaar" description="Je toegang of de publicatie van dit artikel is gewijzigd. Open je eigen portaal of meld opnieuw aan."/>;
  const canManage=data.canManage;
  return <div className="kb-workspace">
    <PageHeading eyebrow={knowledgeLabels[workspace]} title={article?article.title:"Kennisbank"} description={article?article.summary:"Handleidingen, stappenplannen en antwoorden voor jouw werkruimte."} help="Zoek op een taak of probleem. Artikelen verlenen geen extra rechten. Platformbeheerders beheren de inhoud." actions={canManage?<ActionIcon label={article?"Artikel bewerken":"Nieuw artikel"} className="primary-button" icon={article?<Pencil size={16}/>:<Plus size={18}/>} onClick={()=>{setEditorArticle(article);setEditing(true);}}/>:undefined}/>
    {notice&&<p role="status" className="kb-notice">{notice}</p>}{error&&<p role="alert" className="kb-error">{error}</p>}
    {editing?<KnowledgeEditor key={`${editorArticle?.slug??"new"}:${editorArticle?.revision??0}`} article={editorArticle} onClose={()=>setEditing(false)} onSaved={slug=>{setEditing(false);router.push(`${base}/${slug}`);router.refresh();}}/>:article?<>
      <div className="kb-article-actions"><Link href={base} className="text-link"><ArrowLeft size={15}/>Alle artikelen</Link><span>{article.category} · {article.readingMinutes} min lezen · Bijgewerkt {new Intl.DateTimeFormat("nl-NL",{dateStyle:"medium"}).format(new Date(article.updatedAt))}</span><button type="button" className="secondary-button" onClick={async()=>{try{await navigator.clipboard.writeText(window.location.href);setNotice("Artikellink gekopieerd.");}catch{setNotice("Kopieer het artikeladres uit de adresbalk.");}}}><Copy size={14}/>Link kopiëren</button></div>
      {canManage&&<div className="kb-admin-bar"><strong>{article.publication==="published"?"Gepubliceerd · je leest het bewerkbare concept":article.publication==="archived"?"Gearchiveerd":"Concept"} · versie {article.revision}</strong><div><button className="primary-button" disabled={pending} onClick={()=>setConfirm("publish")}>Publiceren</button><button className="secondary-button" disabled={pending||article.publication==="archived"} onClick={()=>setConfirm("archive")}>Archiveren</button></div></div>}
      {confirm&&<section className="kb-confirm" aria-label="Publicatie bevestigen"><h2>{confirm==="publish"?"Artikel publiceren?":"Artikel archiveren?"}</h2><p>{confirm==="publish"?`Het huidige concept wordt zichtbaar voor ${article.audiences.map(a=>knowledgeLabels[a]).join(", ")}. Controleer inhoud, stappen en doelgroep.`:"Het artikel verdwijnt voor lezers. Gedeelde links blijven bestaan, maar tonen geen artikel totdat het opnieuw wordt gepubliceerd."}</p><div><button className="primary-button" disabled={pending} onClick={()=>start(()=>action(confirm))}>Bevestigen</button><button className="secondary-button" disabled={pending} onClick={()=>setConfirm(null)}>Annuleren</button></div></section>}
      <div className="kb-article-grid"><article className="kb-article resource-panel"><KnowledgeBody body={article.body}/></article><aside className="kb-aside"><section className="resource-panel"><h2>In dit artikel</h2><nav aria-label="Inhoudsopgave">{knowledgeHeadings(article.body).map(h=><a key={h.anchor} href={`#${h.anchor}`}>{h.title}</a>)}</nav></section>{article.related.length>0&&<section className="resource-panel"><h2>Verwante artikelen</h2>{article.related.map(r=><Link key={r.slug} href={`${base}/${r.slug}`}><strong>{r.title}</strong><small>{r.summary}</small></Link>)}</section>}{canManage&&article.history&&<section className="resource-panel"><h2>Versiegeschiedenis</h2><p>Herstellen wijzigt het concept; de publicatie blijft apart.</p>{article.history.map(v=><div className="kb-history" key={v.revision}><span>Versie {v.revision} · {({seed:"Startinhoud",save:"Concept opgeslagen",publish:"Gepubliceerd",archive:"Gearchiveerd",restore:"Hersteld"} as Record<string,string>)[v.action]??v.action}<small>{new Intl.DateTimeFormat("nl-NL",{dateStyle:"short"}).format(new Date(v.createdAt))}</small></span><button className="secondary-button" disabled={pending||v.revision===article.revision} onClick={()=>start(()=>action("restore",v.revision))}>Herstellen</button></div>)}</section>}</aside></div>
    </>:<>
      <div className="kb-toolbar"><label className="kb-search"><Search size={18}/><input type="search" aria-label="Zoek in de kennisbank" placeholder="Zoek je taak of vraag, bijvoorbeeld bon vrijgeven…" maxLength={160} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label>{canManage&&<><label>Portaal<select value={portal} onChange={e=>{setPortal(e.target.value);setPage(1);}}><option value="">Alle portalen</option>{knowledgeWorkspaces.map(p=><option key={p} value={p}>{knowledgeLabels[p]}</option>)}</select></label><label>Publicatie<select value={publication} onChange={e=>{setPublication(e.target.value);setPage(1);}}><option value="">Alle artikelen</option><option value="draft">Concept</option><option value="published">Gepubliceerd</option><option value="archived">Gearchiveerd</option></select></label></>}</div>
      <div className="kb-categories" aria-label="Categorieën"><button type="button" aria-pressed={!category} onClick={()=>{setCategory("");setPage(1);}}>Alle categorieën</button>{data.categories.map(c=><button type="button" key={c.name} aria-pressed={category===c.name} onClick={()=>{setCategory(c.name);setPage(1);}}>{c.name}<span>{c.count}</span></button>)}</div>
      <div className="kb-cards" aria-busy={busy}>{data.items.map(item=><Link className="kb-card resource-panel" key={item.slug} href={`${base}/${item.slug}`}><span className="kb-card-meta"><BookOpen size={17}/>{item.category} · {item.readingMinutes} min</span><h2>{item.title}</h2><p>{item.summary}</p><span className="kb-card-footer">Artikel lezen{canManage&&<small>{item.publication==="published"?"Gepubliceerd":item.publication==="draft"?"Concept":"Gearchiveerd"}</small>}</span></Link>)}</div>{!data.items.length&&<EmptyState title="Geen artikelen gevonden" description="Probeer andere kernwoorden of kies een andere categorie. Geef een ontbrekende uitleg door via support."/>}
      <ListPagination total={data.total} page={page} pageSize={pageSize} noun="artikelen" busy={busy} preferenceKey={`knowledge:${workspace}`} onPageChange={setPage} onPageSizeChange={size=>{setPageSize(size);setPage(1);}}/>
    </>}
  </div>;
}
