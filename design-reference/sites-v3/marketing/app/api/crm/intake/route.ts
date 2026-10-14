import { crmProxy } from '@/lib/crm-proxy';
export const dynamic = 'force-dynamic';
export function POST(request: Request) { return crmProxy(request, 'intake'); }
