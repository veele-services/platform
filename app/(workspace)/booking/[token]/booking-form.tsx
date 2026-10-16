"use client";

import { useActionState } from "react";
import { CalendarCheck2 } from "lucide-react";
import { bookAppointment, type BookingState } from "./actions";

type Slot = { id: string; starts_at: string; ends_at: string };

export function BookingForm({ token, slots, timezone }: { token: string; slots: Slot[]; timezone: string }) {
  const action = bookAppointment.bind(null, token);
  const [state, submit, pending] = useActionState(action, {} as BookingState);
  if (state.ok) return <div className="external-success"><CalendarCheck2 size={42}/><h1>Afspraak bevestigd</h1><p>Het gekozen tijdvak is veilig vastgelegd. Je kunt dit venster sluiten.</p></div>;
  return <form action={submit} className="booking-options"><fieldset disabled={pending}><legend>Kies een beschikbaar tijdvak</legend>{slots.map((slot, index) => <label key={slot.id}><input type="radio" name="slotId" value={slot.id} required defaultChecked={index === 0}/><span><strong>{new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: timezone }).format(new Date(slot.starts_at))}</strong><small>{new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(slot.starts_at))}–{new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(slot.ends_at))}</small></span></label>)}</fieldset>{state.error && <p className="auth-message error" role="alert">{state.error}</p>}<button className="primary-button full" disabled={pending || !slots.length}>{pending ? "Bevestigen…" : "Afspraak bevestigen"}</button></form>;
}
