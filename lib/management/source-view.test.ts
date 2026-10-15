import {describe,it,expect} from 'vitest';
import {rolePermissionSummary} from './source-view';
const catalog=[['planning',false],['finance',true],['personnel',true],['personnel',false],['finance',true]].map(([module,sensitive],i)=>({key:'cap'+i,module:module as string,sensitive:sensitive as boolean,name:'Capability',description:'',action:'read',dependencies:[]}));
describe('Source role matrix reports actual configuration without granting dossier authority',()=>{
 it('counts known assigned capabilities once and distinguishes confidential personnel from other sensitive modules',()=>{expect(rolePermissionSummary({permissions:['cap0','cap0','cap1','cap2','cap3','unknown']},catalog,['finance','personeel'])).toEqual({operation:1,finance:1,confidentialPersonnel:1})});
 it('keeps unavailable modules distinct from a role with no configured rights',()=>{expect(rolePermissionSummary({permissions:['cap1','cap2']},catalog,[])).toEqual({operation:0,finance:null,confidentialPersonnel:null});expect(rolePermissionSummary({permissions:[]},catalog,['finance','personeel'])).toEqual({operation:0,finance:0,confidentialPersonnel:0})});
});
