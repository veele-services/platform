import {describe,it,expect} from 'vitest';
import {previewPrices,filtersSchema} from './model';
describe('commercial price contract',()=>{
 it('rounds discounts per line and VAT per rate using decimals',()=>{
  const l={id:'fixture',description:'Test',quantity:'3.125',unit:'uur',price_cents:1299,discount_basis_points:750,vat_basis_points:900,duration_minutes:60};
  expect(previewPrices([l,{...l,quantity:'2',vat_basis_points:2100}])).toMatchObject({subtotal_cents:6158,vat_cents:843,total_cents:7001});
 });
 it('retains one cent and does not silently pick a VAT rate',()=>{
  expect(previewPrices([{id:'test',description:'Test',quantity:'1',unit:'stuk',price_cents:1,discount_basis_points:0,vat_basis_points:0,duration_minutes:1}]).total_cents).toBe(1);
 });
 it('rejects negative and invalid quantities',()=>{
  expect(()=>previewPrices([{id:'test',description:'Test',quantity:'-1',unit:'stuk',price_cents:1,discount_basis_points:0,vat_basis_points:0,duration_minutes:1}])).toThrow();
 });
 it('bounds preferred page size independently of the selected page',()=>{expect(filtersSchema.parse({page:'2',pageSize:'50'})).toMatchObject({page:2,pageSize:50});for(const pageSize of[-1,0,101,5000,'invalid'])expect(filtersSchema.parse({pageSize}).pageSize).toBe(25);});
 it('whitelists sorting and bounds pagination',()=>{expect(filtersSchema.parse({sort:'DROP TABLE',page:-1}).sort).toBe('attention');expect(filtersSchema.parse({page:-1}).page).toBe(1);});
});
