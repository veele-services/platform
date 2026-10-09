import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffPersonnel } from "./workspace";
import type { NotificationPreferences } from "@/lib/notifications/model";
import { defaultOnboarding, defaultTransport } from "./onboarding";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({ user: { id: "worker" }, tenant: { id: "tenant", roles: ["staff"], enabledServices: ["personeel"] } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/components/fieldgrid/notifications/push", () => ({ NotificationPushControl: () => null }));

import { saveStaffOnboarding } from "@/app/staff/actions";
import { Onboarding } from "@/components/fieldgrid/staff/onboarding";

const profile: StaffPersonnel = {
  id: "person", tenant_id: "tenant", employee_number: "P-0001", full_name: "Sam de Vries",
  preferred_name: null, email: "sam@example.test", phone: null, mobile_phone: "0612345678",
  birth_date: null, status: "active", home_address: { street: "Teststraat 1", postal_code: "1234 AB", city: "Teststad", country: "NL" },
  emergency_contact: {}, standard_vehicle: "car", departure_kind: "home", departure_depot_id: null,
  // addressFromForm emits this placeholder when no alternate address is chosen.
  alternate_departure_address: { street: "", postal_code: "", city: "", country: "NL", status: "missing" },
  return_to_departure: true, driving_license: false, driving_license_categories: [], carpool_allowed: false,
  own_transport: true, travel_limitations: null, notification_preferences: {}, availability_preferences: {},
  availability_self_service_enabled: false, onboarding_draft: {}, onboarding_step: 0,
  onboarding_completed_at: null, onboarding_version: 2, version: 3,
};
const preferences: NotificationPreferences = {
  version: 4, email: true, push: false, quietEnabled: false, quietStart: "22:00", quietEnd: "07:00", timezone: "Europe/Amsterdam",
  types: [{ code: "planning", name: "Nieuwe planning", channels: ["email", "push", "in_app"], email: true, push: false, reason: "" }],
};

beforeEach(() => { mocks.rpc.mockReset(); mocks.rpc.mockResolvedValue({ data: {}, error: null }); });

describe("personnel onboarding departure payload", () => {
  it("does not load an empty alternate address for departure from home", () => {
    expect(defaultTransport(profile).alternateDepartureAddress).toBeNull();
    expect(defaultTransport(profile).returnToDeparture).toBe(true);
    const draft = defaultOnboarding(profile, preferences);
    expect(draft.profile.mobilePhone).toBe("0612345678");
    expect(draft.profile.phone).toBe("");
  });

  it.each(["home", "depot"] as const)("clears an unused alternate address even in an older saved draft departing from %s", async departureKind => {
    const draft = defaultOnboarding(profile, preferences);
    draft.transport = { ...draft.transport, departureKind, departureDepotId: "11111111-1111-4111-8111-111111111111", alternateDepartureAddress: { street: "", postalCode: "", city: "", country: "NL" } };
    draft.confirmations = { details: true, availability: false, notifications: true, privacy: true, terms: true };
    expect(await saveStaffOnboarding({ onboardingVersion: 2, personnelVersion: 3, step: 4, draft, complete: true })).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("staff_save_onboarding", expect.objectContaining({
      complete: true, input: expect.objectContaining({ onboardingVersion: 2, personnelVersion: 3, draft: expect.objectContaining({ transport: expect.objectContaining({ alternateDepartureAddress: null, returnToDeparture: true }) }) }),
    }));
    // Sanitizing the parsed payload must not discard the in-memory form values.
    expect(draft.transport.alternateDepartureAddress).not.toBeNull();
  });

  it("keeps and validates an explicitly chosen alternate departure address", async () => {
    const draft = defaultOnboarding(profile, preferences);
    draft.transport.departureKind = "alternate";
    draft.transport.alternateDepartureAddress = { street: "Andere straat 2", postalCode: "1234 AB", city: "Teststad", country: "NL" };
    expect(await saveStaffOnboarding({ onboardingVersion: 2, personnelVersion: 3, step: 2, draft, complete: false })).toEqual({ ok: true });
    expect(mocks.rpc.mock.calls[0][1].input.draft.transport.alternateDepartureAddress).toEqual(draft.transport.alternateDepartureAddress);
    mocks.rpc.mockClear();
    draft.transport.alternateDepartureAddress.street = "";
    expect(await saveStaffOnboarding({ onboardingVersion: 2, personnelVersion: 3, step: 2, draft, complete: false })).toMatchObject({ ok: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("prototype onboarding presentation", () => {
  const render = (step: number, availability = false) => renderToStaticMarkup(createElement(Onboarding, {
    profile: { ...profile, onboarding_step: step, availability_self_service_enabled: availability }, depots: [], email: "sam@example.test",
    notificationPreferences: preferences, pending: false, run: vi.fn(), onCompleted: vi.fn(),
  }));

  it.each([false, true])("keeps the applicable five or six steps and a readable account heading (%s)", availability => {
    const html = render(0, availability);
    expect(html).toContain("Account instellen");
    expect(html).toContain(`Stap 1 van ${availability ? 6 : 5}`);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Beginnen");
  });

  it("groups the optional emergency contact and removes the return-trip control only from the wizard", () => {
    expect(render(1)).toContain("Noodcontact");
    expect(render(2)).toContain("Vertreklocatie is mijn woonadres");
    expect(render(2)).not.toContain("Na de laatste afspraak");
    expect(render(2)).not.toContain("returnToDeparture");
  });

  it("keeps per-topic channels and shows Dutch transport labels in review", () => {
    expect(render(3)).toContain("Nieuwe planning");
    expect(render(3)).toContain("In app");
    expect(render(3)).toContain("Rusttijden instellen");
    const review = render(4);
    expect(review).toContain("Vertrek vanaf woonadres");
    expect(review).toContain("Auto");
    expect(review).toContain("Bevestigen en afronden");
  });
});
