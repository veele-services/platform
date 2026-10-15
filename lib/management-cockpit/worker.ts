import 'server-only';
import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {ticketRpc} from '@/lib/tickets/rpc';
/** Existing worker, service-only bounded jobs; no fabricated tenant sessions. */
export async function processManagementSignals(){return z.number().int().nonnegative().parse(await ticketRpc(createAdminClient(),'cockpit_maintenance',{batch_size:50}))}
