"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadTaskItems } from "@/lib/tasks/control-actions";
import {saveTaskControl} from "@/lib/tasks/control-client";
import type { ItemContext, TaskItem } from "@/lib/tasks/controls-model";
import { ContentSection } from "../content-section";
import { Modal, Button, Field } from "../crm/ui";
import {ItemQr} from "./item-qr";
import {ItemDossierDialog} from "./item-dossier";
import "./controls.css";

export function ObjectItems({objectId,customerId}:{objectId:string;customerId:string}) {
 const [selectedItem,setSelectedItem]=useState<string|null>(null);
 const [data,setData]=useState<ItemContext|null>(null),[error,setError]=useState(""),[query,setQuery]=useState(""),[page,setPage]=useState(0),[editor,setEditor]=useState<TaskItem|"new"|null>(null);
 const reload=useCallback(async()=>{const r=await loadTaskItems(objectId,query,page*25);if(r.ok){setData(r.data);setError("");}else{setData(null);setError(r.error);}},[objectId,query,page]);
 useEffect(()=>{let active=true;void loadTaskItems(objectId,query,page*25).then(r=>{if(!active)return;if(r.ok){setData(r.data);setError("");}else setError(r.error);});return()=>{active=false;};},[objectId,query,page]);
 return <ContentSection title="Items" description="Herkenbare apparaten en onderdelen met een eigen identiteit. Werkzaamheden blijven bij de bestaande taken." actions={data?.canManage&&<Button primary onClick={()=>setEditor("new")}>Item registreren</Button>}>
 <Field label="Items zoeken"><input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="ID, naam, model of serienummer"/></Field>
 {error&&<p className="wo-error" role="alert">{error}<Button onClick={()=>void reload()}>Opnieuw laden</Button></p>}{!data&&!error&&<p role="status">Items laden…</p>}
 <div className="task-target-cards">{data?.items.map(item=><article className="task-target-card" key={item.id}><strong>{item.item_number} · {item.name}</strong><span>{item.item_type} · {item.model||"Model niet opgegeven"}</span><small>{data.nodes.find(n=>n.id===item.node_id)?.path??"Gehele object"} · {item.serial_number||"Zonder serienummer"}</small><span className="dossier-status">{({active:"Actief",out_of_service:"Buiten gebruik",archived:"Gearchiveerd"})[item.status]}</span><div className="task-picker-tools"><Button onClick={()=>setSelectedItem(item.id)}>Item 360</Button>{data.canManage&&<Button onClick={()=>setEditor(item)}>Bewerken</Button>}<details><summary>QR-identificatie</summary><ItemQr id={item.id} number={item.item_number}/><p className="task-item-id">{item.id}</p></details></div></article>)}</div>
 {data&&!data.items.length&&<p>{query?"Geen items voor deze zoekopdracht.":"Nog geen geregistreerde items op dit object."}</p>}
 {data&&<div className="task-picker-tools"><Button disabled={!page} onClick={()=>setPage(p=>p-1)}>Vorige</Button><span>{data.total} items · pagina {page+1}</span><Button disabled={(page+1)*25>=data.total} onClick={()=>setPage(p=>p+1)}>Volgende</Button></div>}
 {selectedItem&&<ItemDossierDialog itemId={selectedItem} onClose={()=>setSelectedItem(null)}/>}
 {editor&&data&&<ItemEditor item={editor==="new"?null:editor} objectId={objectId} customerId={customerId} nodes={data.nodes} objects={data.objects} close={()=>setEditor(null)} saved={async()=>{setEditor(null);await reload();}}/>}
 </ContentSection>;
}
function ItemEditor({item,objectId,customerId,nodes,objects,close,saved}:{item:TaskItem|null;objectId:string;customerId:string;nodes:ItemContext["nodes"];objects:ItemContext["objects"];close:()=>void;saved:()=>Promise<void>}) {
 const [error,setError]=useState(""),[pending,start]=useTransition(),[dirty,setDirty]=useState(false),[duplicates,setDuplicates]=useState(false);const mutation=useRef(crypto.randomUUID()),router=useRouter();
 const [destination,setDestination]=useState(objectId),[destinationNodes,setDestinationNodes]=useState(nodes);
 const relocate=async(id:string)=>{setDestination(id);const r=await loadTaskItems(id);if(r.ok)setDestinationNodes(r.data.nodes);else setError(r.error);};
 const cancel=()=>{if(!dirty||confirm("Niet-opgeslagen itemwijzigingen verwerpen?"))close();};
 return <Modal title={item?`${item.item_number} bewerken`:"Item registreren"} onClose={cancel} footer={<><Button disabled={pending} onClick={cancel}>Annuleren</Button><Button primary disabled={pending} type="submit" form="task-item-form">{pending?"Opslaan…":"Opslaan"}</Button></>}>
 <form id="task-item-form" className="task-item-form" onChange={()=>{setDirty(true);mutation.current=crypto.randomUUID();}} onSubmit={event=>{event.preventDefault();const f=new FormData(event.currentTarget);start(async()=>{const r=await saveTaskControl({action:"item_save",mutationId:mutation.current,...(item?{id:item.id,version:item.version}:{}),objectId:destination,customerId,...(!item&&String(f.get("replacesId"))?{replacesId:String(f.get("replacesId"))}:{}),nodeId:String(f.get("nodeId"))||undefined,name:String(f.get("name")),itemType:String(f.get("itemType")),brand:String(f.get("brand")),model:String(f.get("model")),serialNumber:String(f.get("serialNumber")),status:String(f.get("status")) as TaskItem["status"],duplicatesReviewed:duplicates});if(!r.ok){setError(r.error);return;}router.refresh();await saved();});}}>
 <Field label="Naam"><input name="name" required maxLength={180} defaultValue={item?.name}/></Field><Field label="Itemtype"><input name="itemType" required maxLength={100} defaultValue={item?.item_type}/></Field><Field label="Merk"><input name="brand" maxLength={100} defaultValue={item?.brand}/></Field><Field label="Model"><input name="model" maxLength={100} defaultValue={item?.model}/></Field><Field label="Serienummer (optioneel)"><input name="serialNumber" maxLength={200} defaultValue={item?.serial_number}/></Field><Field label="Object"><select value={destination} onChange={e=>void relocate(e.target.value)}>{objects.map(o=><option value={o.id} key={o.id}>{o.name}</option>)}</select></Field><Field label="Ruimte / onderdeel"><select key={destination} name="nodeId" defaultValue={item?.node_id??""}><option value="">Gehele object</option>{destinationNodes.map(n=><option key={n.id} value={n.id}>{n.path}</option>)}</select></Field><Field label="Status"><select name="status" defaultValue={item?.status??"active"}><option value="active">Actief</option><option value="out_of_service">Buiten gebruik</option><option value="archived">Gearchiveerd</option></select></Field>
 {!item&&<Field label="Vervangt item (intern ID, optioneel)"><input name="replacesId" pattern="[0-9a-fA-F-]{36}"/><small>Alleen een fysiek nieuw apparaat krijgt deze nieuwe identiteit.</small></Field>}
 <label className="task-picker-check"><input type="checkbox" checked={duplicates} onChange={e=>setDuplicates(e.target.checked)}/>Mogelijke dubbelen opgezocht en beoordeeld</label>
 {error&&<p className="wo-error" role="alert">{error}</p>}<p>Hernoemen of archiveren bewaart eerdere uitvoeringen. Een fysiek vervangend apparaat krijgt een nieuw item-ID.</p>
 </form></Modal>;
}
