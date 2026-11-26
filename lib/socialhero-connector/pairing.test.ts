import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { startPairing, resumePairing, type PairingPersistence, type PairingStatus, type ProvisioningRecord } from './pairing';
import { ConnectorError } from './transport';
import { provisioningBinding } from '@/lib/blog/connector-config';
import type { PairingConfiguration } from './contract';

const config: PairingConfiguration = {
  siteId: 'fieldgrid', siteName: 'Fieldgrid', origin: 'https://www.staging.fieldgrid.nl',
  environment: 'staging', socialHeroOrigin: 'https://socialhero-staging.dgwebservices.nl', allowLocalTest: false,
};

function fixture() {
  const key = randomBytes(32).toString('base64'), code = randomBytes(32).toString('base64url');
  const token = randomBytes(32).toString('base64url'), connectionId = randomUUID(), destinationId = randomUUID();
  let record: ProvisioningRecord | null = null;
  let codeHash: unknown;
  const operations: string[] = [];
  const safe = (): PairingStatus => ({
    state: record?.state ?? 'unpaired', attemptId: record?.attemptId,
    connectionId: record?.connectionId, destinationId: record?.destinationId,
    origin: record?.origin, expiresAt: record?.expiresAt, allowPublish: false,
  });
  const store: PairingPersistence = {
    async write(operation, payload) {
      operations.push(operation);
      if (operation === 'pair.begin') {
        if (!record || codeHash !== payload.codeHash) {
          codeHash = payload.codeHash;
          record = { state: 'claiming', attemptId: String(payload.attemptId), origin: String(payload.origin), expiresAt: new Date(Date.now() + 600_000).toISOString(), encryptedCode: String(payload.encryptedCode), encryptedToken: null };
        }
      } else if (operation === 'pair.store' && record) {
        record = { ...record, state: 'pending', connectionId: String(payload.connectionId), destinationId: String(payload.destinationId), encryptedCode: null, encryptedToken: String(payload.encryptedToken), expiresAt: String(payload.expiresAt) };
      } else if (operation === 'pair.activate' && record) {
        record = { ...record, state: 'active', encryptedCode: null, encryptedToken: null, expiresAt: null };
      } else if (operation === 'pair.reject' && record && record.state !== 'active') {
        record = { ...record, state: 'rejected', encryptedCode: null, encryptedToken: null };
      }
      return safe();
    },
    secret: async () => record,
  };
  const claim = () => ({ connectionId, destinationId, accessToken: token, expiresAt: new Date(Date.now() + 600_000).toISOString() });
  return { key, code, token, connectionId, destinationId, store, safe, operations, claim, record: () => record };
}

describe('durable two-stage website pairing', () => {
  it('commits pending authority before verification and discards temporary secrets on activation', async () => {
    const f = fixture();
    const request = vi.fn(async (_origin: string, path: string, body: unknown, token?: string) => {
      if (path.endsWith('/claim')) {
        expect(f.record()?.state).toBe('claiming');
        expect(JSON.stringify(f.record())).not.toContain(f.code);
        expect(body).toMatchObject({ siteId: config.siteId, environment: 'staging', origin: config.origin, contractVersion: 1 });
        return f.claim();
      }
      expect(f.record()?.state).toBe('pending');
      expect(f.operations).toEqual(['pair.begin', 'pair.store']);
      expect(token).toBe(f.token);
      expect(JSON.stringify(f.record())).not.toContain(f.token);
      return { connectionId: f.connectionId, status: 'verified' };
    });
    const result = await startPairing(config, f.key, f.code, { allowDraft: true, allowPublish: false }, f.store, { binding: provisioningBinding, request });
    expect(result.state).toBe('active');
    expect(result.allowPublish).toBe(false);
    expect(f.record()?.encryptedCode).toBeNull();
    expect(f.record()?.encryptedToken).toBeNull();
    expect(JSON.stringify(result)).not.toContain(f.token);
  });

  it('reuses the durable server attempt and original claim after losing the claim response', async () => {
    const f = fixture();
    const attempts: string[] = [];
    let lose = true;
    const request = vi.fn(async (_origin: string, path: string, body: unknown) => {
      if (path.endsWith('/claim')) {
        attempts.push((body as { attemptId: string }).attemptId);
        if (lose) { lose = false; throw new ConnectorError(503, 'PAIRING_UNAVAILABLE', 'Tijdelijk onbereikbaar.'); }
        return f.claim();
      }
      return { connectionId: f.connectionId, status: 'verified' };
    });
    await expect(startPairing(config, f.key, f.code, { allowDraft: true, allowPublish: false }, f.store, { binding: provisioningBinding, request })).rejects.toMatchObject({ status: 503 });
    expect(f.safe().state).toBe('claiming');
    // A new request instance resumes without browser code or an in-memory token.
    const result = await resumePairing(config, f.key, f.safe(), f.store, { binding: provisioningBinding, request });
    expect(result.state).toBe('active');
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toBe(attempts[0]);
  });

  it('retries verification without claiming again after a lost verified response', async () => {
    const f = fixture();
    let lose = true;
    const request = vi.fn(async (_origin: string, path: string) => {
      if (path.endsWith('/claim')) return f.claim();
      if (lose) { lose = false; throw new ConnectorError(503, 'PAIRING_UNAVAILABLE', 'Tijdelijk onbereikbaar.'); }
      return { connectionId: f.connectionId, status: 'verified' };
    });
    await expect(startPairing(config, f.key, f.code, { allowDraft: true, allowPublish: false }, f.store, { binding: provisioningBinding, request })).rejects.toMatchObject({ status: 503 });
    expect(f.safe().state).toBe('pending');
    expect(f.record()?.encryptedCode).toBeNull();
    const result = await resumePairing(config, f.key, f.safe(), f.store, { binding: provisioningBinding, request });
    expect(result.state).toBe('active');
    expect(request.mock.calls.filter(call => call[1].endsWith('/claim'))).toHaveLength(1);
    expect(request.mock.calls.filter(call => call[1].endsWith('/verify'))).toHaveLength(2);
  });

  it('rejects a mismatched verification receipt and purges the rejected pending credential', async () => {
    const f = fixture();
    const request = vi.fn(async (_origin: string, path: string) => path.endsWith('/claim') ? f.claim() : { connectionId: randomUUID(), status: 'verified' });
    await expect(startPairing(config, f.key, f.code, { allowDraft: true, allowPublish: false }, f.store, { binding: provisioningBinding, request })).rejects.toMatchObject({ code: 'DESTINATION_MISMATCH' });
    expect(f.safe().state).toBe('rejected');
    expect(f.record()?.encryptedToken).toBeNull();
    expect(f.operations).not.toContain('pair.activate');
  });

  it('never calls a provider for an invalid code or a provision that has already expired', async () => {
    const f = fixture(), request = vi.fn();
    await expect(startPairing(config, f.key, 'incomplete', { allowDraft: true, allowPublish: false }, f.store, { binding: provisioningBinding, request })).rejects.toMatchObject({ code: 'INVALID_PAIRING_CODE' });
    expect(f.operations).toHaveLength(0);
    await expect(resumePairing(config, f.key, { state: 'expired', attemptId: randomUUID() }, f.store, { binding: provisioningBinding, request })).rejects.toMatchObject({ status: 410 });
    expect(request).not.toHaveBeenCalled();
  });
});
