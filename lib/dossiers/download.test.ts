import {beforeEach,describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
const mocks=vi.hoisted(()=>({context:vi.fn(),client:vi.fn(),admin:vi.fn(),registry:vi.fn(),source:vi.fn(),read:vi.fn(),audit:vi.fn(),eq:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/auth/context',()=>({getAuthContext:mocks.context}));
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.client}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:mocks.admin}));
vi.mock('@/lib/files/scanned-storage',()=>({readScannedFile:mocks.read}));
import {downloadDossierDocument} from './download';
const tenant='10000000-0000-4000-8000-000000000001',person='20000000-0000-4000-8000-000000000001',document='30000000-0000-4000-8000-000000000001',actor='40000000-0000-4000-8000-000000000001';
const bytes=Buffer.from('%PDF-1.7\nFICTITIOUS private personnel bytes\n%%EOF'),sha=createHash('sha256').update(bytes).digest('hex');
const source={personnel_id:person,storage_path:`${tenant}/${person}/document.pdf`,file_name:'Private document.pdf',mime_type:'application/pdf',sha256:sha};
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.context.mockResolvedValue({tenant:{id:tenant},user:{id:actor}});
 mocks.registry.mockResolvedValue({data:{source_kind:'personnel',source_id:document,personnel_id:person},error:null});
 mocks.source.mockResolvedValue({data:source,error:null});mocks.read.mockResolvedValue({bytes,mime:'application/pdf'});mocks.audit.mockResolvedValue({error:null});
 const query={select:()=>query,eq:(...args:unknown[])=>{mocks.eq(...args);return query;},single:mocks.registry};
 mocks.client.mockResolvedValue({from:()=>query,rpc:()=>({single:mocks.source})});mocks.admin.mockReturnValue({from:()=>({insert:mocks.audit})});
});
describe('private personnel file preview uses the original download authorization',()=>{
 it('returns the same scanned PDF bytes inline and repeats live registry and source authorization',async()=>{
  const response=await downloadDossierDocument(document,'personnel',true);
  expect(response.status).toBe(200);expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  expect(response.headers.get('content-disposition')).toMatch(/^inline;/);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'self'");expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  expect(mocks.registry).toHaveBeenCalledTimes(2);expect(mocks.source).toHaveBeenCalledTimes(2);expect(mocks.eq).toHaveBeenCalledWith('tenant_id',tenant);expect(mocks.eq).toHaveBeenCalledWith('source_id',document);expect(mocks.audit).toHaveBeenCalledExactlyOnceWith({tenant_id:tenant,personnel_id:person,actor_user_id:actor,action:'download'});
 });
 it('retains attachment behavior by default',async()=>{
  const response=await downloadDossierDocument(document,'personnel');expect(response.status).toBe(200);expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
 });
 it.each(['text/html','image/svg+xml','application/octet-stream'])('refuses active or unsupported inline content (%s) before file I/O',async mime=>{
  mocks.source.mockResolvedValue({data:{...source,mime_type:mime},error:null});expect((await downloadDossierDocument(document,'personnel',true)).status).toBe(404);expect(mocks.read).not.toHaveBeenCalled();
 });
 it('does not release buffered bytes when personnel visibility is revoked during I/O',async()=>{
  mocks.source.mockResolvedValueOnce({data:source,error:null}).mockResolvedValueOnce({data:null,error:{code:'42501'}});
  expect((await downloadDossierDocument(document,'personnel',true)).status).toBe(404);expect(mocks.read).toHaveBeenCalledTimes(1);
 });
 it('rejects a source/registry parent mismatch without reading bytes',async()=>{
  mocks.source.mockResolvedValue({data:{...source,personnel_id:actor},error:null});expect((await downloadDossierDocument(document,'personnel',true)).status).toBe(404);expect(mocks.read).not.toHaveBeenCalled();
 });
 it('rejects malformed identifiers before authentication or data access',async()=>{
  const response=await downloadDossierDocument('invalid','personnel',true);expect(response.status).toBe(404);expect(response.headers.get('x-frame-options')).toBe('DENY');expect(mocks.context).not.toHaveBeenCalled();expect(mocks.read).not.toHaveBeenCalled();
 });
});
