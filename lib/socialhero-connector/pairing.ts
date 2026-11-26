import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { claimPayload, claimResponse, pairingCode, verifyPath, verifyResponse, type PairingConfiguration } from './contract';
import { ConnectorError, requestSocialHero } from './transport';
import { openProvisioning, sealProvisioning } from './secrets';

export type PairingStatus = {
  state: 'unpaired' | 'claiming' | 'pending' | 'active' | 'rejected' | 'expired' | 'disconnected';
  attemptId?: string | null;
  connectionId?: string | null;
  destinationId?: string | null;
  allowPublish?: boolean;
  allowDraft?: boolean;
  policyConfigured?: boolean;
  policyUpdatedAt?: string | null;
  policyUpdatedBy?: string | null;
  origin?: string | null;
  expiresAt?: string | null;
  lastCheckedAt?: string | null;
};
export type ProvisioningRecord = PairingStatus & {
  attemptId: string;
  encryptedCode: string | null;
  encryptedToken: string | null;
};
export type PairingPersistence = {
  write(operation: string, payload: Record<string, unknown>): Promise<PairingStatus>;
  secret(attemptId: string): Promise<ProvisioningRecord | null>;
};
type Dependencies = {
  binding(config: PairingConfiguration, attemptId: string): string;
  request?: typeof requestSocialHero;
  now?: () => number;
};

const terminal = new Set(['INVALID_PAIRING_CODE', 'PAIRING_EXPIRED', 'DESTINATION_MISMATCH', 'INVALID_CREDENTIAL', 'PERMISSION_DENIED']);
const unavailable = () => new ConnectorError(503, 'PAIRING_UNAVAILABLE', 'De koppeling kon nog niet worden bevestigd. Probeer de verificatie opnieuw.');

/** Durable claim identity and encrypted code make a lost claim response resumable. */
export async function startPairing(config: PairingConfiguration, encryptionKey: string, code: unknown, permissions: { allowDraft: boolean; allowPublish: boolean }, store: PairingPersistence, deps: Dependencies) {
  const parsed = pairingCode.safeParse(code);
  if (!parsed.success) throw new ConnectorError(400, 'INVALID_PAIRING_CODE', 'Gebruik de volledige geldige koppelcode uit SocialHero.');
  if (typeof permissions.allowDraft !== 'boolean' || typeof permissions.allowPublish !== 'boolean') throw new ConnectorError(400, 'PERMISSION_DENIED', 'Bevestig de toestemmingen voor deze koppeling.');
  const attemptId = randomUUID();
  const pending = await store.write('pair.begin', {
    attemptId, origin: config.origin, allowDraft: permissions.allowDraft, allowPublish: permissions.allowPublish,
    codeHash: createHash('sha256').update(parsed.data).digest('hex'),
    encryptedCode: sealProvisioning({ code: parsed.data }, encryptionKey, deps.binding(config, attemptId)),
  });
  return resumePairing(config, encryptionKey, pending, store, deps);
}

/** Persist token hash and pending credential before SocialHero calls capabilities. */
export async function resumePairing(config: PairingConfiguration, encryptionKey: string, status: PairingStatus, store: PairingPersistence, deps: Dependencies) {
  if (status.state === 'active') return status;
  if (!status.attemptId || !['claiming', 'pending'].includes(status.state)) {
    throw new ConnectorError(410, 'PAIRING_EXPIRED', 'Deze koppelactie is niet meer beschikbaar. Vraag een nieuwe code aan.');
  }
  const attemptId = status.attemptId;
  const send = deps.request ?? requestSocialHero;
  const now = deps.now ?? Date.now;
  let connectionId = status.connectionId;
  try {
    let record = await store.secret(attemptId);
    if (record?.state === 'active' && record.origin === config.origin) return record;
    if (!record || !['claiming', 'pending'].includes(record.state) || record.origin !== config.origin) {
      throw new ConnectorError(410, 'PAIRING_EXPIRED', 'Deze koppelactie is verlopen of vervangen. Vraag een nieuwe code aan.');
    }
    if (!record.expiresAt || Date.parse(record.expiresAt) <= now()) {
      throw new ConnectorError(410, 'PAIRING_EXPIRED', 'Deze koppelactie is verlopen. Vraag een nieuwe code aan.');
    }
    const binding = deps.binding(config, attemptId);
    if (record.state === 'claiming') {
      if (!record.encryptedCode) throw unavailable();
      const saved = openProvisioning<{ code: string }>(record.encryptedCode, encryptionKey, binding);
      const answer = await send(config.socialHeroOrigin, '/api/integrations/blog/v1/pairings/claim', claimPayload(config, saved.code, attemptId), undefined, { allowLocalTest: config.allowLocalTest });
      const claim = claimResponse.safeParse(answer);
      if (!claim.success || Date.parse(claim.data.expiresAt) <= now() || Date.parse(claim.data.expiresAt) > now() + 630_000) throw unavailable();
      connectionId = claim.data.connectionId;
      await store.write('pair.store', {
        attemptId, connectionId, destinationId: claim.data.destinationId, origin: config.origin,
        tokenHash: createHash('sha256').update(claim.data.accessToken).digest('hex'), expiresAt: claim.data.expiresAt,
        encryptedToken: sealProvisioning({ accessToken: claim.data.accessToken }, encryptionKey, binding),
      });
      record = await store.secret(attemptId);
    }
    if (record?.state === 'active' && record.origin === config.origin) return record;
    if (!record || record.state !== 'pending' || !record.encryptedToken || !record.connectionId || !record.expiresAt || Date.parse(record.expiresAt) <= now()) {
      throw new ConnectorError(410, 'PAIRING_EXPIRED', 'Deze koppelactie is verlopen of vervangen. Vraag een nieuwe code aan.');
    }
    connectionId = record.connectionId;
    const saved = openProvisioning<{ accessToken: string }>(record.encryptedToken, encryptionKey, binding);
    const answer = await send(config.socialHeroOrigin, verifyPath(connectionId), null, saved.accessToken, { allowLocalTest: config.allowLocalTest });
    const verified = verifyResponse.safeParse(answer);
    if (!verified.success || verified.data.connectionId !== connectionId) {
      throw new ConnectorError(409, 'DESTINATION_MISMATCH', 'De bevestiging hoort niet bij deze koppeling. Vraag een nieuwe code aan.');
    }
    return await store.write('pair.activate', { attemptId, connectionId });
  } catch (error) {
    if (error instanceof ConnectorError && terminal.has(error.code)) {
      // Compare-and-set in storage prevents an old response from cancelling a newer attempt.
      await store.write('pair.reject', { attemptId, ...(connectionId ? { connectionId } : {}) });
    }
    throw error;
  }
}
