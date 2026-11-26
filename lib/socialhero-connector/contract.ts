import { z } from 'zod';

// Shared v1 wire validation. Storage and CMS operations belong to the adapter.
export const pairingCode = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const pairingIdentity = z.string().uuid();
export const claimResponse = z.object({
  connectionId: pairingIdentity,
  destinationId: pairingIdentity,
  accessToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();
export const verifyResponse = z.object({ connectionId: pairingIdentity, status: z.literal('verified') }).strict();
export const draftRequest = z.object({
  baseRevision: z.number().int().positive().nullable(),
  type: z.enum(['blog', 'article']), locale: z.string().min(1).max(25),
  title: z.string().trim().min(1).max(180),
  content: z.object({ format: z.literal('markdown'), body: z.string().max(400_000) }),
  hero: z.object({
    assetId: z.string().uuid(), alt: z.string().trim().min(1).max(240),
    focalPoint: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  }).nullable().optional(),
}).passthrough();
export type ConnectorScope = 'read' | 'draft' | 'publish';
export type CredentialState = 'pending' | 'active';
export type ConnectionState = 'disconnected' | 'pending' | 'active' | 'expired' | 'rejected';

export type PairingConfiguration = {
  siteId: string;
  siteName: string;
  origin: string;
  environment: 'staging' | 'production';
  socialHeroOrigin: string;
  allowLocalTest: boolean;
};

export function claimPayload(config: PairingConfiguration, code: string, attemptId: string) {
  return {
    code: pairingCode.parse(code), attemptId: pairingIdentity.parse(attemptId),
    siteId: config.siteId, origin: config.origin, environment: config.environment, contractVersion: 1 as const,
  };
}

export function verifyPath(connectionId: string) {
  return `/api/integrations/blog/v1/pairings/${pairingIdentity.parse(connectionId)}/verify`;
}
