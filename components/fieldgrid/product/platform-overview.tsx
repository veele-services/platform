"use client";

import {useState} from "react";
import Link from "next/link";
import {Layers3, ArrowUpRight, Sparkles} from "lucide-react";
import {platformModuleCatalogue, type PlatformModule} from "@/lib/platform/module-catalogue";
import {progressLabels, type ProductItem, type ProductSection} from "@/lib/product/model";
import {Panel, Badge, Empty} from "../crm/ui";
import {SourceNativeDialog} from "../source-native-dialog";

export function PlatformProductOverview({roadmap, open}: {roadmap: ProductItem[]; open: (section: ProductSection, id: string) => void}) {
  const [selected, setSelected] = useState<PlatformModule | null>(null);
  return <>
    <Panel title="V1-modules" eyebrow="PRODUCTINRICHTING"><div className="ed-module-grid">{platformModuleCatalogue.map(module => <button key={module.id} disabled={!module.available} onClick={() => setSelected(module)}>
      <Layers3 size={23}/><strong>{module.name}</strong><small>{module.available ? "Beschikbaar voor tenants" : "Latere release"}</small><ArrowUpRight size={15}/>
    </button>)}</div></Panel>
    <Panel title="Roadmap & updates">
      {roadmap.slice(0,5).map(item => <div className="ed-dossier-row" key={item.id}><Sparkles size={20}/><span><button className="ed-record" onClick={() => open("roadmap", item.id)}>{item.title}</button><small>{'summary' in item ? item.summary : ''}</small></span><Badge>{'progress' in item ? progressLabels[item.progress] : 'Gepland'}</Badge></div>)}
      {!roadmap.length && <Empty title="Nog geen roadmapitems" text="Beheer ideeën, roadmap en releases hieronder. Publicatie en modulebeschikbaarheid worden afzonderlijk beheerd."/>}
    </Panel>
    {selected && <SourceNativeDialog sourceForm title={selected.name} eyebrow="PRODUCTINRICHTING" description="" onClose={() => setSelected(null)}>
      <p>{selected.description}</p><div className="ed-facts"><div><span>Beschikbaarheid</span><strong>Beschikbaar voor tenants</strong></div><div><span>Vereist</span><strong>{selected.dependencies.length ? selected.dependencies.map(id => platformModuleCatalogue.find(module => module.id === id)?.name).join(', ') : 'Geen aanvullende module'}</strong></div></div>
      <Link className="secondary-button" href="/platform?view=tenants">Modules per tenant beheren</Link>
    </SourceNativeDialog>}
  </>;
}
