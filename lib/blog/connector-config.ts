import type { PairingConfiguration } from '@/lib/socialhero-connector/contract';

export const SOCIALHERO_ORIGINS = {
  staging: 'https://socialhero-staging.dgwebservices.nl',
  production: 'https://socialhero.dgwebservices.nl',
} as const;

function loopbackOrigin(value: string | undefined) {
  if (!value) throw new Error('SocialHero-testconfiguratie ontbreekt.');
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash || value !== url.origin) {
    throw new Error('SocialHero-testconfiguratie is ongeldig.');
  }
  return url.origin;
}

/** All identity comes from deployment configuration, never from a form or claim. */
export function fieldgridConnectorConfiguration(env: Record<string, string | undefined> = process.env): PairingConfiguration | null {
  const target = env.DEPLOY_TARGET ?? 'local';
  if (target === 'local') {
    if (env.FIELDGRID_SOCIALHERO_LOCAL_TEST !== '1') return null;
    return {
      siteId: 'fieldgrid', siteName: 'Fieldgrid', environment: 'staging', allowLocalTest: true,
      origin: loopbackOrigin(env.FIELDGRID_BLOG_LOCAL_ORIGIN),
      socialHeroOrigin: loopbackOrigin(env.SOCIALHERO_URL),
    };
  }
  if (target !== 'staging' && target !== 'production') throw new Error('SocialHero-omgeving is ongeldig.');
  if (!env.SOCIALHERO_URL) return null;
  if (env.SOCIALHERO_URL !== SOCIALHERO_ORIGINS[target]) throw new Error('SocialHero-server komt niet overeen met deze omgeving.');
  return {
    siteId: 'fieldgrid', siteName: 'Fieldgrid', environment: target, allowLocalTest: false,
    origin: target === 'staging' ? 'https://www.staging.fieldgrid.nl' : 'https://www.fieldgrid.nl',
    socialHeroOrigin: env.SOCIALHERO_URL,
  };
}

export function provisioningBinding(config: PairingConfiguration, attemptId: string) {
  return JSON.stringify(['fieldgrid-socialhero-v1', config.siteId, config.environment, config.origin, config.socialHeroOrigin, attemptId]);
}
