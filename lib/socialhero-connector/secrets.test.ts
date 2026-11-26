import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { openProvisioning, sealProvisioning } from './secrets';
import { ConnectorError } from './transport';

const binding = 'fieldgrid/staging/773cad54-5e51-4a0e-974d-36cd14a2d807';

describe('temporary provisioning encryption', () => {
  it('round-trips structured data with a fresh nonce and no plaintext credential', () => {
    const key = randomBytes(32).toString('base64');
    const value = { accessToken: randomBytes(32).toString('base64url'), connectionId: randomBytes(16).toString('hex') };
    const first = sealProvisioning(value, key, binding);
    const second = sealProvisioning(value, key, binding);
    expect(first).not.toBe(second);
    expect(first.split('.')[1]).not.toBe(second.split('.')[1]);
    expect(first).not.toContain(value.accessToken);
    expect(openProvisioning(first, key, binding)).toEqual(value);
    expect(openProvisioning(second, key, binding)).toEqual(value);
  });

  it.each([16, 24, 32])('derives AES256 material from a valid %s-byte Next encryption key', size => {
    const key = randomBytes(size).toString('base64');
    expect(openProvisioning(sealProvisioning({ pending: true }, key, binding), key, binding)).toEqual({ pending: true });
  });

  it.each([16, 24, 32])('accepts the existing canonical unpadded %s-byte Next key format', size => {
    const key = randomBytes(size).toString('base64');
    const unpadded = key.replace(/=+$/, '');
    const value = { accessToken: randomBytes(32).toString('base64url') };
    expect(openProvisioning(sealProvisioning(value, unpadded, binding), key, binding)).toEqual(value);
    expect(openProvisioning(sealProvisioning(value, key, binding), unpadded, binding)).toEqual(value);
  });

  it('rejects a different site, environment, attempt or key using safe errors', () => {
    const key = randomBytes(32).toString('base64');
    const token = randomBytes(32).toString('base64url');
    const ciphertext = sealProvisioning({ accessToken: token }, key, binding);
    for (const [otherKey, otherBinding] of [
      [randomBytes(32).toString('base64'), binding], [key, binding.replace('fieldgrid', 'another-site')],
      [key, binding.replace('staging', 'production')], [key, `${binding}-another-attempt`],
    ]) {
      try { openProvisioning(ciphertext, otherKey, otherBinding); throw new Error('Expected decryption failure'); }
      catch (error) {
        expect(error).toBeInstanceOf(ConnectorError);
        expect((error as Error).message).not.toContain(token);
        expect((error as Error).cause).toBeUndefined();
      }
    }
  });

  it('authenticates nonce, tag, ciphertext and format', () => {
    const key = randomBytes(32).toString('base64');
    const ciphertext = sealProvisioning({ pending: true }, key, binding);
    for (const index of [1, 2, 3]) {
      const parts = ciphertext.split('.');
      const bytes = Buffer.from(parts[index], 'base64url');
      bytes[0] ^= 1;
      parts[index] = bytes.toString('base64url');
      expect(() => openProvisioning(parts.join('.'), key, binding)).toThrow(ConnectorError);
    }
    for (const altered of ['', ciphertext.replace('v1.', 'v2.'), `${ciphertext}.extra`, `${ciphertext}=`, 'v1.a.b.c', 'x'.repeat(45_001)]) {
      expect(() => openProvisioning(altered, key, binding)).toThrow(ConnectorError);
    }
  });

  it('fails closed on invalid keys, bindings, unserializable data and excessive plaintext', () => {
    const key = randomBytes(32).toString('base64');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const noncanonical = `${key.slice(0, -2)}${alphabet[alphabet.indexOf(key.at(-2)!) | 1]}=`;
    for (const invalidKey of ['', 'not a key', randomBytes(31).toString('base64'), `${key}\n`, `${key}=`, noncanonical, '_'.repeat(43), '-'.repeat(43)]) {
      expect(() => sealProvisioning({}, invalidKey, binding)).toThrow(ConnectorError);
    }
    expect(() => sealProvisioning({}, key, '')).toThrow(ConnectorError);
    expect(() => sealProvisioning(undefined, key, binding)).toThrow(ConnectorError);
    expect(() => sealProvisioning({ secret: 'x'.repeat(32_768) }, key, binding)).toThrow(ConnectorError);
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() => sealProvisioning(circular, key, binding)).toThrow(ConnectorError);
  });
});
