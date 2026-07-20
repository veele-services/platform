"use client";

import { useId, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type FormKind = "contact" | "offerte" | "sollicitatie";
type SubmitState = "idle" | "sending" | "success" | "error";

const labels: Record<FormKind, { eyebrow: string; heading: string; description: string }> = {
  contact: {
    eyebrow: "Neem contact op",
    heading: "Vertel ons waar we kunnen helpen.",
    description:
      "Deel uw vraag en contactgegevens. We gebruiken uw gegevens uitsluitend om op deze aanvraag te reageren.",
  },
  offerte: {
    eyebrow: "Offerte aanvragen",
    heading: "Vertel ons wat u nodig heeft.",
    description:
      "Omschrijf de locatie, werkzaamheden en gewenste start. We nemen contact op om uw aanvraag zorgvuldig door te spreken.",
  },
  sollicitatie: {
    eyebrow: "Kom werken bij Veele",
    heading: "Vertel ons welk werk u zoekt.",
    description:
      "Noem de gewenste functie, regio, het aantal uren en uw beschikbaarheid. Stuur geen bijzondere persoonsgegevens mee.",
  },
};

export function LeadForm({ kind }: { kind: FormKind }) {
  const id = useId();
  const [state, setState] = useState<SubmitState>("idle");
  const [feedback, setFeedback] = useState("");
  const copy = labels[kind];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    if (!form.reportValidity()) return;

    setState("sending");
    setFeedback("");

    const formData = new FormData(form);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);

    try {
      const apiResponse = await fetch(kind === "offerte" ? "/api/offerte" : "/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          kind,
          name: formData.get("name"),
          organisation: formData.get("organisation"),
          email: formData.get("email"),
          phone: formData.get("phone"),
          message: formData.get("message"),
          consent: formData.get("consent") === "yes",
          website: formData.get("website"),
        }),
      });

      const result = (await apiResponse.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!apiResponse.ok) {
        setState("error");
        setFeedback(
          apiResponse.status === 429
            ? "U heeft kort na elkaar meerdere aanvragen verstuurd. Probeer het over enkele minuten opnieuw."
            : result?.message ??
                "Versturen lukt op dit moment niet. Probeer het later opnieuw of neem rechtstreeks contact op.",
        );
        return;
      }

      setState("success");
      setFeedback("Dank u. Uw aanvraag is ontvangen.");
      form.reset();
    } catch {
      setState("error");
      setFeedback(
        "Er is geen verbinding met het formulier. Probeer het opnieuw of neem rechtstreeks contact op.",
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return (
    <section className="section-pad bg-white">
      <div className="container-shell grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 className="section-title">{copy.heading}</h2>
          <p className="section-copy">{copy.description}</p>
          <div className="mt-7 flex max-w-md items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--cloud)] p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--aqua-soft)] text-brand-aqua-deep"><ShieldCheck aria-hidden="true" className="size-4" /></span>
            <p className="text-xs leading-6 text-brand-slate"><strong className="block text-brand-navy">Zorgvuldig met uw gegevens</strong>Alleen gebruikt om uw aanvraag te beoordelen en te beantwoorden.</p>
          </div>
        </div>

        <form
          aria-busy={state === "sending"}
          aria-describedby={`${id}-privacy ${id}-status`}
          className="relative grid gap-5 overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-[0_24px_70px_rgba(3,20,38,.1)] sm:p-8"
          onSubmit={submit}
        >
          <span aria-hidden="true" className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--aqua)] to-transparent" />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-[13px] font-bold text-brand-navy" htmlFor={`${id}-name`}>
              Naam
              <Input
                id={`${id}-name`}
                name="name"
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                placeholder="Voor- en achternaam"
              />
            </label>
            <label className="grid gap-2 text-[13px] font-bold text-brand-navy" htmlFor={`${id}-organisation`}>
              Organisatie <span className="ml-1 text-xs font-medium text-slate-600">(optioneel)</span>
              <Input
                id={`${id}-organisation`}
                name="organisation"
                maxLength={160}
                autoComplete="organization"
                placeholder="Naam van uw organisatie"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-[13px] font-bold text-brand-navy" htmlFor={`${id}-email`}>
              E-mailadres
              <Input
                id={`${id}-email`}
                type="email"
                name="email"
                required
                maxLength={254}
                inputMode="email"
                autoComplete="email"
                placeholder="naam@organisatie.nl"
              />
            </label>
            <label className="grid gap-2 text-[13px] font-bold text-brand-navy" htmlFor={`${id}-phone`}>
              Telefoonnummer <span className="ml-1 text-xs font-medium text-slate-600">(optioneel)</span>
              <Input
                id={`${id}-phone`}
                type="tel"
                name="phone"
                maxLength={40}
                inputMode="tel"
                autoComplete="tel"
                placeholder="Bijvoorbeeld 06 12345678"
              />
            </label>
          </div>

          <label className="grid gap-2 text-[13px] font-bold text-brand-navy" htmlFor={`${id}-message`}>
            {kind === "sollicitatie" ? "Uw toelichting" : "Uw vraag"}
            <Textarea
              id={`${id}-message`}
              name="message"
              required
              minLength={10}
              maxLength={4_000}
              placeholder={kind === "sollicitatie" ? "Functie, regio, uren en beschikbaarheid" : kind === "offerte" ? "Locatie, werkzaamheden en gewenste start" : "Waar kunnen we u mee helpen?"}
            />
          </label>

          <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <label htmlFor={`${id}-website`}>Website</label>
            <input
              id={`${id}-website`}
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm leading-6 text-slate-700 transition-colors hover:border-slate-300">
            <input
              className="mt-0.5 size-5 shrink-0 rounded accent-[var(--aqua-deep)]"
              type="checkbox"
              name="consent"
              value="yes"
              required
            />
            <span id={`${id}-privacy`}>
              Ik geef toestemming om mijn gegevens te verwerken voor het beantwoorden van deze aanvraag.
            </span>
          </label>

          <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={state === "sending"}>
            {state === "sending" && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
            {state === "sending" ? "Versturen…" : "Verstuur aanvraag"}
          </Button>

          <p
            id={`${id}-status`}
            role={state === "error" ? "alert" : "status"}
            aria-live={state === "error" ? "assertive" : "polite"}
            className={
              state === "success"
                ? "flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"
                : state === "error"
                  ? "flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
                  : "sr-only"
            }
          >
            {state === "success" && <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
            {state === "error" && <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
            {feedback}
          </p>
        </form>
      </div>
    </section>
  );
}
