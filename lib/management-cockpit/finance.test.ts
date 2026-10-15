import {describe,expect,it} from 'vitest';
import {financeCommandSchema,financeQuerySchema} from './finance';
const id='00000000-0000-4000-8000-000000000001';
const command=()=>({command:'review',requestId:id,input:{id,fingerprint:'a'.repeat(64),outcome:'billable',reason:'FICTITIOUS actual source reviewed',approval:true,outside:true}});
describe('financial review boundary',()=>{
 it('accepts only a source identity and attestation, never caller-owned financial or report status',()=>{
  expect(financeCommandSchema.safeParse(command()).success).toBe(true);
  for(const field of['tenantId','role','priceCents','approved','reportId','reportState','quantity','history','sourceVersion'])expect(financeCommandSchema.safeParse({...command(),input:{...command().input,[field]:'forged'}}).success).toBe(false);
  expect(financeCommandSchema.safeParse({...command(),tenantId:id}).success).toBe(false);
 });
 it('requires explicit acknowledgements for billable review and retains source-only included controls',()=>{
  for(const field of['approval','outside'])expect(financeCommandSchema.safeParse({...command(),input:{...command().input,[field]:false}}).success).toBe(false);
  expect(financeCommandSchema.safeParse({...command(),input:{...command().input,outcome:'included',approval:false,outside:false}}).success).toBe(true);
 });
 it('keeps direct selection separate from literal search and bounded pagination',()=>{
  const parsed=financeQuerySchema.parse({tab:'review',search:'  %_  ',record:'task:'+id,page:'7',pageSize:'20'});expect(parsed).toMatchObject({search:'%_',record:'task:'+id,page:7,pageSize:20});
  for(const record of['task:wrong','tenant:'+id,'review:'+id+':extra'])expect(financeQuerySchema.safeParse({record}).success).toBe(false);
  for(const query of[{tenantId:id},{pageSize:1001},{page:0},{search:'x'.repeat(161)}])expect(financeQuerySchema.safeParse(query).success).toBe(false);
 });
});
