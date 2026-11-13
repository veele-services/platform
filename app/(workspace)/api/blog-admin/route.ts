import { blogAdminApi } from '@/lib/blog/admin-api';
export async function GET(request: Request) { return blogAdminApi(request); }
export async function POST(request: Request) { return blogAdminApi(request); }
