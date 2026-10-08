import { afterEach, expect, it, vi } from "vitest";
import { normalizeWorkspaceHostname, resolveCustomWorkspaceHost, workspaceDnsMatches, workspaceDnsRecords } from "./workspace-domain";
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it.each(["https://app.example.nl","app.example.nl:443","user@app.example.nl","app.example.nl/path","*.example.nl","127.0.0.1","localhost","a.localhost","fieldgrid.nl","x.staging.fieldgrid.nl","-app.example.nl","app..example.nl","a".repeat(64)+".example.nl"])("rejects unsafe or reserved workspace host %s",host=>expect(()=>normalizeWorkspaceHostname(host)).toThrow());
it("normalizes DNS names and shows tenant-specific ownership records",()=>{
 expect(normalizeWorkspaceHostname(" App.VeeleServices.nl ")).toBe("app.veeleservices.nl");
 expect(workspaceDnsRecords("app.example.nl","fixture-token","tenant.fieldgrid.nl")).toEqual([{type:"CNAME",name:"app.example.nl",value:"tenant.fieldgrid.nl"},{type:"TXT",name:"_fieldgrid.app.example.nl",value:"fieldgrid-verification=fixture-token"}]);
 expect(workspaceDnsMatches([["fieldgrid-verification=","fixture-token"]],["TENANT.fieldgrid.nl."],"fixture-token","tenant.fieldgrid.nl")).toBe(true);
 expect(workspaceDnsMatches([["fieldgrid-verification=other"]],["tenant.fieldgrid.nl"],"fixture-token","tenant.fieldgrid.nl")).toBe(false);
 expect(workspaceDnsMatches([["fieldgrid-verification=fixture-token"]],["other.fieldgrid.nl"],"fixture-token","tenant.fieldgrid.nl")).toBe(false);
});
it("uses fixed service-only resolver with exact hostname/environment and does not cache activation",async()=>{
 vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://fixture.supabase.invalid");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","FICTITIOUS");
 const fetchMock=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify("veele-services"))).mockResolvedValueOnce(new Response("null"));vi.stubGlobal("fetch",fetchMock);
 expect(await resolveCustomWorkspaceHost("app.example.nl","production")).toEqual({slug:"veele-services",unavailable:false});
 expect(await resolveCustomWorkspaceHost("app.example.nl","production")).toEqual({slug:null,unavailable:false});
 expect(fetchMock.mock.calls[0][0]).toBe("https://fixture.supabase.invalid/rest/v1/rpc/resolve_workspace_hostname");
 expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({requested_host:"app.example.nl",requested_environment:"production"});
 expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
});
it("fails closed for inactive domains, invalid mappings and unavailable database",async()=>{
 const fetchMock=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify("a.b"))).mockResolvedValueOnce(new Response("null",{status:503})).mockRejectedValueOnce(Error("network"));vi.stubGlobal("fetch",fetchMock);
 expect(await resolveCustomWorkspaceHost("app.example.nl","staging")).toEqual({slug:null,unavailable:false});
 expect(await resolveCustomWorkspaceHost("app.example.nl","staging")).toEqual({slug:null,unavailable:true});
 expect(await resolveCustomWorkspaceHost("app.example.nl","staging")).toEqual({slug:null,unavailable:true});
 expect(await resolveCustomWorkspaceHost("x.fieldgrid.nl","production")).toEqual({slug:null,unavailable:false});
 expect(await resolveCustomWorkspaceHost("app.example.nl","local")).toEqual({slug:null,unavailable:false});
 expect(fetchMock).toHaveBeenCalledTimes(3);
});
