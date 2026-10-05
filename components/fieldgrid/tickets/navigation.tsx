"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Headset, MessageSquareText } from "lucide-react";
import { loadTicketAccess } from "@/app/tickets/actions";
import { ticketPaths, type TicketWorkspace } from "@/lib/tickets/model";
import "./tickets.css";

export function TicketNavigation({ workspace, current, actorKey, card = false }: { workspace: "staff" | "tenant" | "platform"; current?: string; actorKey: string; card?: boolean }) {
  const [available, setAvailable] = useState<TicketWorkspace[]>([]);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const contexts: TicketWorkspace[] = workspace === "tenant" ? ["tenant", "support"] : [workspace];
      const results = await Promise.all(contexts.map(context => loadTicketAccess(context)));
      if (live) setAvailable(results.flatMap((result, index) => result.ok && (result.data.allowed || result.data.canConfigure || result.data.canDelegate) ? [contexts[index]] : []));
    };
    void load();
    window.addEventListener("focus", load);
    return () => { live = false; window.removeEventListener("focus", load); };
  }, [workspace, actorKey]);
  const links = workspace === "staff" ? [{ workspace: "staff" as const, name: "Mijn meldingen", view: "meldingen" }] : workspace === "platform" ? [{ workspace: "platform" as const, name: "Supportdesk", view: "support" }] : [{ workspace: "tenant" as const, name: "Meldingen", view: "meldingen" }, { workspace: "support" as const, name: "Fieldgrid-support", view: "support" }];
  const visible = links.filter(link => available.includes(link.workspace));
  if (!visible.length) return null;
  const content = visible.map(link => <Link aria-label={link.name} title={link.name} key={link.workspace} href={ticketPaths[link.workspace]} prefetch={false} className={`ticket-nav-link${current === link.view ? " active" : ""}`} aria-current={current === link.view ? "page" : undefined}>{link.workspace === "support" || link.workspace === "platform" ? <Headset size={18}/> : <MessageSquareText size={18}/>}<span>{link.name}</span></Link>);
  return card ? <section className="staff-panel"><h2>Hulp & meldingen</h2>{content}</section> : <>{content}</>;
}
