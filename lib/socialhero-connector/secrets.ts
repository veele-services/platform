import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { ConnectorError } from './transport';

const domain = 'fieldgrid-socialhero-provisioning-v1';
const maxBytes = 32_768;
const invalid = () => new ConnectorError(503, 'PAIRING_UNAVAILABLE', 'De voorlopige koppeling kan niet veilig worden hersteld. Koppel de website opnieuw.');

function material(key: string, binding: string): Buffer {
  if (typeof key !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(key)
    || !key || typeof binding !== 'string' || !binding || Buffer.byteLength(binding) > 2048) throw invalid();
  const bytes = Buffer.from(key, 'base64');
  const canonical = bytes.toString('base64');
  if (![16, 24, 32].includes(bytes.length) || key !== canonical && key !== canonical.replace(/=+$/, '')) throw invalid();
  return Buffer.from(hkdfSync('sha256', bytes, domain, binding, 32));
}
function aad(binding: string): Buffer { return Buffer.from(`${domain}\u0000${binding}`); }

export function sealProvisioning(value: unknown, key: string, binding: string): string {
  try {
    const derived = material(key, binding);
    const encoded = JSON.stringify(value);
    if (encoded === undefined || Buffer.byteLength(encoded) > maxBytes) throw invalid();
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', derived, nonce);
    cipher.setAAD(aad(binding));
    const ciphertext = Buffer.concat([cipher.update(encoded, 'utf8'), cipher.final()]);
    return `v1.${nonce.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
  } catch { throw invalid(); }
}

export function openProvisioning<T>(ciphertext: string, key: string, binding: string): T {
  try {
    const derived = material(key, binding);
    if (typeof ciphertext !== 'string' || ciphertext.length > 45_000) throw invalid();
    const parts = ciphertext.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1' || !parts.slice(1).every(part => /^[A-Za-z0-9_-]+$/.test(part))) throw invalid();
    const [nonce, tag, body] = parts.slice(1).map(part => Buffer.from(part, 'base64url'));
    if (nonce.length !== 12 || tag.length !== 16 || body.length > maxBytes || parts.slice(1).some((part, index) => [nonce, tag, body][index].toString('base64url') !== part)) throw invalid();
    const decipher = createDecipheriv('aes-256-gcm', derived, nonce);
    decipher.setAAD(aad(binding));
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')) as T;
  } catch { throw invalid(); }
}
