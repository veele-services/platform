import { describe, expect, it } from 'vitest';
import { completeManagementDependencies } from './permissions';
const cap = (key: string, dependencies: string[] = [], module = 'access') => ({ key, dependencies, module, name: '', description: '', sensitive: false, action: 'read' });
describe('registered management dependencies', () => {
  it('closes transitive and cyclic dependencies without inventing page rights from grouping labels', () => {
    const catalog = [cap('backoffice.functions.cards', ['backoffice.functions.entity']), cap('backoffice.functions.entity', ['backoffice.access']), cap('backoffice.access', ['backoffice.functions.entity'])];
    expect(completeManagementDependencies(['backoffice.functions.cards'], catalog)).toEqual(['backoffice.functions.cards', 'backoffice.functions.entity', 'backoffice.access']);
  });
  it('includes registered read access for write, retaining unrelated selections without granting sensitive capabilities', () => {
    const catalog = [cap('backoffice.news.read'), cap('backoffice.news.write'), cap('backoffice.personnel.sensitive')];
    expect(completeManagementDependencies(['backoffice.news.write', 'existing.selection'], catalog)).toEqual(['backoffice.news.write', 'existing.selection', 'backoffice.news.read']);
  });
  it('retains legacy native page/action dependencies without inventing access.read or overriding explicit cross-module dependencies',()=>{
    const catalog=[cap('backoffice.planning.read',[],'planning'),cap('backoffice.functions.get_planboard',[],'planning'),cap('backoffice.functions.entity',['backoffice.access'],'access'),cap('backoffice.access')];
    expect(completeManagementDependencies(['backoffice.functions.get_planboard','backoffice.functions.entity'],catalog)).toEqual(['backoffice.functions.get_planboard','backoffice.functions.entity','backoffice.planning.read','backoffice.access']);
  });
});
