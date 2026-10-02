import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({exec:vi.fn(),mkdtemp:vi.fn(),mkdir:vi.fn(),readFile:vi.fn(),writeFile:vi.fn(),rename:vi.fn(),unlink:vi.fn(),rmdir:vi.fn()}));
vi.mock("node:child_process",()=>({execFile:io.exec}));
vi.mock("node:fs/promises",()=>({mkdtemp:io.mkdtemp,mkdir:io.mkdir,readFile:io.readFile,writeFile:io.writeFile,rename:io.rename,unlink:io.unlink,rmdir:io.rmdir}));
const ref="abcdefghijklmnopqrst", password="FICTITIOUS-backup-password";
let originalExit:typeof process.exitCode;
beforeEach(()=>{
  originalExit=process.exitCode;
  vi.resetModules();vi.clearAllMocks();
  for(const [key,value]of Object.entries({DEPLOY_TARGET:"staging",APP_ENV:"development",EXPECTED_SUPABASE_PROJECT_REF:ref,FORBIDDEN_SUPABASE_PROJECT_REF:"ckdtiuemeygrnujjibnw",SUPABASE_URL:`https://${ref}.supabase.co`,BACKUP_DATABASE_URL:`postgresql://postgres:${password}@db.${ref}.supabase.co/postgres`,RUNNER_TEMP:"/tmp/fieldgrid-hosted-runner",BACKUP_OUTPUT_PATH:"/tmp/fieldgrid-hosted-runner/fieldgrid-staging-backup.dump",PGHOSTADDR:"192.0.2.1",PGSERVICE:"legacy",PGOPTIONS:"reference=forbidden",PGPORT:"6543"}))vi.stubEnv(key,value);
  io.mkdtemp.mockResolvedValue("/tmp/fieldgrid-backup-tls-FICTITIOUS");io.mkdir.mockResolvedValue(undefined);io.readFile.mockResolvedValue("FICTITIOUS public CA");
  io.writeFile.mockResolvedValue(undefined);io.rename.mockResolvedValue(undefined);io.unlink.mockResolvedValue(undefined);io.rmdir.mockResolvedValue(undefined);
  io.exec.mockImplementation((_name,_args,_options,callback)=>callback(null,"",""));
  vi.spyOn(console,"log").mockImplementation(()=>undefined);vi.spyOn(console,"error").mockImplementation(()=>undefined);
});
afterEach(()=>{process.exitCode=originalExit;vi.unstubAllEnvs();vi.restoreAllMocks();});

describe("standalone guarded backup adapter (no real files or network)",()=>{
  it("pins the exact target and TLS, keeps passwords out of argv and atomically publishes a verified private dump",async()=>{
    await import("../../scripts/backup-database");
    await vi.waitFor(()=>expect(io.rmdir).toHaveBeenCalled());
    expect(io.mkdtemp).toHaveBeenCalledWith("/tmp/fieldgrid-hosted-runner/fieldgrid-backup-tls-");
    expect(io.exec.mock.calls.map(c=>c[0])).toEqual(["docker","docker","docker","docker"]);
    const image="docker.io/library/postgres:17.8-bookworm@sha256:45e40832755b7133da62e701ee496d65afc5e4527c8ff5446c2f3bdd11bc58e3";
    expect(io.exec.mock.calls[0][1]).toEqual(["info","--format","{{json .SecurityOptions}}"]);
    expect(io.exec.mock.calls[1][1]).toEqual(["pull",image]);
    const [name,args,options]=io.exec.mock.calls[2];
    expect(name).toBe("docker");expect(args).not.toContain(password);
    expect(args).toContain("--read-only");expect(args).toContain("--cap-drop=ALL");expect(args).toContain("--security-opt=no-new-privileges");
    expect(args).toContain(image);expect(args).toContain("pg_dump");expect(args).toContain("PGPASSWORD");
    expect(options.env).toMatchObject({PGHOST:`db.${ref}.supabase.co`,PGPORT:"5432",PGUSER:"postgres",PGDATABASE:"postgres",PGSSLMODE:"verify-full",PGPASSWORD:password});
    for(const key of ["PGHOSTADDR","PGSERVICE","PGOPTIONS"])expect(options.env).not.toHaveProperty(key);
    expect(options.env.PGSSLROOTCERT).toBe("/backup/roots.pem");
    const partial=io.writeFile.mock.calls.find(c=>String(c[0]).endsWith(".partial"));
    expect(partial?.[2]).toEqual({mode:0o600,flag:"wx"});
    const restoreArgs=io.exec.mock.calls[3][1];
    expect(restoreArgs).toContain("none");expect(restoreArgs).toContain("pg_restore");expect(restoreArgs).toContain("--list");
    expect(restoreArgs).toContain("/backup/backup.partial");
    expect(io.rename.mock.calls[0][1]).toBe("/tmp/fieldgrid-hosted-runner/fieldgrid-staging-backup.dump");
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(password);
  });
  it("never invokes sudo or a VPS broker on the secret-bearing hosted runner",async()=>{
    await import("../../scripts/backup-database");await vi.waitFor(()=>expect(io.rmdir).toHaveBeenCalled());
    expect(io.exec.mock.calls.map(c=>c[0])).toEqual(["docker","docker","docker","docker"]);
  });
  it("never publishes a dump rejected by pg_restore and sanitizes child diagnostics",async()=>{
    io.exec.mockImplementation((_name,args,_options,callback)=>callback(args.includes("pg_restore")?new Error(password):null,"",""));
    await import("../../scripts/backup-database");await vi.waitFor(()=>expect(console.error).toHaveBeenCalled());
    expect(io.rename).not.toHaveBeenCalled();expect(io.unlink).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(password);
    expect(process.exitCode).toBe(1);
  });
  it("fails a forged database target before writing files or starting a subprocess",async()=>{
    vi.stubEnv("BACKUP_DATABASE_URL",`postgresql://postgres:${password}@db.ckdtiuemeygrnujjibnw.supabase.co/postgres`);
    await import("../../scripts/backup-database");await vi.waitFor(()=>expect(console.error).toHaveBeenCalled());
    expect(io.mkdir).not.toHaveBeenCalled();expect(io.exec).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(password);
    expect(process.exitCode).toBe(1);
  });
});
