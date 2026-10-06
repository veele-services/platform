"use client";
import { ChevronDown } from "lucide-react";
import { ContentSection } from "../content-section";
import { TravelBadge, TravelLegCard, useTravelDay } from "../travel";
import type { WorkOrderDossier } from "@/lib/work-orders/model";

export function WorkOrderTravelCrew({ day, orderId, assignments }: { day: string; orderId: string; assignments: WorkOrderDossier["assignments"] }) {
  const travel = useTravelDay(day);
  const people = assignments.filter(assignment => !["returned", "cancelled"].includes(assignment.status));
  return <ContentSection className="wo-section" title="Reisinformatie" help="Reistijd is een planningsinschatting. Open de medewerker voor route, vervoermiddel en aankomstmarge; geregistreerde reisuren staan bij Urenregistratie.">
    {travel.error && <p role="alert">{travel.error} <button className="resource-action" onClick={travel.refresh}>Opnieuw proberen</button></p>}
    <div className="wo-travel-crew">{people.map(person => {
      const legs = travel.data?.legs.filter(leg => leg.workOrderId === orderId && leg.assignmentId === person.id) ?? [];
      const inbound = legs.find(leg => leg.direction === "before");
      return <details key={person.id} className="wo-travel-person"><summary><strong>{person.name}</strong><span>{travel.loading && !travel.data ? "Reistijd laden…" : <TravelBadge leg={inbound}/>}</span><ChevronDown size={16}/></summary><div className="wo-travel-person-details">{legs.map(leg => <TravelLegCard key={`${leg.assignmentId}:${leg.direction}:${leg.signature}`} leg={leg} timezone={travel.data!.timezone} canManage={travel.data!.canManage} onChange={travel.refresh}/>)}{!legs.length && <p>Er is nog geen route voor deze medewerker vastgelegd.</p>}</div></details>;
    })}</div>{!people.length && <p className="dossier-muted">Koppel medewerkers via Planning & personeel om hun reisdetails te tonen.</p>}
  </ContentSection>;
}
