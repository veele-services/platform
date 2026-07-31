"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Controller,
  useForm,
  type Control,
  type FieldValues,
} from "react-hook-form";
import {
  BellRing,
  Check,
  ChevronLeft,
  Loader2,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import {
  ONBOARDING_PERSONNEL_NOTIFICATION_CATEGORIES,
  PERSONNEL_ONBOARDING_STEPS,
  type PersonnelOnboardingStep,
  type PortalOnboardingDraft,
  type PortalPushStatus,
} from "@workspace/db/portal-onboarding-client";
import { CheckboxAdapter, SelectAdapter } from "@workspace/shared-ui";
import {
  completePersonnelOnboarding,
  savePersonnelOnboardingStep,
  type PersonnelOnboardingWorkspace,
} from "@/actions/onboarding";
import { saveMyPushSubscription } from "@/actions/push";
import { signOut } from "@/actions/auth";
import { ensureBrowserPushSubscription } from "@/lib/browser-push";

type FormValues = FieldValues;

const STEP_LABELS: Record<PersonnelOnboardingStep, string> = {
  welcome: "Welkom",
  profile: "Profiel",
  transport: "Vervoer",
  work: "Werkprofiel",
  availability: "Beschikbaarheid",
  notifications: "Meldingen",
  review: "Controleren",
};

const TRANSPORT_OPTIONS = [
  ["car", "Auto"],
  ["van", "Bestelbus"],
  ["motorcycle", "Motor"],
  ["scooter", "Scooter of brommer"],
  ["electric_bicycle", "Elektrische fiets"],
  ["bicycle", "Fiets"],
  ["public_transport", "Openbaar vervoer"],
  ["walking", "Lopend"],
  ["other", "Anders"],
] as const;

const DAYS = [
  "Maandag",
  "Dinsdag",
  "Woensdag",
  "Donderdag",
  "Vrijdag",
  "Zaterdag",
  "Zondag",
];
const CATEGORY_LABELS: Record<string, string> = {
  new_planning: "Nieuwe planning",
  changed_planning: "Gewijzigde planning",
  cancelled_assignment: "Geannuleerde opdracht",
  assignment_reminder: "Herinnering voor opdracht",
  open_assignments: "Open opdrachten",
  availability_decision: "Besluit over beschikbaarheid",
  messages: "Berichten",
  work_order_updates: "Werkbonupdates",
  announcements: "Mededelingen",
  expiring_documents: "Verlopende documenten",
  urgent_operations: "Urgente operationele meldingen",
};

const inputClass =
  "mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
const labelClass = "block text-sm font-bold text-slate-700";

function sectionTitle(title: string, description?: string) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-black text-slate-950">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      ) : null}
    </div>
  );
}

function ErrorSummary({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800"
    >
      {message}
    </div>
  );
}

export function PersonnelOnboardingWizard({
  workspace,
}: {
  workspace: PersonnelOnboardingWorkspace;
}) {
  const [step, setStep] = useState<PersonnelOnboardingStep>(
    workspace.currentStep,
  );
  const [draft, setDraft] = useState<PortalOnboardingDraft>(workspace.draft);
  const [completeness, setCompleteness] = useState(workspace.completeness);
  const [message, setMessage] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const { control, register, handleSubmit, reset, setValue, watch } =
    useForm<FormValues>({
      defaultValues: (workspace.draft[workspace.currentStep] ??
        {}) as FormValues,
    });
  const currentIndex = PERSONNEL_ONBOARDING_STEPS.indexOf(step);
  const progress = Math.max(
    completeness,
    Math.round((currentIndex / (PERSONNEL_ONBOARDING_STEPS.length - 1)) * 100),
  );

  function openStep(next: PersonnelOnboardingStep, nextDraft = draft) {
    setStep(next);
    reset((nextDraft[next] ?? {}) as FormValues);
    setMessage("");
    setPushMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function save(values: FormValues, continueToNext: boolean) {
    setMessage("");
    startTransition(async () => {
      const result = await savePersonnelOnboardingStep({
        step,
        payload: values,
        continueToNext,
      });
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      const nextDraft = { ...draft, [step]: values };
      setDraft(nextDraft);
      setCompleteness(result.completeness);
      if (!continueToNext) {
        setMessage("Opgeslagen. Je kunt later veilig verdergaan.");
        return;
      }
      if (step !== "review") {
        openStep(result.currentStep, nextDraft);
        return;
      }
      const completed = await completePersonnelOnboarding();
      if (!completed.success) {
        setMessage(completed.error);
        return;
      }
      window.location.assign("/personeel");
    });
  }

  function activatePush() {
    setPushMessage("");
    startTransition(async () => {
      let status: PortalPushStatus = "unsupported";
      try {
        const subscription = await ensureBrowserPushSubscription();
        const serialized = subscription.toJSON();
        const saved = await saveMyPushSubscription({
          endpoint: serialized.endpoint ?? "",
          keys: {
            p256dh: serialized.keys?.p256dh,
            auth: serialized.keys?.auth,
          },
          userAgent: navigator.userAgent,
        });
        if (!saved.success) throw new Error(saved.error);
        status = "allowed";
        setPushMessage("Pushmeldingen zijn op dit apparaat geactiveerd.");
      } catch (error) {
        status =
          typeof Notification !== "undefined" &&
          Notification.permission === "denied"
            ? "denied"
            : "unsupported";
        setPushMessage(
          error instanceof Error ? error.message : "Push activeren is mislukt.",
        );
      }
      setValue("pushAttempted", true, { shouldDirty: true });
      setValue("pushStatus", status, { shouldDirty: true });
    });
  }

  const review = useMemo(
    () => ({
      profile: draft.profile as FormValues | undefined,
      transport: draft.transport as FormValues | undefined,
      work: draft.work as FormValues | undefined,
    }),
    [draft],
  );

  return (
    <main className="min-h-dvh bg-slate-100 pb-36 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 pb-4 pt-[calc(1rem+var(--safe-top))] backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-teal-700">
                {workspace.organizationName}
              </p>
              <h1 className="text-lg font-black">Account instellen</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-black text-teal-800">
                {progress}%
              </span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600"
                  aria-label="Uitloggen"
                >
                  <LogOut size={18} />
                </button>
              </form>
            </div>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"
            aria-label={`${progress}% voltooid`}
          >
            <div
              className="h-full rounded-full bg-teal-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-bold text-slate-500">
            Stap {currentIndex + 1} van {PERSONNEL_ONBOARDING_STEPS.length}:{" "}
            {STEP_LABELS[step]}
          </p>
        </div>
      </header>

      <form
        onSubmit={handleSubmit((values) => save(values, true))}
        className="mx-auto max-w-2xl px-4 py-6"
      >
        <section className="rounded-3xl bg-white p-5 shadow-sm sm:p-7">
          {step === "welcome" ? (
            <>
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                <ShieldCheck />
              </div>
              {sectionTitle(
                `Welkom bij ${workspace.organizationName}`,
                "We vragen alleen gegevens die nodig zijn om je profiel, communicatie, inzetbaarheid en planning goed in te stellen.",
              )}
              <ul className="space-y-3 text-sm leading-6 text-slate-700">
                {[
                  "Je profiel en bereikbaarheid",
                  "Vervoer en werkvoorkeuren",
                  "Je eerste beschikbaarheid",
                  "E-mail-, app- en pushmeldingen",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <Check
                      className="mt-0.5 shrink-0 text-teal-600"
                      size={18}
                    />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                Je invoer wordt na elke stap veilig opgeslagen. Lees meer in de{" "}
                <a
                  className="font-black text-teal-700 underline"
                  href="/personeel/privacy"
                >
                  help- en privacy-informatie
                </a>
                .
              </p>
            </>
          ) : null}

          {step === "profile" ? (
            <>
              {sectionTitle(
                "Persoonsgegevens",
                "Controleer de bekende gegevens en vul ontbrekende informatie aan.",
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Voornaam *
                  <input
                    required
                    autoComplete="given-name"
                    className={inputClass}
                    {...register("firstName")}
                  />
                </label>
                <label className={labelClass}>
                  Achternaam *
                  <input
                    required
                    autoComplete="family-name"
                    className={inputClass}
                    {...register("lastName")}
                  />
                </label>
                <label className={labelClass}>
                  Roepnaam
                  <input
                    className={inputClass}
                    {...register("preferredName")}
                  />
                </label>
                <label className={labelClass}>
                  Mobiel nummer *
                  <input
                    required
                    type="tel"
                    autoComplete="tel"
                    className={inputClass}
                    {...register("phone")}
                  />
                </label>
                <label className={labelClass}>
                  Tweede telefoonnummer
                  <input
                    type="tel"
                    className={inputClass}
                    {...register("secondaryPhone")}
                  />
                </label>
                <label className={labelClass}>
                  Persoonlijk e-mailadres
                  <input
                    type="email"
                    autoComplete="email"
                    className={inputClass}
                    {...register("personalEmail")}
                  />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  Straat en huisnummer *
                  <input
                    required
                    autoComplete="street-address"
                    className={inputClass}
                    {...register("addressStreet")}
                  />
                </label>
                <label className={labelClass}>
                  Postcode *
                  <input
                    required
                    autoComplete="postal-code"
                    className={inputClass}
                    {...register("addressPostalCode")}
                  />
                </label>
                <label className={labelClass}>
                  Woonplaats *
                  <input
                    required
                    autoComplete="address-level2"
                    className={inputClass}
                    {...register("addressCity")}
                  />
                </label>
                <label className={labelClass}>
                  Land *
                  <input
                    required
                    autoComplete="country-name"
                    className={inputClass}
                    {...register("addressCountry")}
                  />
                </label>
                <label className={labelClass}>
                  Geboortedatum
                  <input
                    type="date"
                    className={inputClass}
                    {...register("birthDate")}
                  />
                </label>
              </div>
              <fieldset className="mt-6 rounded-2xl border border-slate-200 p-4">
                <legend className="px-2 text-sm font-black">
                  Noodcontact (optioneel)
                </legend>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className={labelClass}>
                    Naam
                    <input
                      className={inputClass}
                      {...register("emergencyContactName")}
                    />
                  </label>
                  <label className={labelClass}>
                    Telefoon
                    <input
                      type="tel"
                      className={inputClass}
                      {...register("emergencyContactPhone")}
                    />
                  </label>
                  <label className={labelClass}>
                    Relatie
                    <input
                      className={inputClass}
                      {...register("emergencyContactRelation")}
                    />
                  </label>
                </div>
              </fieldset>
            </>
          ) : null}

          {step === "transport" ? (
            <>
              {sectionTitle(
                "Vervoer en reisbereidheid",
                "Deze waarden zijn planningsvoorkeuren. Een afwijking hoort gemotiveerd te worden.",
              )}
              <label className={labelClass}>
                Primair vervoerstype *
                <Controller
                  control={control}
                  name="primaryTransportType"
                  rules={{ required: true }}
                  render={({ field }) => (
                    <SelectAdapter
                      required
                      className={inputClass}
                      value={String(field.value ?? "")}
                      onChange={(event) =>
                        field.onChange(event.currentTarget.value)
                      }
                      onBlur={field.onBlur}
                      name={field.name}
                    >
                      {TRANSPORT_OPTIONS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </SelectAdapter>
                  )}
                />
              </label>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Toggle
                  control={control}
                  name="ownTransport"
                  label="Ik beschik over eigen vervoer"
                />
                <Toggle
                  control={control}
                  name="validDrivingLicense"
                  label="Ik heb een geldig rijbewijs"
                />
                <Toggle
                  control={control}
                  name="willingToCarpool"
                  label="Ik wil collega's meenemen"
                />
                <Toggle
                  control={control}
                  name="departureSameAsHome"
                  label="Vertreklocatie is mijn woonadres"
                />
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Rijbewijscategorieën
                  <input
                    placeholder="Bijv. B, BE"
                    className={inputClass}
                    {...register("drivingLicenseCategories", {
                      setValueAs: (value) =>
                        String(value)
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                    })}
                    defaultValue={
                      Array.isArray(watch("drivingLicenseCategories"))
                        ? watch("drivingLicenseCategories").join(", ")
                        : ""
                    }
                  />
                </label>
                <label className={labelClass}>
                  Maximale reisafstand (km) *
                  <input
                    required
                    type="number"
                    min="0"
                    max="500"
                    className={inputClass}
                    {...register("maxTravelDistanceKm", {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className={labelClass}>
                  Maximale reistijd (minuten) *
                  <input
                    required
                    type="number"
                    min="0"
                    max="600"
                    className={inputClass}
                    {...register("maxTravelTimeMinutes", {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className={labelClass}>
                  Afwijkende vertreklocatie
                  <input
                    className={inputClass}
                    {...register("departureLocation")}
                  />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  Vervoersbeperkingen
                  <textarea
                    rows={3}
                    className={inputClass}
                    {...register("limitations")}
                  />
                </label>
              </div>
            </>
          ) : null}

          {step === "work" ? (
            <>
              {sectionTitle(
                "Werkprofiel",
                "Gevoelige HR-gegevens, identiteitsdocumenten en bankgegevens worden hier bewust niet gevraagd.",
              )}
              <label className={labelClass}>
                Talen (gescheiden door komma's)
                <input
                  required
                  className={inputClass}
                  {...register("languages", {
                    setValueAs: (value) =>
                      String(value)
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                  })}
                  defaultValue={
                    Array.isArray(watch("languages"))
                      ? watch("languages").join(", ")
                      : ""
                  }
                />
              </label>
              <fieldset className="mt-5">
                <legend className={labelClass}>Dienstvoorkeuren *</legend>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[
                    ["day", "Dag"],
                    ["evening", "Avond"],
                    ["night", "Nacht"],
                  ].map(([value, label]) => (
                    <label
                      key={value}
                      className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold"
                    >
                      <ControlledCheckbox
                        control={control}
                        name="preferredShifts"
                        value={value}
                        ariaLabel={label}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Toggle
                  control={control}
                  name="weekendAvailable"
                  label="Beschikbaar in weekenden"
                />
                <Toggle
                  control={control}
                  name="holidayAvailable"
                  label="Beschikbaar op feestdagen"
                />
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Maximale uren per week *
                  <input
                    required
                    type="number"
                    min="1"
                    max="80"
                    className={inputClass}
                    {...register("maxHoursPerWeek", { valueAsNumber: true })}
                  />
                </label>
                <label className={labelClass}>
                  Gewenste minimumuren *
                  <input
                    required
                    type="number"
                    min="0"
                    max="80"
                    className={inputClass}
                    {...register("desiredMinHoursPerWeek", {
                      valueAsNumber: true,
                    })}
                  />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  Opmerkingen voor planning
                  <textarea
                    rows={4}
                    className={inputClass}
                    {...register("planningNotes")}
                  />
                </label>
              </div>
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                Functies, categorieën en certificaten worden door je werkgever
                beheerd. Neem contact op als die gegevens niet kloppen.
              </p>
            </>
          ) : null}

          {step === "availability" ? (
            <>
              {sectionTitle(
                "Eerste beschikbaarheid",
                "Geef voor minimaal één dag aan wanneer je terugkerend beschikbaar bent.",
              )}
              <div className="space-y-3">
                {DAYS.map((day, index) => (
                  <fieldset
                    key={day}
                    className="rounded-2xl border border-slate-200 p-3"
                  >
                    <legend className="px-1 text-sm font-black">{day}</legend>
                    <input
                      type="hidden"
                      value={(index + 1) % 7}
                      {...register(`windows.${index}.dayOfWeek`, {
                        valueAsNumber: true,
                      })}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Toggle
                        control={control}
                        name={`windows.${index}.available`}
                        label="Beschikbaar"
                      />
                      <label className={labelClass}>
                        Vanaf
                        <input
                          type="time"
                          className={inputClass}
                          {...register(`windows.${index}.startTime`)}
                        />
                      </label>
                      <label className={labelClass}>
                        Tot
                        <input
                          type="time"
                          className={inputClass}
                          {...register(`windows.${index}.endTime`)}
                        />
                      </label>
                    </div>
                  </fieldset>
                ))}
              </div>
              <label className="mt-5 flex items-start gap-3 rounded-2xl bg-teal-50 p-4 text-sm font-bold text-teal-950">
                <ControlledCheckbox
                  control={control}
                  name="availabilityConfirmed"
                  required
                  className="mt-1"
                  ariaLabel="Beschikbaarheid gecontroleerd"
                />
                <span>
                  Ik heb mijn beschikbaarheid gecontroleerd en begrijp dat
                  wijzigingen binnen de ingestelde termijn eerst door de
                  planning moeten worden goedgekeurd.
                </span>
              </label>
            </>
          ) : null}

          {step === "notifications" ? (
            <>
              {sectionTitle(
                "Notificaties",
                "Kies per onderwerp e-mail, push en meldingen in de app. Kritieke meldingen blijven minimaal per e-mail en in de app actief.",
              )}
              <input type="hidden" {...register("pushStatus")} />
              <input type="hidden" {...register("pushAttempted")} />
              <button
                type="button"
                onClick={activatePush}
                disabled={pending}
                className="mb-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 font-black text-white disabled:opacity-60"
              >
                <BellRing size={18} />
                Push op dit apparaat instellen
              </button>
              {pushMessage ? (
                <p
                  role="status"
                  className="mb-4 rounded-xl bg-slate-100 p-3 text-sm font-bold text-slate-700"
                >
                  {pushMessage}
                </p>
              ) : null}
              <div className="space-y-3">
                {ONBOARDING_PERSONNEL_NOTIFICATION_CATEGORIES.map(
                  (category, index) => {
                    const critical = category === "urgent_operations";
                    return (
                      <fieldset
                        key={category}
                        className="rounded-2xl border border-slate-200 p-4"
                      >
                        <legend className="px-1 text-sm font-black">
                          {CATEGORY_LABELS[category]}
                          {critical ? " (kritiek)" : ""}
                        </legend>
                        <div className="mt-1 grid grid-cols-3 gap-2">
                          {[
                            ["emailEnabled", "E-mail"],
                            ["pushEnabled", "Push"],
                            ["inAppEnabled", "In app"],
                          ].map(([channel, label]) => (
                            <label
                              key={channel}
                              className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 text-xs font-bold"
                            >
                              <ControlledCheckbox
                                control={control}
                                name={`preferences.${index}.${channel}`}
                                ariaLabel={`${CATEGORY_LABELS[category]}: ${label}`}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                        <input
                          type="hidden"
                          value={category}
                          {...register(`preferences.${index}.category`)}
                        />
                        <input
                          type="hidden"
                          value={critical ? "true" : "false"}
                          {...register(`preferences.${index}.critical`, {
                            setValueAs: (value) =>
                              value === true || value === "true",
                          })}
                        />
                      </fieldset>
                    );
                  },
                )}
              </div>
            </>
          ) : null}

          {step === "review" ? (
            <>
              {sectionTitle(
                "Controleren en afronden",
                "Bekijk de belangrijkste gegevens en bevestig dat alles klopt.",
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <ReviewCard
                  title="Profiel"
                  values={[
                    `${review.profile?.firstName ?? ""} ${review.profile?.lastName ?? ""}`,
                    String(review.profile?.phone ?? ""),
                    `${review.profile?.addressPostalCode ?? ""} ${review.profile?.addressCity ?? ""}`,
                  ]}
                />
                <ReviewCard
                  title="Vervoer"
                  values={[
                    String(review.transport?.primaryTransportType ?? ""),
                    `Max. ${review.transport?.maxTravelDistanceKm ?? "-"} km`,
                  ]}
                />
                <ReviewCard
                  title="Werk"
                  values={[
                    `Max. ${review.work?.maxHoursPerWeek ?? "-"} uur/week`,
                    Array.isArray(review.work?.languages)
                      ? review.work.languages.join(", ")
                      : "",
                  ]}
                />
              </div>
              <div className="mt-5 space-y-3">
                <Confirm
                  control={control}
                  name="profileConfirmed"
                  label="Mijn profielgegevens zijn correct."
                />
                <Confirm
                  control={control}
                  name="availabilityConfirmed"
                  label="Mijn beschikbaarheid is correct."
                />
                <Confirm
                  control={control}
                  name="notificationsConfirmed"
                  label="Ik heb mijn notificatie-instellingen gecontroleerd."
                />
                <Confirm
                  control={control}
                  name="privacyViewed"
                  label="Ik heb de privacy-informatie bekeken."
                />
                <Confirm
                  control={control}
                  name="termsAccepted"
                  label="Ik accepteer de toepasselijke voorwaarden."
                />
              </div>
            </>
          ) : null}
        </section>

        {message ? (
          <div className="mt-4">
            {message.startsWith("Opgeslagen") ? (
              <p
                role="status"
                className="rounded-xl bg-teal-50 p-3 text-sm font-bold text-teal-900"
              >
                {message}
              </p>
            ) : (
              <ErrorSummary message={message} />
            )}
          </div>
        ) : null}

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-4 pb-[calc(1rem+var(--safe-bottom))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,.08)]">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <button
              type="button"
              disabled={pending || currentIndex === 0}
              onClick={() =>
                openStep(PERSONNEL_ONBOARDING_STEPS[currentIndex - 1]!)
              }
              className="flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-3 font-black disabled:opacity-40"
              aria-label="Vorige stap"
            >
              <ChevronLeft />
            </button>
            {step !== "welcome" && step !== "review" ? (
              <button
                type="button"
                disabled={pending}
                onClick={handleSubmit((values) => save(values, false))}
                className="min-h-12 flex-1 rounded-xl border border-slate-300 px-3 text-sm font-black disabled:opacity-50"
              >
                Opslaan en later
              </button>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="flex min-h-12 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-black text-white disabled:opacity-60"
            >
              {pending ? <Loader2 size={18} className="animate-spin" /> : null}
              {step === "welcome"
                ? "Onboarding starten"
                : step === "review"
                  ? "Bevestigen en afronden"
                  : "Opslaan en verder"}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

function Toggle({
  control,
  name,
  label,
}: {
  control: Control<FormValues>;
  name: string;
  label: string;
}) {
  return (
    <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-3 text-sm font-bold">
      <ControlledCheckbox control={control} name={name} ariaLabel={label} />
      {label}
    </label>
  );
}

function Confirm({
  control,
  name,
  label,
}: {
  control: Control<FormValues>;
  name: string;
  label: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm font-bold">
      <ControlledCheckbox
        control={control}
        name={name}
        required
        className="mt-0.5"
        ariaLabel={label}
      />
      {label}
    </label>
  );
}

function ControlledCheckbox({
  control,
  name,
  value,
  required = false,
  className,
  ariaLabel,
}: {
  control: Control<FormValues>;
  name: string;
  value?: string;
  required?: boolean;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      rules={{ required }}
      render={({ field }) => {
        const checked =
          value === undefined
            ? Boolean(field.value)
            : Array.isArray(field.value) && field.value.includes(value);

        return (
          <CheckboxAdapter
            checked={checked}
            value={value}
            required={required}
            className={className}
            aria-label={ariaLabel}
            onBlur={field.onBlur}
            onChange={(event) => {
              if (value === undefined) {
                field.onChange(event.currentTarget.checked);
                return;
              }

              const selected = Array.isArray(field.value)
                ? field.value.map(String)
                : [];
              field.onChange(
                event.currentTarget.checked
                  ? Array.from(new Set([...selected, value]))
                  : selected.filter((item) => item !== value),
              );
            }}
          />
        );
      }}
    />
  );
}

function ReviewCard({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <h3 className="font-black">{title}</h3>
      {values.filter(Boolean).map((value) => (
        <p key={value} className="mt-1 break-words text-sm text-slate-600">
          {value}
        </p>
      ))}
    </div>
  );
}
