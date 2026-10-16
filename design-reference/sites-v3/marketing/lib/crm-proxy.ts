import { env } from 'cloudflare:workers';

const CRM_ORIGIN = 'https://fieldgrid-platform.dgwebserv.chatgpt.site';
const noStore = { 'Cache-Control': 'no-store' };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: noStore });

export async function crmProxy(request: Request, action: 'availability' | 'intake') {
  const token = (env as unknown as Record<string, string>).FIELDGRID_CRM_SERVICE_TOKEN;
  if (!token) return fail('De aanvragenkoppeling is nog niet beschikbaar. Probeer het later opnieuw.', 503);
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (request.method === 'POST' && origin && origin !== url.origin) return fail('Dit formulier moet vanaf de Fieldgrid-website worden verstuurd.', 403);
  const target = new URL(`/api/crm/${action}`, CRM_ORIGIN);
  let body: string | undefined;
  if (action === 'availability') {
    const date = url.searchParams.get('date') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Kies een geldige datum.', 400);
    target.searchParams.set('date', date);
  } else {
    if (!request.headers.get('content-type')?.includes('application/json')) return fail('Ongeldig formulierformaat.', 415);
    if (Number(request.headers.get('content-length') || 0) > 20000) return fail('Je aanvraag is te groot.', 413);
    body = await request.text();
    if (body.length > 20000) return fail('Je aanvraag is te groot.', 413);
    try { JSON.parse(body); } catch { return fail('Het formulier kon niet worden gelezen.', 400); }
  }
  try {
    const upstream = await fetch(target, {
      method: action === 'intake' ? 'POST' : 'GET',
      headers: { 'OAI-Sites-Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    });
    if (!upstream.headers.get('content-type')?.includes('application/json')) return fail('De verbinding met Fieldgrid is tijdelijk niet beschikbaar. Je kunt opnieuw proberen.', 502);
    const data = await upstream.json();
    if (upstream.status >= 500) return fail('Je aanvraag kon nog niet worden bevestigd. Probeer opnieuw; dezelfde aanvraag wordt niet dubbel geregistreerd.', 502);
    return Response.json(data, { status: upstream.status, headers: noStore });
  } catch {
    return fail('De verbinding duurde te lang. Probeer opnieuw; dezelfde aanvraag wordt niet dubbel geregistreerd.', 503);
  }
}
