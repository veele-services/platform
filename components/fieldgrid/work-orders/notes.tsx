"use client";

import { ContentSection } from "../content-section";
import { ListPagination, useListPagination } from "../list-pagination";
import type { WorkOrderDossier } from "@/lib/work-orders/model";

export function WorkOrderNotes({ notes, timezone }: { notes: WorkOrderDossier["reports"]; timezone: string }) {
  const paging = useListPagination(notes);
  return <div className="wo-notes">
    <ContentSection title="Notities"><div className="wo-document-list">{paging.items.map(note => <article className="wo-record" key={note.id}><div><strong>{note.author ?? "Backoffice"}</strong><small>{new Intl.DateTimeFormat("nl-NL",{dateStyle:"short",timeStyle:"short",timeZone:timezone}).format(new Date(note.created_at))} · {note.customer_visible ? "Voor het klantrapport na controle" : "Intern"}</small><p className="wo-prewrap">{note.body}</p></div></article>)}</div>{!notes.length && <p>Nog geen notities ontvangen.</p>}</ContentSection>
    <ListPagination total={paging.total} page={paging.page} pageSize={paging.pageSize} onPageChange={paging.setPage} onPageSizeChange={paging.setPageSize} noun="notities" preferenceKey="backoffice:work-order-notes"/>
  </div>;
}
