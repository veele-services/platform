import {describe,expect,it} from 'vitest';
import {indexationCommandSchema,indexationQuerySchema} from './indexation';
const id='00000000-0000-4000-8000-000000000001',selected={id,revision:1};
describe('indexation workflow boundary',()=>{
 it('accepts only a real source fingerprint and percentage, never a client base tariff, owner or version status',()=>{
  const body={command:'save',requestId:id,input:{id,agreementId:id,fingerprint:'a'.repeat(64),percent:3.2,effective:'2027-01-01'}};expect(indexationCommandSchema.safeParse(body).success).toBe(true);
  for(const key of['baseCents','newCents','owner','role','status','approvedBy','history','lines'])expect(indexationCommandSchema.safeParse({...body,input:{...body.input,[key]:'forged'}}).success).toBe(false);
  for(const percent of[-1,25.01,3.123,Number.NaN])expect(indexationCommandSchema.safeParse({...body,input:{...body.input,percent}}).success).toBe(false);
 });
 it('keeps conscious owner approval separate from native processing with real customer evidence',()=>{
  expect(indexationCommandSchema.safeParse({command:'approve',input:selected,requestId:id}).success).toBe(true);
  expect(indexationCommandSchema.safeParse({command:'approve',input:{...selected,evidenceId:id},requestId:id}).success).toBe(false);
  const process={command:'process',requestId:id,input:{...selected,evidenceId:id,acceptedBy:'FICTITIOUS customer',acceptedOn:'2026-10-15',confirmed:true}};
  expect(indexationCommandSchema.safeParse(process).success).toBe(true);for(const field of['evidenceId','acceptedBy','acceptedOn','confirmed']){const input={...process.input};delete input[field as keyof typeof input];expect(indexationCommandSchema.safeParse({...process,input}).success).toBe(false)}
  expect(indexationCommandSchema.safeParse({...process,input:{...process.input,confirmed:false}}).success).toBe(false);
 });
 it('bounds register pagination independently of direct selection',()=>{expect(indexationQuerySchema.parse({filter:'Verwerkt',record:id,page:'9',pageSize:'5'})).toMatchObject({filter:'Verwerkt',record:id,page:9,pageSize:5});for(const input of[{role:'Eigenaar'},{page:0},{pageSize:101},{filter:'published'},{record:'not-a-source'}])expect(indexationQuerySchema.safeParse(input).success).toBe(false)});
});
