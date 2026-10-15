import 'server-only';
import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {ticketRpc} from '@/lib/tickets/rpc';
/** Existing worker, service-only bounded jobs; no fabricated tenant sessions. */
export async function processManagementSignals(){const db=createAdminClient(),compliance=z.number().int().nonnegative().parse(await ticketRpc(db,'cockpit_maintenance',{batch_size:50})),sla=z.number().int().nonnegative().parse(await ticketRpc(db,'cockpit_sla_maintenance',{batch_size:50})),finance=z.number().int().nonnegative().parse(await ticketRpc(db,'cockpit_finance_maintenance',{batch_size:50}));const reports=z.number().int().nonnegative().parse(await ticketRpc(db,'cockpit_reports_maintenance',{batch_size:10}));return compliance+sla+finance+reports}
