import {describe,expect,it} from 'vitest';
import {customerContentHref} from './content-href';
describe('selected customer account in content links',()=>{
 const account='94a944ce-7822-421b-9e09-d3c423d59579';
 it('preserves article, release selection and fragment while replacing a previous account',()=>{
  expect(customerContentHref('/klant/kennisbank/werkbon?account=previous#stappen',account)).toBe('/klant/kennisbank/werkbon?account='+account+'#stappen');
  expect(customerContentHref('/klant/updates?release=release-id',account)).toBe('/klant/updates?release=release-id&account='+account);
 });
 it.each(['/platform/productbeheer','/staff/kennisbank/werkbon','/klant/updates-extern','https://other.invalid/klant/updates','#stappen','/api/customer-portal/files/report/id'])('does not rewrite another navigation or a protected file URL: %s',path=>{
  expect(customerContentHref(path,account)).toBe(path);
 });
 it('keeps existing links intact without selected customer context',()=>{
  expect(customerContentHref('/klant/updates?release=id',null)).toBe('/klant/updates?release=id');
 });
});
