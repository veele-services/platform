import { beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), shell: vi.fn(), chain: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: mocks.auth }));
vi.mock("@/lib/planning/data", () => ({ getPlanningShellData: mocks.shell }));
vi.mock("@/lib/management-cockpit/data", () => ({ loadFollowup: mocks.chain }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async()=>({}) }));
vi.mock("@/components/fieldgrid/backoffice-shell", () => ({ BackofficeShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/fieldgrid/management-cockpit/control-center", () => ({ ControlCenter: ({ initial }: { initial: { actions: { title: string }[] } }) => createElement("div", null, initial?.actions.map(action => action.title).join(" ")) }));
import FollowupPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user" }, tenant: { id: "tenant", roles: ["management"], timezone: "Europe/Amsterdam" } });
});

it("starts shell and dossier reads together and renders the initial actions without waiting for browser hydration", async () => {
  let resolveShell: (value: unknown) => void = () => {};
  mocks.shell.mockImplementation(() => new Promise(resolve => { resolveShell = resolve; }));
  mocks.chain.mockResolvedValue({ actions: [{ title: "FICTITIOUS controle" }] });
  const result = FollowupPage({searchParams:Promise.resolve({})});
  await vi.waitFor(() => expect(mocks.chain).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({context:expect.objectContaining({tenant:expect.objectContaining({id:"tenant"})})}),expect.objectContaining({filter:"today",page:1,pageSize:8})));
  expect(mocks.shell).toHaveBeenCalledExactlyOnceWith("tenant");
  resolveShell({});
  const html = renderToStaticMarkup(await result);
  expect(html).toContain("FICTITIOUS controle");
  expect(mocks.auth).toHaveBeenCalledTimes(1);
});

it("rejects a role without dossier access before either data query", async () => {
  mocks.auth.mockResolvedValue({ tenant: { id: "tenant", roles: ["staff"] } });
  await expect(FollowupPage({searchParams:Promise.resolve({})})).rejects.toThrow("not found");
  expect(mocks.shell).not.toHaveBeenCalled();
  expect(mocks.chain).not.toHaveBeenCalled();
});
