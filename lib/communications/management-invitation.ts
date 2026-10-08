import { renderTenantEmailHtml, type EmailBrand } from "./email";

export function renderManagementInvitation(input: { brand: EmailBrand; name: string; role: string; targetUrl: string; allowLocalLinks?: boolean }) {
  const subject = `Uitnodiging voor ${input.brand.company}`;
  const body = `Hallo ${input.name},\n\nJe bent uitgenodigd voor de managementomgeving van ${input.brand.company} met de rol ${input.role}. Open het inlogscherm en vul dit e-mailadres in. Je ontvangt vervolgens een eenmalige inlogcode; een wachtwoord is niet nodig.\n\nJe beheerder bepaalt welke pagina’s en functies je kunt gebruiken. Heb je deze uitnodiging niet verwacht? Neem contact op met je beheerder.`;
  return { subject, text: `${body}\n\n${input.targetUrl}`, html: renderTenantEmailHtml({ kind: "auth_event", brand: input.brand, message: { subject, body }, targetUrl: input.targetUrl, targetLabel: "Managementomgeving openen", allowLocalLinks: input.allowLocalLinks }) };
}
