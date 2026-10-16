import type { ManagementSnapshot } from './model';

/** Older native function registrations express their page/action through the
 * module fields. New registrations carry explicit cross-module dependencies.
 * Use the former only when that exact page capability is actually registered. */
export function registeredManagementDependencies(item:ManagementSnapshot['catalog'][number],catalog:ManagementSnapshot['catalog']){
  if(item.dependencies.length||!item.key.startsWith('backoffice.functions.'))return item.dependencies;
  const page=`backoffice.${item.module}.${item.action}`;
  return catalog.some(entry=>entry.key===page)?[page]:[];
}

/** Follow registered dependencies. A function's module is a grouping label,
 * not a capability name (for example the entity adapter belongs to access). */
export function completeManagementDependencies(selected: string[], catalog: ManagementSnapshot['catalog']) {
  const known = new Map(catalog.map(item => [item.key, item]));
  const result = new Set(selected), visited = new Set<string>();
  function add(key: string) {
    if (visited.has(key)) return;
    visited.add(key);
    const item = known.get(key);
    if (!item) return;
    result.add(key);
    registeredManagementDependencies(item,catalog).forEach(add);
    if (/^backoffice\.[^.]+\.write$/.test(key)) add(key.replace('.write', '.read'));
  }
  selected.forEach(add);
  return [...result];
}
