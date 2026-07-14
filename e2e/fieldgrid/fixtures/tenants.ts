export const tenants = {
  tenantA: { id: 'tenant-a', host: 'tenant-a.localhost', name: 'Tenant A' },
  tenantB: { id: 'tenant-b', host: 'tenant-b.localhost', name: 'Tenant B' },
} as const;

export const users = {
  backofficeA: { email: 'backoffice.a@fieldgrid.test', password: 'Password!A1', tenantId: tenants.tenantA.id, role: 'backoffice', active: true },
  personnelA: { email: 'personnel.a@fieldgrid.test', password: 'Password!A1', tenantId: tenants.tenantA.id, role: 'personnel', active: true },
  customerA: { email: 'customer.a@fieldgrid.test', password: 'Password!A1', tenantId: tenants.tenantA.id, role: 'customer', active: true },
  backofficeB: { email: 'backoffice.b@fieldgrid.test', password: 'Password!B1', tenantId: tenants.tenantB.id, role: 'backoffice', active: true },
  inactiveA: { email: 'inactive.a@fieldgrid.test', password: 'Password!A1', tenantId: tenants.tenantA.id, role: 'personnel', active: false },
} as const;

export const assignments = {
  tenantA: { id: 'assign-tenant-a-001', title: 'Tenant A Golden Path Assignment' },
  tenantB: { id: 'assign-tenant-b-001', title: 'Tenant B Golden Path Assignment' },
} as const;
