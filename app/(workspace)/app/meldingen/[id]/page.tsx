import { TicketDetailRoute, type TicketSearch } from "@/components/fieldgrid/tickets/routes";
export default function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<TicketSearch> }) { return <TicketDetailRoute workspace="tenant" params={params} searchParams={searchParams}/>; }
