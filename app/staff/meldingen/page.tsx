import { TicketIndexRoute, type TicketSearch } from "@/components/fieldgrid/tickets/routes";
export default function Page({ searchParams }: { searchParams: Promise<TicketSearch> }) { return <TicketIndexRoute workspace="staff" searchParams={searchParams}/>; }
