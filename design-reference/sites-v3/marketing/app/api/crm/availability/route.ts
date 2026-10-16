import { crmProxy } from '@/lib/crm-proxy';
export const dynamic = 'force-dynamic';
export function GET(request: Request) { return crmProxy(request, 'availability'); }
