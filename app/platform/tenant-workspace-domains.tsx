"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe2, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionIcon } from "@/components/fieldgrid/action-icon";
import { managePlatformWorkspaceDomain } from "./domain-actions";
import { workspaceDnsRecords, type WorkspaceDomain } from "@/lib/tenancy/workspace-domain";

export function TenantWorkspaceDomains({ tenantId, canonicalHost, domains }: { tenantId: string; canonicalHost: string; domains: WorkspaceDomain[] }) {
 const [host, setHost] = useState(""); const [message,setMessage] = useState<string|null>(null); const [pending,startTransition] = useTransition(); const router=useRouter();
 function run(operation: "register"|"verify"|"activate"|"remove", id?: string) { startTransition(async()=>{
  setMessage(null); const result=await managePlatformWorkspaceDomain({tenantId,host,id,operation});
  if(!result.ok) setMessage(result.error); else {setMessage(operation==="activate"?"Domein actief. Het oorspronkelijke tenantadres blijft bereikbaar.":operation==="verify"?"DNS geverifieerd. Richt Caddy in voordat je het domein activeert.":"Domeinkoppeling opgeslagen.");if(operation==="register")setHost("");router.refresh();}
 }); }
 return <section className="fg-panel fg-workspace-domains"><div className="fg-panel-heading"><div><span className="fg-eyebrow">TENANTADRES</span><h2>Eigen domein</h2></div><Globe2/></div>
  <p className="fg-panel-description">Koppel een eigen adres aan de backoffice, personeelsapp en klantportaal. Het vaste adres blijft {canonicalHost}.</p>
  <form className="fg-domain-add" onSubmit={event=>{event.preventDefault();run("register");}}><label className="fg-field"><span>Domeinnaam</span><input aria-label="Eigen domeinnaam" value={host} onChange={event=>setHost(event.target.value)} placeholder="app.organisatie.nl" required maxLength={253}/></label><Button type="submit" disabled={pending||!host.trim()}>Domein koppelen</Button></form>
  {message&&<p role="status" className="fg-domain-message">{message}</p>}
  {domains.length===0?<p className="fg-panel-description">Nog geen eigen domein gekoppeld.</p>:domains.map(domain=><div className="fg-domain-card" key={domain.id}><div className="fg-domain-card-heading"><strong>{domain.host}</strong><span>{domain.status==="active"?"Actief":domain.status==="verified"?"DNS geverifieerd":"Wacht op DNS"}</span><ActionIcon label={`Verwijder ${domain.host}`} icon={<Trash2 size={16}/>} disabled={pending} onClick={()=>run("remove",domain.id)}/></div>
    <p className="fg-panel-description">Voeg deze DNS-records toe. Stel Caddy en HTTPS in voor dit adres vóór activering.</p><dl className="fg-domain-records">{workspaceDnsRecords(domain.host,domain.verificationToken,canonicalHost).map(record=><div key={record.type}><dt>{record.type}</dt><dd><span>{record.name}</span><code>{record.value}</code></dd></div>)}</dl>
    <div className="fg-domain-actions"><Button variant="outline" disabled={pending} onClick={()=>run("verify",domain.id)}><Check size={16}/>DNS controleren</Button>{domain.status==="verified"&&<Button disabled={pending} onClick={()=>run("activate",domain.id)}>Activeren na Caddy-inrichting</Button>}</div>
  </div>)}
 </section>;
}
