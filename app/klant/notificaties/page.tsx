import { NotificationIndexRoute, type NotificationSearch } from "@/components/fieldgrid/notifications/routes";
export default function Page({ searchParams }: { searchParams: Promise<NotificationSearch> }) { return <NotificationIndexRoute workspace="customer" searchParams={searchParams}/>; }
