import { socialHeroApi } from '@/lib/blog/service-api';
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) { return socialHeroApi(request, (await context.params).path); }
export { handle as GET, handle as PUT, handle as POST };
