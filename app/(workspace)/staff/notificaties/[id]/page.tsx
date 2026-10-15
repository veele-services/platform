import { NotificationDetailRoute } from "@/components/fieldgrid/notifications/routes";
export default function Page({ params }: { params: Promise<{ id: string }> }) { return <NotificationDetailRoute workspace="staff" params={params}/>; }
