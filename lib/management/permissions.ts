import type { ManagementSnapshot } from './model';

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
    item.dependencies.forEach(add);
    if (/^backoffice\.[^.]+\.write$/.test(key)) add(key.replace('.write', '.read'));
  }
  selected.forEach(add);
  return [...result];
}
