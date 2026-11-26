import { describe, expect, it } from 'vitest';
import { fieldgridConnectorConfiguration, provisioningBinding, SOCIALHERO_ORIGINS } from './connector-config';
import { claimPayload, claimResponse, verifyResponse } from '@/lib/socialhero-connector/contract';
import { randomBytes, randomUUID } from 'node:crypto';

describe('Fieldgrid pairing deployment identity', () => {
  it('requires explicit per-environment configuration and never takes production as a staging fallback', () => {
    expect(fieldgridConnectorConfiguration({ DEPLOY_TARGET: 'staging' })).toBeNull();
    expect(() => fieldgridConnectorConfiguration({ DEPLOY_TARGET: 'staging', SOCIALHERO_URL: SOCIALHERO_ORIGINS.production })).toThrow();
    const staging = fieldgridConnectorConfiguration({ DEPLOY_TARGET: 'staging', SOCIALHERO_URL: SOCIALHERO_ORIGINS.staging })!;
    expect(staging).toMatchObject({ siteId: 'fieldgrid', environment: 'staging', origin: 'https://www.staging.fieldgrid.nl', allowLocalTest: false });
    const production = fieldgridConnectorConfiguration({ DEPLOY_TARGET: 'production', SOCIALHERO_URL: SOCIALHERO_ORIGINS.production })!;
    expect(production.origin).toBe('https://www.fieldgrid.nl');
    for (const value of ['https://socialhero-staging.dgwebservices.nl/', 'https://socialhero-staging.dgwebservices.nl@127.0.0.1', 'http://127.0.0.1:3300', SOCIALHERO_ORIGINS.staging + '?next=invalid']) {
      expect(() => fieldgridConnectorConfiguration({ DEPLOY_TARGET: 'staging', SOCIALHERO_URL: value, FIELDGRID_SOCIALHERO_LOCAL_TEST: '1' })).toThrow();
    }
  });
  it('permits only explicit isolated loopback tests outside staging and production', () => {
    const local = { DEPLOY_TARGET: 'local', FIELDGRID_SOCIALHERO_LOCAL_TEST: '1', FIELDGRID_BLOG_LOCAL_ORIGIN: 'http://127.0.0.1:3307', SOCIALHERO_URL: 'http://127.0.0.1:59424' };
    expect(fieldgridConnectorConfiguration(local)).toMatchObject({ allowLocalTest: true, origin: local.FIELDGRID_BLOG_LOCAL_ORIGIN });
    expect(fieldgridConnectorConfiguration({ ...local, FIELDGRID_SOCIALHERO_LOCAL_TEST: undefined })).toBeNull();
    for (const value of ['http://169.254.169.254', 'http://localhost:59424/path', 'https://socialhero.dgwebservices.nl']) {
      expect(() => fieldgridConnectorConfiguration({ ...local, SOCIALHERO_URL: value })).toThrow();
    }
  });
  it('binds encrypted temporary state to the exact deployment, provider and server attempt', () => {
    const config = fieldgridConnectorConfiguration({ DEPLOY_TARGET: 'production', SOCIALHERO_URL: SOCIALHERO_ORIGINS.production })!;
    const attemptId = randomUUID();
    expect(provisioningBinding(config, attemptId)).not.toBe(provisioningBinding(config, randomUUID()));
    expect(provisioningBinding(config, attemptId)).not.toBe(provisioningBinding({ ...config, origin: 'https://www.staging.fieldgrid.nl' }, attemptId));
    const code = randomBytes(32).toString('base64url');
    expect(claimPayload(config, code, attemptId)).toEqual({ code, attemptId, siteId: 'fieldgrid', origin: config.origin, environment: 'production', contractVersion: 1 });
    expect(() => claimResponse.parse({ connectionId: randomUUID(), destinationId: randomUUID(), accessToken: code, expiresAt: new Date(Date.now() + 600_000).toISOString(), unsafe: 'ignored' })).toThrow();
    expect(() => verifyResponse.parse({ connectionId: randomUUID(), status: 'pending' })).toThrow();
  });
});
