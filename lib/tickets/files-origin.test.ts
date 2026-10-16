import {afterEach,expect,it,vi} from 'vitest';
import {ticketUploadOrigin} from './files-origin';
const upload=(origin:string,host=new URL(origin).host)=>new Request('http://127.0.0.1:3000/api/tickets/files',{headers:{origin,host,'x-forwarded-host':'attacker.invalid','x-forwarded-proto':'https'}});
afterEach(()=>vi.unstubAllEnvs());
it('permits HTTP on the actual local workspace authority only in local development',()=>{
 vi.stubEnv('DEPLOY_TARGET','local');
 for(const host of['localhost','127.0.0.1','fixture-tenant.localhost'])expect(()=>ticketUploadOrigin(upload(`http://${host}:3000`))).not.toThrow();
 for(const host of['fixture.localhost.attacker.invalid','a.b.localhost','attacker.invalid'])expect(()=>ticketUploadOrigin(upload(`http://${host}:3000`))).toThrow();
});
it.each(['staging','production'])('requires HTTPS in %s even when forwarded headers claim otherwise',target=>{
 vi.stubEnv('DEPLOY_TARGET',target);
 for(const host of['localhost','127.0.0.1','alpha.localhost','alpha.fieldgrid.nl'])expect(()=>ticketUploadOrigin(upload(`http://${host}:3000`))).toThrow();
 expect(()=>ticketUploadOrigin(upload('https://alpha.fieldgrid.nl'))).not.toThrow();
});
it('rejects cross-tenant origins, different ports, credentials and URL suffixes',()=>{
 vi.stubEnv('DEPLOY_TARGET','local');
 for(const [origin,host] of[['http://alpha.localhost:3000','beta.localhost:3000'],['http://alpha.localhost:3001','alpha.localhost:3000'],['https://user:password@alpha.fieldgrid.nl','alpha.fieldgrid.nl'],['https://alpha.fieldgrid.nl/path','alpha.fieldgrid.nl'],['ftp://alpha.localhost','alpha.localhost']])expect(()=>ticketUploadOrigin(upload(origin,host))).toThrow();
});
