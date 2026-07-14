import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

const tenants = {
  'tenant-a': { host: 'tenant-a.localhost', name: 'Tenant A' },
  'tenant-b': { host: 'tenant-b.localhost', name: 'Tenant B' },
};
const users = {
  'backoffice.a@fieldgrid.test': { password: 'Password!A1', tenantId: 'tenant-a', role: 'backoffice', active: true },
  'personnel.a@fieldgrid.test': { password: 'Password!A1', tenantId: 'tenant-a', role: 'personnel', active: true },
  'customer.a@fieldgrid.test': { password: 'Password!A1', tenantId: 'tenant-a', role: 'customer', active: true },
  'backoffice.b@fieldgrid.test': { password: 'Password!B1', tenantId: 'tenant-b', role: 'backoffice', active: true },
  'inactive.a@fieldgrid.test': { password: 'Password!A1', tenantId: 'tenant-a', role: 'personnel', active: false },
};
const assignments = {
  'tenant-a': { id: 'assign-tenant-a-001', title: 'Tenant A Golden Path Assignment' },
  'tenant-b': { id: 'assign-tenant-b-001', title: 'Tenant B Golden Path Assignment' },
};
const sessions = new Map();
const runId = process.env.FIELDGRID_E2E_RUN_ID || `fg-${Date.now()}-${randomUUID()}`;

function html(title, body) {
  return `<!doctype html><html><head><title>${title}</title><meta name="run-id" content="${runId}"></head><body><main data-testid="app"><h1>${title}</h1><p data-testid="run-id">${runId}</p>${body}</main></body></html>`;
}
function parseCookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(c => c.trim().split('='))); }
function tenantForHost(req) { const url = new URL(req.url, 'http://localhost'); const cookies = parseCookies(req); const host = url.searchParams.get('host') || cookies.fg_tenant_host || (req.headers.host || '').split(':')[0]; return Object.entries(tenants).find(([, t]) => t.host === host)?.[0]; }
function send(res, status, body, headers = {}) { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers }); res.end(body); }
function currentUser(req) { return sessions.get(parseCookies(req).fg_session); }
function requireAccess(req, res, role) {
  const tenantId = tenantForHost(req); const user = currentUser(req);
  if (!tenantId) return send(res, 404, html('Wrong host', '<p data-testid="error">Unknown tenant host</p>'));
  if (!user) return send(res, 200, loginPage(role, req));
  if (!user.active) return send(res, 403, html('Inactive profile', '<p data-testid="error">Profile inactive</p>'));
  if (user.tenantId !== tenantId || user.role !== role) return send(res, 403, html('Access denied', '<p data-testid="error">Tenant or role mismatch</p>'));
  return { tenantId, user };
}
function loginPage(role, req) { const host = new URL(req.url, 'http://localhost').searchParams.get('host') || parseCookies(req).fg_tenant_host || 'tenant-a.localhost'; return html(`${role} login`, `<form method="post" action="/login?host=${host}"><input name="email" aria-label="email"><input name="password" aria-label="password" type="password"><input name="role" value="${role}" type="hidden"><button>Login</button></form>`); }
function nav(role, tenantId) {
  if (role === 'backoffice') return `<a href="/dashboard">dashboard</a><a href="/customers">customer list</a><a href="/assignments">assignment list</a><a href="/planning">planning board</a>`;
  if (role === 'personnel') return `<a href="/assignments">assignment list</a><a href="/assignments/${assignments[tenantId].id}">assignment detail</a><a href="/tasks">tasks</a><a href="/reports">reports</a>`;
  return `<a href="/assignments">assignments</a><a href="/reports">reports</a><a href="/invoices">invoices</a>`;
}
async function body(req) { let data=''; req.on('data', c => data += c); await once(req, 'end'); return new URLSearchParams(data); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/healthz') return send(res, 200, 'ok', { 'content-type': 'text/plain' });
  if (url.pathname === '/login' && req.method === 'POST') {
    const form = await body(req); const user = users[form.get('email')]; const tenantId = tenantForHost(req);
    if (!user || user.password !== form.get('password')) return send(res, 401, html('Login failed', '<p data-testid="error">Invalid credentials</p>'));
    if (user.tenantId !== tenantId) return send(res, 403, html('Access denied', '<p data-testid="error">Tenant or role mismatch</p>'));
    if (!user.active) return send(res, 403, html('Inactive profile', '<p data-testid="error">Profile inactive</p>'));
    if (user.role !== form.get('role')) return send(res, 403, html('Access denied', '<p data-testid="error">Tenant or role mismatch</p>'));
    const sid = randomUUID(); sessions.set(sid, user); return send(res, 302, '', { 'set-cookie': [`fg_session=${sid}; Path=/; HttpOnly; SameSite=Lax`, `fg_tenant_host=${tenants[tenantId].host}; Path=/; SameSite=Lax`], location: user.role === 'backoffice' ? '/dashboard' : '/assignments' });
  }
  const sessionUser = currentUser(req);
  const role = url.searchParams.get('role') || sessionUser?.role || 'backoffice';
  const wantedRole = url.pathname.startsWith('/invoices') ? 'customer' : url.pathname.startsWith('/tasks') ? 'personnel' : role;
  const access = requireAccess(req, res, wantedRole);
  if (!access || !access.tenantId) return;
  const { tenantId, user } = access;
  const assignment = assignments[tenantId];
  if (url.pathname.startsWith('/assignments/') && url.pathname !== `/assignments/${assignment.id}`) return send(res, 404, html('Assignment not found', '<p data-testid="error">Assignment unavailable for tenant</p>'));
  const labels = { '/dashboard': 'dashboard', '/customers': 'customer list', '/assignments': user.role === 'customer' ? 'assignments' : 'assignment list', '/planning': 'planning board', '/tasks': 'tasks', '/reports': 'reports', '/invoices': 'invoices' };
  const title = url.pathname.startsWith('/assignments/') ? 'assignment detail' : (labels[url.pathname] || 'dashboard');
  send(res, 200, html(title, `<section data-testid="tenant">${tenants[tenantId].name}</section><section data-testid="fixture">${assignment.title}</section>${nav(user.role, tenantId)}`));
});

server.listen(Number(process.env.PORT || 0), '127.0.0.1', () => console.log(`FIELDGRID_E2E_SERVER=http://127.0.0.1:${server.address().port}`));
