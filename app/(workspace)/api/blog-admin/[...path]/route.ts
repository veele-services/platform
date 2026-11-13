import { blogAdminApi } from '@/lib/blog/admin-api';
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) { return blogAdminApi(request, (await context.params).path); }
export { handle as GET, handle as PATCH, handle as POST };
