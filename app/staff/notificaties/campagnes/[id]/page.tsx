import { NotificationCampaignRoute } from "@/components/fieldgrid/notifications/routes";
export default function Page({ params }: { params: Promise<{ id: string }> }) { return <NotificationCampaignRoute workspace="staff" params={params}/>; }
