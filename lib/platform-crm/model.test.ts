import {describe,expect,it} from 'vitest';
import {crmError,crmIntakeSchema,crmQuerySchema} from './model';
const input={idempotencyKey:'8b05cb80-e088-4868-8e5c-f0d50a434124',kind:'trial',company:'Fictief bedrijf',name:'Fictieve bezoeker',email:'contact@crm-fixture.invalid'};
describe('public CRM boundary',()=>{
 it('requires a telephone and complete slot for an appointment, without enabling video or caller-controlled recipient fields',()=>{
  expect(crmIntakeSchema.safeParse(input).success).toBe(true);
  for(const forged of[{...input,owner:'owner'},{...input,adminEmail:'other@crm-fixture.invalid'},{...input,kind:'demo',date:'2026-10-25',time:'02:30'},{...input,kind:'video'},{...input,date:'2026-10-25',time:'02:30'}])expect(crmIntakeSchema.safeParse(forged).success).toBe(false);
  expect(crmIntakeSchema.safeParse({...input,kind:'demo',phone:'0612345678',date:'2026-10-25',time:'02:30'}).success).toBe(true);
 });
 it('bounds independent pages and filters and rejects a caller-provided tenant',()=>{
  const parsed=crmQuerySchema.parse({tab:'agenda',page:'2',pageSize:'25',detailPage:'3',detailPageSize:'10',showCancelled:'false'});
  expect(parsed).toMatchObject({page:2,pageSize:25,detailPage:3,detailPageSize:10,showCancelled:false});
  for(const value of[{tenantId:input.idempotencyKey},{pageSize:1000},{detailPage:-1},{owner:'Platformbeheer'},{mailStatus:'delivered'}])expect(crmQuerySchema.safeParse(value).success).toBe(false);
 });
 it('separates unavailable, authorization, rate, booking and optimistic-write failures',()=>{
  for(const [code,status]of[['42501',403],['P0429',429],['23P01',409],['40001',409],['P0002',404],['22023',422]])expect(crmError({code,details:'PRIVATE SQL'})).toMatchObject({status});
  expect(crmError(new Error('PRIVATE provider credential')).status).toBe(503);expect(JSON.stringify(crmError({message:'PRIVATE SQL'}))).not.toContain('PRIVATE');
 });
});
