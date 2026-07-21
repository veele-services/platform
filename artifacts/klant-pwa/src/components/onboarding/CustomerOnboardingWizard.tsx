"use client";

import { useMemo, useState, useTransition } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import {
  BellRing,
  Building2,
  Check,
  ChevronLeft,
  Loader2,
  LogOut,
} from "lucide-react";
import {
  CUSTOMER_ONBOARDING_STEPS,
  ONBOARDING_CUSTOMER_NOTIFICATION_CATEGORIES,
  type CustomerOnboardingStep,
  type PortalOnboardingDraft,
  type PortalPushStatus,
} from "@workspace/db/portal-onboarding-client";
import {
  completeCustomerOnboarding,
  saveCustomerOnboardingStep,
  type CustomerOnboardingWorkspace,
} from "@/actions/onboarding";
import { saveMyCustomerPushSubscription } from "@/actions/push";
import { signOut } from "@/actions/auth";
import { ensureCustomerBrowserPushSubscription } from "@/lib/browser-push";

type FormValues = FieldValues;
const inputClass =
  "mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
const labelClass = "block text-sm font-bold text-slate-700";
const STEP_LABELS: Record<CustomerOnboardingStep, string> = {
  welcome: "Welkom",
  organization: "Organisatie",
  contact: "Contactpersoon",
  notifications: "Meldingen",
  review: "Controleren",
};
const CATEGORY_LABELS: Record<string, string> = {
  quotes: "Offertes",
  assignments: "Opdrachten",
  planning_changes: "Planningswijzigingen",
  personnel_progress: "Voortgang personeel",
  work_completed: "Werk afgerond",
  reports: "Rapportages",
  incidents: "Incidenten",
  extra_work: "Meerwerk",
  invoices: "Facturen",
  payment_reminders: "Betalingsherinneringen",
  support: "Support",
  announcements: "Belangrijke mededelingen",
};

export function CustomerOnboardingWizard({
  workspace,
}: {
  workspace: CustomerOnboardingWorkspace;
}) {
  const [step, setStep] = useState<CustomerOnboardingStep>(
    workspace.currentStep,
  );
  const [draft, setDraft] = useState<PortalOnboardingDraft>(workspace.draft);
  const [completeness, setCompleteness] = useState(workspace.completeness);
  const [message, setMessage] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, reset, setValue } = useForm<FormValues>({
    defaultValues: (workspace.draft[workspace.currentStep] ?? {}) as FormValues,
  });
  const currentIndex = CUSTOMER_ONBOARDING_STEPS.indexOf(step);
  const progress = Math.max(
    completeness,
    Math.round((currentIndex / (CUSTOMER_ONBOARDING_STEPS.length - 1)) * 100),
  );

  function openStep(next: CustomerOnboardingStep, nextDraft = draft) {
    setStep(next);
    reset((nextDraft[next] ?? {}) as FormValues);
    setMessage("");
    setPushMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function save(values: FormValues, continueToNext: boolean) {
    setMessage("");
    startTransition(async () => {
      const result = await saveCustomerOnboardingStep({
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
        setMessage("Opgeslagen. U kunt later veilig verdergaan.");
        return;
      }
      if (step !== "review") {
        openStep(result.currentStep, nextDraft);
        return;
      }
      const completed = await completeCustomerOnboarding();
      if (!completed.success) {
        setMessage(completed.error);
        return;
      }
      window.location.assign("/klant");
    });
  }

  function activatePush() {
    setPushMessage("");
    startTransition(async () => {
      let status: PortalPushStatus = "unsupported";
      try {
        const subscription = await ensureCustomerBrowserPushSubscription();
        const serialized = subscription.toJSON();
        const saved = await saveMyCustomerPushSubscription({
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
      organization: draft.organization as FormValues | undefined,
      contact: draft.contact as FormValues | undefined,
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
              <h1 className="text-lg font-black">Klantaccount instellen</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-black text-teal-800">
                {progress}%
              </span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600"
                  aria-label="Uitloggen"
                >
                  <LogOut size={18} />
                </button>
              </form>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-teal-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-bold text-slate-500">
            Stap {currentIndex + 1} van {CUSTOMER_ONBOARDING_STEPS.length}:{" "}
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
                <Building2 />
              </div>
              <Title
                title={`Welkom bij ${workspace.organizationName}`}
                description="Controleer de organisatie- en contactgegevens en stel in hoe u berichten wilt ontvangen."
              />
              <ul className="space-y-3 text-sm leading-6 text-slate-700">
                {[
                  "Organisatiegegevens",
                  "Uw contactgegevens",
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
                Uw invoer wordt na elke stap opgeslagen. Er worden geen
                privé-adresgegevens gevraagd. Lees meer in de{" "}
                <a
                  className="font-black text-teal-700 underline"
                  href="/klant/help"
                >
                  help- en privacy-informatie
                </a>
                .
              </p>
            </>
          ) : null}

          {step === "organization" ? (
            <>
              <Title
                title="Organisatiegegevens"
                description="Controleer de gegevens die al door uw beheerder zijn ingevuld."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  register={register}
                  name="officialName"
                  label="Officiële bedrijfsnaam"
                  required
                  autoComplete="organization"
                />
                <Field
                  register={register}
                  name="tradeName"
                  label="Handelsnaam"
                  required
                />
                <Field
                  register={register}
                  name="legalForm"
                  label="Rechtsvorm"
                  required
                />
                <Field
                  register={register}
                  name="chamberOfCommerceNumber"
                  label="KvK-nummer"
                  required
                  inputMode="numeric"
                />
                <Field
                  register={register}
                  name="vatNumber"
                  label="Btw-nummer"
                />
                <Field
                  register={register}
                  name="registrationCountry"
                  label="Land van registratie"
                  required
                />
                <Field
                  register={register}
                  name="businessPhone"
                  label="Zakelijk telefoonnummer"
                  required
                  type="tel"
                  autoComplete="tel"
                />
                <Field
                  register={register}
                  name="businessEmail"
                  label="Algemeen zakelijk e-mailadres"
                  required
                  type="email"
                  autoComplete="email"
                />
                <div className="sm:col-span-2">
                  <Field
                    register={register}
                    name="addressStreet"
                    label="Bezoekadres"
                    required
                    autoComplete="street-address"
                  />
                </div>
                <Field
                  register={register}
                  name="postalCode"
                  label="Postcode"
                  required
                  autoComplete="postal-code"
                />
                <Field
                  register={register}
                  name="city"
                  label="Plaats"
                  required
                  autoComplete="address-level2"
                />
                <Field
                  register={register}
                  name="country"
                  label="Land"
                  required
                  autoComplete="country-name"
                />
                <Field
                  register={register}
                  name="website"
                  label="Website"
                  type="url"
                />
              </div>
            </>
          ) : null}

          {step === "contact" ? (
            <>
              <Title
                title="Uw contactgegevens"
                description="Het account-e-mailadres is beveiligd en kan alleen door een beheerder worden gewijzigd."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  register={register}
                  name="firstName"
                  label="Voornaam"
                  required
                  autoComplete="given-name"
                />
                <Field
                  register={register}
                  name="lastName"
                  label="Achternaam"
                  required
                  autoComplete="family-name"
                />
                <Field
                  register={register}
                  name="function"
                  label="Functie"
                  required
                  autoComplete="organization-title"
                />
                <Field
                  register={register}
                  name="businessPhone"
                  label="Zakelijk telefoonnummer"
                  required
                  type="tel"
                />
                <Field
                  register={register}
                  name="mobile"
                  label="Mobiel of direct nummer"
                  type="tel"
                />
                <label className={labelClass}>
                  Account-e-mailadres
                  <input
                    readOnly
                    type="email"
                    className={`${inputClass} bg-slate-100 text-slate-500`}
                    {...register("email")}
                  />
                </label>
              </div>
            </>
          ) : null}

          {step === "notifications" ? (
            <>
              <Title
                title="Notificaties"
                description="Kies per onderwerp e-mail, push en meldingen in het portaal. Kritieke berichten blijven minimaal per e-mail en in het portaal actief."
              />
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
                {ONBOARDING_CUSTOMER_NOTIFICATION_CATEGORIES.map(
                  (category, index) => {
                    const critical =
                      category === "incidents" || category === "announcements";
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
                            ["inAppEnabled", "In portaal"],
                          ].map(([channel, label]) => (
                            <label
                              key={channel}
                              className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl bg-slate-50 text-xs font-bold"
                            >
                              <input
                                type="checkbox"
                                {...register(`preferences.${index}.${channel}`)}
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
              <Title
                title="Controleren en afronden"
                description="Bevestig dat u bevoegd bent en dat de gegevens correct zijn."
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <ReviewCard
                  title="Organisatie"
                  values={[
                    String(review.organization?.officialName ?? ""),
                    String(review.organization?.chamberOfCommerceNumber ?? ""),
                    `${review.organization?.postalCode ?? ""} ${review.organization?.city ?? ""}`,
                  ]}
                />
                <ReviewCard
                  title="Contactpersoon"
                  values={[
                    `${review.contact?.firstName ?? ""} ${review.contact?.lastName ?? ""}`,
                    String(review.contact?.function ?? ""),
                    String(review.contact?.email ?? ""),
                  ]}
                />
              </div>
              <div className="mt-5 space-y-3">
                <Confirm
                  register={register}
                  name="authorized"
                  label="Ik ben bevoegd om deze organisatiegegevens te bevestigen."
                />
                <Confirm
                  register={register}
                  name="organizationConfirmed"
                  label="De organisatiegegevens zijn correct."
                />
                <Confirm
                  register={register}
                  name="contactConfirmed"
                  label="Mijn contactgegevens zijn correct."
                />
                <Confirm
                  register={register}
                  name="privacyViewed"
                  label="Ik heb de privacy-informatie bekeken."
                />
                <Confirm
                  register={register}
                  name="termsAccepted"
                  label="Ik accepteer de toepasselijke voorwaarden."
                />
              </div>
            </>
          ) : null}
        </section>

        {message ? (
          <div
            role="alert"
            className={`mt-4 rounded-xl p-3 text-sm font-bold ${message.startsWith("Opgeslagen") ? "bg-teal-50 text-teal-900" : "border border-red-200 bg-red-50 text-red-800"}`}
          >
            {message}
          </div>
        ) : null}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-4 pb-[calc(1rem+var(--safe-bottom))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,.08)]">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <button
              type="button"
              disabled={pending || currentIndex === 0}
              onClick={() =>
                openStep(CUSTOMER_ONBOARDING_STEPS[currentIndex - 1]!)
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

function Title({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-black">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}
function Field({
  register,
  name,
  label,
  required = false,
  type = "text",
  ...input
}: {
  register: ReturnType<typeof useForm<FormValues>>["register"];
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  [key: string]: unknown;
}) {
  return (
    <label className={labelClass}>
      {label}
      {required ? " *" : ""}
      <input
        required={required}
        type={type}
        className={inputClass}
        {...input}
        {...register(name)}
      />
    </label>
  );
}
function Confirm({
  register,
  name,
  label,
}: {
  register: ReturnType<typeof useForm<FormValues>>["register"];
  name: string;
  label: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm font-bold">
      <input
        required
        type="checkbox"
        className="mt-0.5 h-5 w-5 accent-teal-600"
        {...register(name)}
      />
      {label}
    </label>
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
