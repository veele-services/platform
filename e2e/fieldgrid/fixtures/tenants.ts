export const tenants = {
  tenantA: { id: '10000000-0000-4000-8000-000000000001', host: 'tenant-a.runtime.fieldgrid.test', name: 'Runtime Tenant A' },
  tenantB: { id: '10000000-0000-4000-8000-000000000002', host: 'tenant-b.runtime.fieldgrid.test', name: 'Runtime Tenant B' },
} as const;

export const users = {
  platformAdmin: { id: '20000000-0000-4000-8000-000000000002', email: 'platform-admin@runtime.fieldgrid.test' },
  backofficeA: { id: '20000000-0000-4000-8000-000000000102', email: 'admin@tenant-a.runtime.fieldgrid.test' },
  personnelA: { id: '20000000-0000-4000-8000-000000000104', email: 'personnel@tenant-a.runtime.fieldgrid.test' },
  customerA: { id: '20000000-0000-4000-8000-000000000105', email: 'customer@tenant-a.runtime.fieldgrid.test' },
  backofficeB: { id: '20000000-0000-4000-8000-000000000202', email: 'admin@tenant-b.runtime.fieldgrid.test' },
  personnelB: { id: '20000000-0000-4000-8000-000000000204', email: 'personnel@tenant-b.runtime.fieldgrid.test' },
  customerB: { id: '20000000-0000-4000-8000-000000000205', email: 'customer@tenant-b.runtime.fieldgrid.test' },
  inactivePersonnel: { id: '20000000-0000-4000-8000-000000000106', email: 'inactive-personnel@tenant-a.runtime.fieldgrid.test' },
  suspendedOwner: { id: '20000000-0000-4000-8000-000000000401', email: 'owner@suspended.runtime.fieldgrid.test' },
} as const;

export const assignments = {
  tenantA: { id: '70000000-0000-4000-8000-000000000001', title: 'Runtime Assignment A' },
  tenantB: { id: '70000000-0000-4000-8000-000000000002', title: 'Runtime Assignment B' },
} as const;
