export type ConnectionStatus = 'unconfigured' | 'disconnected' | 'pending' | 'active' | 'expired' | 'rejected';
export type ConnectionScope = 'read' | 'draft' | 'publish';
export type BlogConnection = {
  status: ConnectionStatus;
  environment: string;
  siteId: string;
  siteName: string;
  origin: string;
  socialHeroOrigin: string | null;
  allowDraft: boolean;
  allowPublish: boolean;
  policyConfigured?: boolean;
  policyUpdatedAt?: string;
  policyUpdatedBy?: string;
  scopes: ConnectionScope[];
  connectionId?: string;
  destinationId?: string;
  expiresAt?: string;
  lastCheckedAt?: string;
};
export type ConnectionAction = { action: 'pair'; code: string; allowDraft: boolean; allowPublish: boolean } | { action: 'verify' | 'check' | 'disconnect' } | { action: 'policy'; allowDraft: boolean; allowPublish: boolean };

const statuses = new Set<ConnectionStatus>(['unconfigured', 'disconnected', 'pending', 'active', 'expired', 'rejected']);
const scopes = new Set<ConnectionScope>(['read', 'draft', 'publish']);
const errors: Record<string, { message: string; retryable?: boolean; clearCode?: boolean }> = {
  INVALID_PAIRING_CODE: { message: 'Deze koppelcode is ongeldig of al gebruikt. Maak een nieuwe code aan in SocialHero.', clearCode: true },
  PAIRING_EXPIRED: { message: 'De koppelcode of voorlopige koppeling is verlopen. Maak een nieuwe code aan in SocialHero.', clearCode: true },
  DESTINATION_MISMATCH: { message: 'Deze code hoort bij een andere website of omgeving. Maak in SocialHero een code aan voor de website en omgeving op deze pagina.', clearCode: true },
  PAIRING_IN_PROGRESS: { message: 'De koppeling wacht nog op bevestiging. Hervat de verificatie om verder te gaan.', retryable: true },
  INVALID_CREDENTIAL: { message: 'De koppeling heeft geen geldige toegang meer. Koppel de website opnieuw.', clearCode: true },
  PERMISSION_DENIED: { message: 'Je hebt op dit moment geen toegang tot deze instelling. Vernieuw de pagina en controleer je beheerdersrechten.' },
  PAIRING_REJECTED: { message: 'SocialHero heeft deze koppeling afgewezen. Controleer de website en omgeving en maak een nieuwe koppelcode aan.', clearCode: true },
  VERIFICATION_REJECTED: { message: 'De verificatie is afgewezen. Controleer de website en omgeving en koppel opnieuw.', clearCode: true },
  RATE_LIMITED: { message: 'Er zijn te veel pogingen gedaan. Wacht even voordat je het opnieuw probeert.', retryable: true },
  TEMPORARILY_UNAVAILABLE: { message: 'SocialHero is tijdelijk niet bereikbaar. Je kunt het opnieuw proberen.', retryable: true },
  SOCIALHERO_UNAVAILABLE: { message: 'SocialHero is tijdelijk niet bereikbaar. Je kunt het opnieuw proberen.', retryable: true },
  PAIRING_UNAVAILABLE: { message: 'De koppeling is tijdelijk niet beschikbaar of nog niet ingesteld voor deze omgeving. Vernieuw de status om het opnieuw te proberen.', retryable: true },
  NETWORK_ERROR: { message: 'De verbinding werd onderbroken. Controleer de status of probeer het opnieuw.', retryable: true },
  INVALID_RESPONSE: { message: 'De verbindingsstatus kon niet worden gelezen. Vernieuw de status om het opnieuw te proberen.', retryable: true },
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function label(value: unknown, maximum = 160): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value) ? value : undefined;
}
function origin(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    const local = url.protocol === 'http:' && ['localhost', 'www.localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return;
    return url.origin;
  } catch { return; }
}
function date(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? value : undefined;
}

/** Keep the browser model limited to the documented, non-secret status fields. */
export function parseConnection(value: unknown): BlogConnection | null {
  const raw = record(value);
  if (!raw || typeof raw.status !== 'string' || !statuses.has(raw.status as ConnectionStatus)) return null;
  const environment = label(raw.environment, 32), siteId = label(raw.siteId), siteName = label(raw.siteName), siteOrigin = origin(raw.origin);
  if (!environment || !siteId || !siteName || !siteOrigin || typeof raw.allowDraft !== 'boolean' || typeof raw.allowPublish !== 'boolean' || !Array.isArray(raw.scopes)) return null;
  const socialHeroOrigin = raw.socialHeroOrigin === null || raw.socialHeroOrigin === undefined || raw.socialHeroOrigin === '' ? null : origin(raw.socialHeroOrigin);
  if (socialHeroOrigin === undefined) return null;
  return {
    status: raw.status as ConnectionStatus, environment, siteId, siteName, origin: siteOrigin, socialHeroOrigin,
    allowDraft: raw.allowDraft, allowPublish: raw.allowPublish,
    ...(typeof raw.policyConfigured === 'boolean' ? { policyConfigured: raw.policyConfigured } : {}),
    ...(date(raw.policyUpdatedAt) ? { policyUpdatedAt: date(raw.policyUpdatedAt) } : {}),
    ...(label(raw.policyUpdatedBy) ? { policyUpdatedBy: label(raw.policyUpdatedBy) } : {}),
    scopes: [...new Set(raw.scopes.filter((scope): scope is ConnectionScope => typeof scope === 'string' && scopes.has(scope as ConnectionScope)))],
    ...(label(raw.connectionId) ? { connectionId: label(raw.connectionId) } : {}),
    ...(label(raw.destinationId) ? { destinationId: label(raw.destinationId) } : {}),
    ...(date(raw.expiresAt) ? { expiresAt: date(raw.expiresAt) } : {}),
    ...(date(raw.lastCheckedAt) ? { lastCheckedAt: date(raw.lastCheckedAt) } : {}),
  };
}

export class ConnectionRequestError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly clearCode: boolean;
  readonly connection: BlogConnection | null;
  readonly retryAfter: number;
  constructor(code: string, status = 0, connection: BlogConnection | null = null, retryAfter = 0) {
    const detail = Object.hasOwn(errors, code) ? errors[code] : undefined;
    super(detail?.message ?? 'Deze handeling kon niet worden afgerond. Vernieuw de status en probeer het opnieuw.');
    this.code = detail ? code : 'UNKNOWN_ERROR';
    this.retryable = detail?.retryable ?? (status >= 500);
    this.clearCode = detail?.clearCode ?? false;
    this.connection = connection;
    this.retryAfter = Math.min(600, Math.max(0, retryAfter));
  }
}

export async function connectionRequest(action?: ConnectionAction, signal?: AbortSignal): Promise<BlogConnection> {
  let response: Response;
  try {
    response = await fetch('/api/blog-admin/connection', {
      method: action ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal,
      ...(action ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ConnectionRequestError('NETWORK_ERROR');
  }
  const body = record(await response.json().catch(() => null));
  const connection = parseConnection(body?.connection);
  if (!response.ok) {
    const retry = Number(response.headers.get('retry-after') ?? '0');
    throw new ConnectionRequestError(typeof body?.code === 'string' ? body.code : 'UNKNOWN_ERROR', response.status, connection, Number.isFinite(retry) ? retry : 0);
  }
  if (!connection) throw new ConnectionRequestError('INVALID_RESPONSE');
  return connection;
}
