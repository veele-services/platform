import { renderTenantEmailHtml, type EmailBrand } from "./email";
import { renderPlainEmail } from "./templates";

export function renderPersonnelInvitation(input: {
  brand: EmailBrand; name: string; employeeNumber: string; targetUrl: string;
  existingAccount: boolean; allowLocalLinks?: boolean;
}) {
  const message = {
    subject: "Uitnodiging voor het personeelsportaal van {bedrijfsnaam}",
    body: `Hallo {medewerkernaam},\n\nJe bent als personeelslid uitgenodigd voor het personeelsportaal van {bedrijfsnaam}. Hier bekijk je jouw planning en werkbonnen en leg je uitgevoerde werkzaamheden vast.\n\nJe personeelsnummer is {personeelsnummer}.\n\n${input.existingAccount
      ? "Je hebt al een account. Open het personeelsportaal met de knop hieronder en log in met je bestaande inloggegevens. Je wachtwoord blijft ongewijzigd."
      : "Activeer je personeelsaccount met de knop hieronder en kies daarna je eigen wachtwoord. Deze persoonlijke activatielink kun je één keer gebruiken. Is de link verlopen? Vraag je beheerder om een nieuwe uitnodiging."}\n\nVerwachtte je deze uitnodiging niet? Neem dan contact op met {bedrijfsnaam}. Deel deze e-mail niet met anderen.\n\nMet vriendelijke groet,\n{bedrijfsnaam}`,
  };
  const values = { bedrijfsnaam: input.brand.company, medewerkernaam: input.name, personeelsnummer: input.employeeNumber, portaallink: input.targetUrl };
  return {
    ...renderPlainEmail({ ...message, values, targetUrl: input.targetUrl, targetLabel: input.existingAccount ? "Personeelsportaal openen" : "Personeelsaccount activeren" }),
    html: renderTenantEmailHtml({ brand: input.brand, kind: "personnel_invitation", message, values, targetUrl: input.targetUrl, existingAccount: input.existingAccount, allowLocalLinks: input.allowLocalLinks }),
  };
}
