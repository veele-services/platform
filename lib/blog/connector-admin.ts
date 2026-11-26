import 'server-only';
import { randomUUID } from 'node:crypto';
import { readBoundedJson } from '@/lib/http/request-body';
import { getServerEnv } from '@/lib/env/server';
import { startPairing, resumePairing, type PairingStatus } from '@/lib/socialhero-connector/pairing';
import { ConnectorError } from '@/lib/socialhero-connector/transport';
import type { createClient } from '@/lib/supabase/server';
import { connectorAdminRead, connectorAdminWrite, connectorSecret } from './connector-data';
import { fieldgridConnectorConfiguration, provisioningBinding } from './connector-config';
import { requireSameOrigin } from './auth';
import { failure, reply } from './http';
import { blogEnvironment, blogOrigin } from './origin';
import { asRecord, BlogError } from './validation';

type EditorClient = Awaited<ReturnType<typeof createClient>>;

function configuration() {
  try { return fieldgridConnectorConfiguration(); }
  catch { return null; } // Local revocation stays available after a config error.
}

/** Explicit projection: no ciphertext, token/hash, code or provider body can escape. */
function safeConnection(state: PairingStatus, configured: boolean) {
  const config = configuration();
  const status = !configured ? 'unconfigured' : state.state === 'unpaired' ? 'disconnected' : state.state === 'claiming' ? 'pending' : state.state;
  return {
    status, siteId: 'fieldgrid', siteName: 'Fieldgrid', environment: blogEnvironment(),
    origin: blogOrigin(), socialHeroOrigin: config?.socialHeroOrigin ?? null,
    allowDraft: state.allowDraft ?? true, allowPublish: state.allowPublish ?? true,
    policyConfigured: state.policyConfigured === true,
    policyUpdatedAt: state.policyUpdatedAt ?? null, policyUpdatedBy: state.policyUpdatedBy ?? null,
    scopes: state.state === 'active' ? ['read', ...(state.allowDraft ? ['draft'] : []), ...(state.allowPublish ? ['publish'] : [])] : state.state === 'pending' ? ['read'] : [],
    connectionId: state.connectionId ?? null, destinationId: state.destinationId ?? null,
    expiresAt: state.expiresAt ?? null, lastCheckedAt: state.lastCheckedAt ?? null,
  };
}

export async function blogConnectorAdmin(request: Request, db: EditorClient) {
  const requestId = randomUUID();
  try {
    let state = await connectorAdminRead(db);
    const config = configuration();
    const key = getServerEnv().NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
    const configured = Boolean(config && key);
    if (request.method === 'GET') return reply({ connection: safeConnection(state, configured) }, 200, { 'x-request-id': requestId });
    if (request.method !== 'POST') throw new BlogError(404, 'NOT_FOUND', 'Route niet gevonden.');
    requireSameOrigin(request);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BlogError(415, 'VALIDATION_ERROR', 'Gebruik application/json.');
    const body = asRecord(await readBoundedJson(request, 16_384));
    if (body.action === 'disconnect') {
      state = await connectorAdminWrite(db, 'pair.disconnect', {});
    } else if (body.action === 'policy') {
      if (typeof body.allowPublish !== 'boolean') throw new BlogError(400, 'VALIDATION_ERROR', 'Kies of SocialHero mag publiceren.');
      if (body.allowDraft !== undefined && typeof body.allowDraft !== 'boolean') throw new BlogError(400, 'VALIDATION_ERROR', 'Kies of SocialHero concepten mag aanleveren.');
      if (body.allowPublish && !configured) throw new ConnectorError(503, 'PAIRING_UNAVAILABLE', 'Stel de SocialHero-server in voordat publiceren wordt toegestaan.');
      state = await connectorAdminWrite(db, 'policy', { connectionId: state.connectionId, allowPublish: body.allowPublish, ...(typeof body.allowDraft === 'boolean' ? { allowDraft: body.allowDraft } : {}) });
    } else if (body.action === 'check') {
      // After activation only the token hash remains. Check the local authority;
      // SocialHero performs its own authenticated website check from its UI.
      state = await connectorAdminWrite(db, 'check', { connectionId: state.connectionId });
    } else if (body.action === 'pair' || body.action === 'verify') {
      if (!config || !key) throw new ConnectorError(503, 'PAIRING_UNAVAILABLE', 'De SocialHero-koppeling is voor deze omgeving nog niet ingesteld.');
      const persistence = {
        write: (operation: string, payload: Record<string, unknown>) => connectorAdminWrite(db, operation, payload),
        secret: connectorSecret,
      };
      state = body.action === 'pair'
        ? await startPairing(config, key, body.code, permissions(body), persistence, { binding: provisioningBinding })
        : await resumePairing(config, key, state, persistence, { binding: provisioningBinding });
    } else {
      throw new BlogError(400, 'VALIDATION_ERROR', 'Kies koppelen, controleren, hervatten of ontkoppelen.');
    }
    return reply({ connection: safeConnection(state, configured) }, 200, { 'x-request-id': requestId });
  } catch (error) {
    return failure(error, requestId);
  }
}

function permissions(body: Record<string, unknown>) {
  if (typeof body.allowDraft !== 'boolean' || typeof body.allowPublish !== 'boolean') throw new BlogError(400, 'VALIDATION_ERROR', 'Bevestig de getoonde toestemmingen voor concepten en automatisch publiceren.');
  return { allowDraft: body.allowDraft, allowPublish: body.allowPublish };
}
