import { z } from "zod";
import { resolveHostContext } from "@/lib/tenancy/hostname";

// Deliberately strip metadata: it is neither branding nor authorization input.
export const authMailPayload = z.object({
  user: z.object({ id: z.uuid(), email: z.email(), new_email: z.string().optional() }),
  email_data: z.object({
    email_action_type: z.string().max(100), redirect_to: z.string().max(2048).default(""),
    token: z.string().max(512).default(""), token_hash: z.string().max(512).default(""),
    token_new: z.string().max(512).default(""), token_hash_new: z.string().max(512).default(""),
    old_email: z.string().max(320).default(""),
  }),
});
export type AuthMailPayload = z.infer<typeof authMailPayload>;
export const verificationType = z.enum(["signup", "invite", "recovery", "magiclink", "email_change", "email"]);

export function authMailDestination(redirectTo: string, appUrl: string, deployTarget: string) {
  const base = new URL(appUrl), target = new URL(redirectTo || appUrl);
  if (target.username || target.password || target.protocol !== base.protocol || target.port !== base.port || target.hash) throw new Error("Invalid Auth destination");
  const host = resolveHostContext(target.host, appUrl, deployTarget);
  if (host.kind === "invalid" || !["/", "/login", "/auth/confirm", "/auth/reset", "/auth/verify", "/app", "/staff", "/klant", "/platform"].includes(target.pathname)) throw new Error("Invalid Auth destination");
  // Redirect query strings (including next) never become an arbitrary redirect.
  return { origin: target.origin, slug: host.kind === "tenant" ? host.slug : null, staffOtp: target.pathname === "/staff" };
}

type AuthMessage = { recipient: string; subject: string; body: string; targetUrl: string; label: string; otp: boolean };
export function authMailMessages(payload: AuthMailPayload, origin: string, company: string, _staffOtp = false): AuthMessage[] {
  void _staffOtp;
  const d = payload.email_data, u = payload.user;
  const link = (recipient: string, hash: string, type: z.infer<typeof verificationType>, subject: string, body: string, label: string): AuthMessage => {
    if (!/^[A-Za-z0-9_-]{32,512}$/.test(hash)) throw new Error("Invalid Auth verification");
    const target = new URL("/auth/verify", origin);
    target.hash = new URLSearchParams({ token_hash: hash, type }).toString();
    return { recipient: z.email().parse(recipient), subject, body: `${body}\n\nHeb je dit niet aangevraagd? Gebruik de link dan niet en neem bij twijfel contact op met je beheerder. Deel deze persoonlijke link niet.`, targetUrl: target.href, label, otp: false };
  };
  switch (d.email_action_type) {
    case "signup": return [link(u.email, d.token_hash, "signup", `Bevestig je account bij ${company}`, "Bevestig je e-mailadres om je account te activeren.", "E-mailadres bevestigen")];
    case "invite": return [link(u.email, d.token_hash, "invite", `Uitnodiging voor ${company}`, `Je bent uitgenodigd voor de beveiligde omgeving van ${company}. Accepteer de uitnodiging. Daarna log je in met een eenmalige e-mailcode; een wachtwoord is niet nodig.`, "Uitnodiging accepteren")];
    case "recovery": return [{ recipient: u.email, subject: `Inloggen bij ${company}`, body: `Je hebt gevraagd om je wachtwoord opnieuw in te stellen. Bij ${company} log je in met een eenmalige e-mailcode. Open het inlogscherm en vraag daar een nieuwe code aan. Een wachtwoord is niet nodig.\n\nHeb je dit niet aangevraagd? Dan hoef je niets te doen.`, targetUrl: new URL("/login", origin).href, label: "Inlogcode aanvragen", otp: false }];
    case "magiclink": case "email": {
      if (!/^\d{6}$/.test(d.token)) throw new Error("Invalid Auth login code");
      return [{ recipient: u.email, subject: `Je inlogcode voor ${company}`, body: `Je eenmalige inlogcode is ${d.token}.\n\nVul deze code alleen in het geopende inlogscherm van ${company} in. De code verloopt en kan maar één keer worden gebruikt. Heb je dit niet aangevraagd? Deel de code niet en neem contact op met je beheerder.`, targetUrl: new URL("/login", origin).href, label: "", otp: true }];
    }
    case "email_change": {
      const recipient = z.email().parse(u.new_email);
      const body = "Bevestig dat je het e-mailadres van je account wilt wijzigen. Als je op beide adressen een bevestiging ontvangt, moet je beide bevestigen.";
      // Supabase's legacy field naming is reversed: _new belongs to CURRENT email.
      if (d.token_hash_new) {
        if (!d.token || !d.token_new) throw new Error("Incomplete secure email change");
        return [link(u.email, d.token_hash_new, "email_change", "Bevestig de wijziging van je e-mailadres", body, "Wijziging bevestigen"), link(recipient, d.token_hash, "email_change", "Bevestig je nieuwe e-mailadres", body, "Nieuw e-mailadres bevestigen")];
      }
      return [link(recipient, d.token_hash, "email_change", "Bevestig je nieuwe e-mailadres", body, "Nieuw e-mailadres bevestigen")];
    }
    case "reauthentication": {
      if (!/^\d{6,10}$/.test(d.token)) throw new Error("Invalid Auth code");
      return [{ recipient: u.email, subject: "Bevestig je accountwijziging", body: `Je verificatiecode is ${d.token}.\n\nVul deze alleen in het geopende scherm in. Heb je dit niet aangevraagd? Deel de code niet en neem contact op met je beheerder.`, targetUrl: origin, label: "", otp: true }];
    }
    default: {
      const notices: Record<string, string> = {
        password_changed_notification: "Je wachtwoord is gewijzigd.", email_changed_notification: "Het e-mailadres van je account is gewijzigd.",
        phone_changed_notification: "Het telefoonnummer van je account is gewijzigd.", identity_linked_notification: "Er is een inlogmethode aan je account gekoppeld.",
        identity_unlinked_notification: "Er is een inlogmethode van je account verwijderd.", mfa_factor_enrolled_notification: "Er is extra verificatie aan je account toegevoegd.",
        mfa_factor_unenrolled_notification: "Er is extra verificatie van je account verwijderd.",
      };
      const notice = notices[d.email_action_type];
      if (!notice) throw new Error("Unsupported Auth mail type");
      // Email changes notify the OLD mailbox as well as the current mailbox.
      const recipients = new Set([u.email, ...(d.email_action_type === "email_changed_notification" ? [z.email().parse(d.old_email)] : [])]);
      return [...recipients].map(recipient => ({ recipient, subject: `Accountbeveiliging bij ${company}`, body: `${notice}\n\nWas jij dit niet? Neem direct contact op met je beheerder en controleer de beveiliging van je account.`, targetUrl: new URL("/login", origin).href, label: "Beveiligde omgeving openen", otp: false }));
    }
  }
}
