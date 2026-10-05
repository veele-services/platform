import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AuthState } from "@/app/login/actions";

const mocks = vi.hoisted(() => ({ state: {} as AuthState, action: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useActionState: () => [mocks.state, mocks.action, false] }));
vi.mock("@/app/auth/invite/actions", () => ({ acceptPersonnelInvitation: vi.fn() }));
import { InviteForm } from "@/app/auth/invite/invite-form";

beforeEach(() => { mocks.state = {}; });

it.each([false, true])("offers staff OTP login before and after a failed invitation (error: %s)", failed => {
  if (failed) mocks.state = { error: "Deze uitnodiging is ongeldig, verlopen of al gebruikt." };
  const html = renderToStaticMarkup(createElement(InviteForm, { tenantSlug: "example" }));
  expect(html).toContain('href="/login?next=%2Fstaff"');
  expect(html).toContain("Inloggen met e-mailcode");
  expect(html).toContain("het e-mailadres uit je uitnodiging");
  expect(html).not.toContain("Vraag je beheerder");
  if (failed) expect(html).toContain('role="alert"');
});
