"use client";

import {useCallback, useEffect, useRef, useState, type ReactNode} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {Eye} from "lucide-react";
import {loadTicketDetail, runTicketCommand} from "@/app/(workspace)/tickets/actions";
import type {TicketAccess, TicketDetail, TicketListData, TicketOptions, TicketQuery} from "@/lib/tickets/model";
import {PageHeading, Table, Badge, Empty, Button} from "../crm/ui";
import {ListPagination} from "../list-pagination";
import {SourceNativeDialog} from "../source-native-dialog";
import {TicketMessageBody} from "../knowledge/ticket-message";
import {TicketFiles} from "./files";
import {TicketComposer, TicketEdit} from "./detail";
import {useSourcePortal} from "../portals/context";
import {ticketPaths} from "@/lib/tickets/model";
import {ticketAssigneeLabel, ticketDate, ticketStatusLabels, ticketTone} from "./presentation";

/** The supplied six-column support view, using only the native scoped DTO. */
export function PlatformSupportList({access, data, options, query, actions, activeFilters, createModal, error, pending, href}: {
  access: TicketAccess; data: TicketListData; options: TicketOptions; query: TicketQuery;
  actions: ReactNode; activeFilters: ReactNode; createModal: ReactNode; error: string; pending: boolean;
  href: (patch: Record<string, string | number | null>) => string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return <>
    <PageHeading eyebrow="FIELDGRID PLATFORM" title="Supportdesk" help="Behandel de supportvragen die organisaties bewust met Fieldgrid delen." actions={actions}/>
    {!access.allowed && <p className="ticket-notice" role="status">Je kunt de ticketinrichting beheren, maar hebt geen leesrecht voor gesprekken. Alleen expliciet toegekende tickets verschijnen hier.</p>}
    {activeFilters}{error && <p className="ticket-error" role="alert">{error}</p>}
    <Table headers={["Ticket", "Tenant", "Onderwerp", "Verantwoordelijke", "Status", "Acties"]}>
      {data.items.map(row => <tr key={row.id}>
        <td><button className="ed-record" onClick={() => setSelected(row.id)}>{row.unread && <i className="ticket-unread"/>}{row.number}</button></td>
        <td>{row.tenantName}</td><td>{row.subject}</td><td>{ticketAssigneeLabel(row)}</td>
        <td><Badge tone={ticketTone(row.status)}>{ticketStatusLabels[row.status]}</Badge></td>
        <td><button className="fg-action-icon" aria-label={`Open ${row.number}`} onClick={() => setSelected(row.id)}><Eye size={15}/></button></td>
      </tr>)}
      {!data.items.length && <tr><td colSpan={6}><Empty title={query.search ? "Geen supporttickets gevonden" : "Nog geen supporttickets"} text="Alleen vragen die bewust met Fieldgrid zijn gedeeld en binnen je rechten vallen verschijnen hier."/></td></tr>}
    </Table>
    <ListPagination total={data.total} page={data.page} pageSize={data.pageSize} noun="tickets" busy={pending} preferenceKey={`tickets:platform:${access.userId}:platform`} href={href({page: data.page})}/>
    {selected && <SourceTicketConversation key={selected} id={selected} access={access} options={options} onClose={() => setSelected(null)}/>}
    {createModal}
  </>;
}

export function SourceTicketConversation({id, access, options, onClose}: {id: string; access: TicketAccess; options: TicketOptions; onClose: () => void}) {
  const router = useRouter(), generation = useRef(0), read = useRef(""),portal=useSourcePortal();
  const [data, setData] = useState<TicketDetail | null>(null), [error, setError] = useState("");
  const [composer, setComposer] = useState({dirty: false, busy: false}), [resolving, setResolving] = useState(false);
  const invalidate = useCallback(() => {generation.current++;}, []);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    try {
      const result = await loadTicketDetail(access.workspace, id);
      if (current !== generation.current) return;
      if (!result.ok || !result.data) {
        if (result.ok || result.code === "42501") {setData(null); setError("Dit gesprek is niet meer beschikbaar binnen je huidige rechten.");}
        else setError("Het gesprek kon niet worden vernieuwd. Je concept blijft bewaard; probeer opnieuw.");
        return;
      }
      setData(result.data); setError("");
    } catch {
      if (current === generation.current) setError("Het gesprek kon niet worden vernieuwd. Je concept blijft bewaard; probeer opnieuw.");
    }
  }, [id,access.workspace]);
  useEffect(() => {
    const refresh = () => {if (document.visibilityState === "visible") void reload();};
    const initial = setTimeout(refresh, 0); const timer = setInterval(refresh, 30000); window.addEventListener("focus", refresh);
    return () => {invalidate(); clearTimeout(initial); clearInterval(timer); window.removeEventListener("focus", refresh);};
  }, [reload, invalidate]);
  useEffect(() => {
    if (!data?.unread || read.current === `${data.id}:${data.version}`) return;
    read.current = `${data.id}:${data.version}`;
    void runTicketCommand(access.workspace, "mark_read", {id: data.id, version: data.version}, crypto.randomUUID());
  }, [data,access.workspace]);
  const saved = () => {void reload(); router.refresh();};
  const close = () => {if (!composer.busy && (!composer.dirty || confirm("Je bericht is nog niet verstuurd. Wil je het venster toch sluiten?"))) onClose();};
  return <>
    <SourceNativeDialog title={portal?data?.subject??"Ticket":data?.number ?? "Supportticket"} description="" eyebrow={portal?data?.number??"CONTACT":"FIELDGRID PLATFORM"} onClose={onClose} dirty={composer.dirty} busy={composer.busy} sourceForm footer={<>
      <Button onClick={close} disabled={composer.busy}>Sluiten</Button>
      {data?.allowedActions.includes("resolve") && <Button primary disabled={composer.busy || composer.dirty} onClick={() => setResolving(true)}>Afsluiten</Button>}
    </>}>
      {error && <p role="alert">{error}<Button onClick={() => void reload()}>Opnieuw proberen</Button></p>}
      {!data && !error && <p role="status">Gesprek laden…</p>}
      {data && <div hidden={Boolean(error)} inert={Boolean(error)}>
        <p className="ed-muted">{data.tenantName} · {data.subject} · {ticketStatusLabels[data.status]}</p>
        <div className={portal?"portal-demo-conversation":""}>{data.messages.map(message => <article className={portal?undefined:"ed-message"} key={message.id}>
          <strong>{message.authorLabel}</strong>
          {message.audience !== "reporter" && <small>Interne notitie · Fieldgrid</small>}
          <p className="ticket-prewrap">{message.redacted ? "Dit bericht is gecontroleerd geredigeerd." : <TicketMessageBody body={message.body}/>}</p>
          <TicketFiles files={message.attachments}/><small>{ticketDate(message.createdAt, data.timezone)}</small>
        </article>)}</div>
        {(data.allowedActions.includes("reply") || data.allowedActions.includes("note")) && data.allowedAudiences.length > 0 && <TicketComposer compact access={access} data={data} onSaved={saved} onStateChange={setComposer}/>}
        <Link className="text-link" href={`${ticketPaths[access.workspace]}/${data.id}`}>Volledige afhandeling, context en historie</Link>
      </div>}
    </SourceNativeDialog>
    {resolving && data && <TicketEdit access={access} data={data} options={options} edit={{kind: "status", status: "resolved"}} onClose={() => setResolving(false)} onSaved={() => {setResolving(false); saved();}}/>}
  </>;
}
