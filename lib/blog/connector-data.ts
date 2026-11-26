import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ticketRpc } from '@/lib/tickets/rpc';
import type { PairingStatus, ProvisioningRecord } from '@/lib/socialhero-connector/pairing';
import { blogEnvironment } from './origin';
import type { BlogCredential } from './auth';

type Payload = Record<string, unknown>;
type EditorClient = Awaited<ReturnType<typeof createClient>>;
const scope = (payload: Payload) => ({ ...payload, siteId: 'fieldgrid', environment: blogEnvironment() });

export async function connectorAdminRead(db: EditorClient): Promise<PairingStatus> {
  return await ticketRpc(db, 'fieldgrid_blog_connector_admin_read', { operation: 'status', payload: scope({}) }) as PairingStatus;
}
export async function connectorAdminWrite(db: EditorClient, operation: string, payload: Payload): Promise<PairingStatus> {
  return await ticketRpc(db, 'fieldgrid_blog_connector_admin_write', { operation, payload: scope(payload) }) as PairingStatus;
}
/** Called only after current editor authorization; this result never crosses a response boundary. */
export async function connectorSecret(attemptId: string): Promise<ProvisioningRecord | null> {
  return await ticketRpc(createAdminClient(), 'fieldgrid_blog_connector_server_read', { operation: 'pair.secret', payload: scope({ attemptId }) }) as ProvisioningRecord | null;
}
export async function connectorRead<T>(credential: BlogCredential, operation: string, payload: Payload = {}): Promise<T> {
  return await ticketRpc(createAdminClient(), 'fieldgrid_blog_connector_read', { operation, payload: { ...payload, credentialId: credential.id, tokenHash: credential.tokenHash } }) as T;
}
export async function connectorWrite<T>(credential: BlogCredential, operation: string, payload: Payload = {}): Promise<T> {
  return await ticketRpc(createAdminClient(), 'fieldgrid_blog_connector_write', { operation, payload: { ...payload, credentialId: credential.id, tokenHash: credential.tokenHash } }) as T;
}

export async function purgeConnectorProvisioning() {
  return ticketRpc(createAdminClient(), 'fieldgrid_blog_connector_server_read', { operation: 'purge', payload: scope({}) });
}
