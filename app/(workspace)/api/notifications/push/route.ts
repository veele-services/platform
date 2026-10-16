import { notificationPushPost } from "@/lib/notifications/push-device";
export async function POST(request: Request) { return notificationPushPost(request); }
