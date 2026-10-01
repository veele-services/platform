import "server-only";
import { prepareDossierNotifications } from "@/lib/notifications/worker";

/** Source jobs enqueue the same immutable central deliveries as every adapter.
 * Provider processing is owned once by the central worker after all adapters. */
export async function processDossierReminders() {
 const prepared=await prepareDossierNotifications();
 return {claimed:typeof prepared==="number"?prepared:0,sent:0,failed:0};
}
