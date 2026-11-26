import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectionRequest, ConnectionRequestError, parseConnection } from '@/components/fieldgrid/blog-connector/client';

const connection = {
  status: 'active', environment: 'staging', siteId: 'fieldgrid', siteName: 'Fieldgrid',
  origin: 'https://staging.fieldgrid.nl', socialHeroOrigin: 'https://socialhero.test',
  allowDraft: true, allowPublish: false, scopes: ['read', 'draft'], connectionId: 'connection-1',
  lastCheckedAt: '2026-11-26T10:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('browser connection contract', () => {
  it('retains only the documented non-secret status fields', () => {
    const parsed = parseConnection({ ...connection, code: 'do-not-retain', token: 'do-not-retain', credentialHash: 'do-not-retain', pendingToken: { value: 'do-not-retain' } });
    expect(parsed).toEqual(connection);
    expect(JSON.stringify(parsed)).not.toContain('do-not-retain');
  });

  it('rejects untrusted links, incomplete metadata and unknown states', () => {
    for (const socialHeroOrigin of ['javascript:alert(1)', 'https://user:password@socialhero.test', 'https://socialhero.test/claim?code=hidden', 'http://socialhero.test']) {
      expect(parseConnection({ ...connection, socialHeroOrigin })).toBeNull();
    }
    expect(parseConnection({ ...connection, status: 'verified' })).toBeNull();
    expect(parseConnection({ ...connection, origin: '' })).toBeNull();
    expect(parseConnection({ ...connection, allowPublish: undefined })).toBeNull();
    expect(parseConnection({ ...connection, allowDraft: undefined })).toBeNull();
  });

  it('limits displayed scopes and dates to their supported formats', () => {
    expect(parseConnection({ ...connection, scopes: ['read', 'draft', 'read', 'admin', { token: 'hidden' }], expiresAt: 'not-a-date', lastCheckedAt: 'not-a-date' })).toEqual({
      ...connection, scopes: ['read', 'draft'], lastCheckedAt: undefined,
    });
  });

  it('supports unconfigured status without a provider origin and isolated loopback fixtures', () => {
    expect(parseConnection({ ...connection, status: 'unconfigured', socialHeroOrigin: null, origin: 'http://127.0.0.1:3307' })).toMatchObject({ status: 'unconfigured', socialHeroOrigin: null });
    expect(parseConnection({ ...connection, status: 'unconfigured', socialHeroOrigin: null, origin: 'http://www.localhost:3000' })).toMatchObject({ status: 'unconfigured', origin: 'http://www.localhost:3000' });
  });

  it('reads status without caching or following redirects', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ connection }));
    vi.stubGlobal('fetch', fetcher);
    expect(await connectionRequest()).toEqual(connection);
    expect(fetcher).toHaveBeenCalledWith('/api/blog-admin/connection', expect.objectContaining({ method: 'GET', cache: 'no-store', credentials: 'same-origin', redirect: 'error' }));
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty('body');
  });

  it('sends a pairing code only in the authenticated POST body', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ connection: { ...connection, status: 'pending' } }));
    vi.stubGlobal('fetch', fetcher);
    await connectionRequest({ action: 'pair', code: 'fixture-one-time-code', allowDraft: true, allowPublish: true });
    expect(fetcher).toHaveBeenCalledWith('/api/blog-admin/connection', expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'pair', code: 'fixture-one-time-code', allowDraft: true, allowPublish: true }), credentials: 'same-origin' }));
    expect(fetcher.mock.calls[0][0]).not.toContain('fixture-one-time-code');
  });

  it('preserves an existing explicit opt-out instead of replacing it with new-connection defaults', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ connection: { ...connection, status: 'disconnected', allowDraft: false, allowPublish: false, policyConfigured: true } })));
    expect(await connectionRequest()).toMatchObject({ allowDraft: false, allowPublish: false, policyConfigured: true });
  });

  it('sends draft and automatic-publication permissions independently', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ connection: { ...connection, allowDraft: false, allowPublish: true } }));
    vi.stubGlobal('fetch', fetcher);
    await connectionRequest({ action: 'policy', allowDraft: false, allowPublish: true });
    expect(fetcher.mock.calls[0][1].body).toBe(JSON.stringify({ action: 'policy', allowDraft: false, allowPublish: true }));
  });

  it('uses controlled error copy and strips secret fields from recoverable status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'PAIRING_EXPIRED', message: 'provider raw credential=must-never-render', connection: { ...connection, status: 'expired', token: 'must-never-render' } }, { status: 410 })));
    const error = await connectionRequest({ action: 'verify' }).catch(value => value);
    expect(error).toBeInstanceOf(ConnectionRequestError);
    expect(error).toMatchObject({ code: 'PAIRING_EXPIRED', clearCode: true, retryable: false, connection: { status: 'expired' } });
    expect(error.message).toContain('verlopen');
    expect(JSON.stringify(error)).not.toContain('must-never-render');
    expect(error.message).not.toContain('provider raw');
  });

  it('keeps a temporary error retryable and respects the bounded Retry-After', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'RATE_LIMITED' }, { status: 429, headers: { 'Retry-After': '1200' } })));
    await expect(connectionRequest()).rejects.toMatchObject({ retryable: true, clearCode: false, retryAfter: 600 });
  });

  it('does not surface unknown provider errors or malformed successful payloads', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ code: 'raw-secret-provider-error', message: 'raw-secret-provider-message' }, { status: 502 })).mockResolvedValueOnce(Response.json({ credential: 'raw-secret-provider-message' }));
    vi.stubGlobal('fetch', fetcher);
    await expect(connectionRequest()).rejects.toMatchObject({ code: 'UNKNOWN_ERROR', retryable: true, message: 'Deze handeling kon niet worden afgerond. Vernieuw de status en probeer het opnieuw.' });
    await expect(connectionRequest()).rejects.toMatchObject({ code: 'INVALID_RESPONSE', retryable: true });
    expect(new ConnectionRequestError('constructor', 500)).toMatchObject({ code: 'UNKNOWN_ERROR', retryable: true });
  });

  it('provides safe retry feedback after a network failure while preserving aborts', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('raw network credential')).mockRejectedValueOnce(abort));
    await expect(connectionRequest()).rejects.toMatchObject({ code: 'NETWORK_ERROR', retryable: true, clearCode: false });
    await expect(connectionRequest()).rejects.toBe(abort);
  });
});
