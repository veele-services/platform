# OTP, klantactiviteit en provisioning — review 5 oktober 2026

Deze review betreft de werkboom voor de klantportaalrelease. Dit is lokaal
implementatiebewijs, geen bevestiging van hosted Auth-instellingen of staging.

## Universele OTP

Beoordeeld: `app/login`, `app/auth`, `lib/auth`,
`app/api/email/auth/route.ts`, `lib/email-centre/auth-message.ts`, de Auth
templates en de platformbeheerbootstrap.

- Iedere login gebruikt `signInWithOtp` met `shouldCreateUser: false`, gevolgd
  door verificatie van de volledige providercode van zes tot tien cijfers.
  Hosted staging gebruikt acht cijfers, zoals de eigenaar bevestigde bij de
  latere hookcorrectie; die instelling blijft behouden. Onbekende adressen en leveringsfouten
  krijgen dezelfde browserrespons. De aanvraag kiest geen browserrol/tenant.
- Na verificatie controleert de server actuele hostname-, tenant-, module- en
  werkruimtetoegang. Een geweigerde bestemming verwijdert de nieuwe lokale
  sessie. Een generieke login kan uitsluitend een werkelijk toegankelijke
  werkruimte kiezen; de staging-platformhost kiest geen tenant.
- Oude wachtwoordacties en callback-GETs maken geen sessie. Uitnodiging en
  e-mailwijziging verifiëren in een geïsoleerde, niet-persistente Auth-client;
  zij installeren geen browsersessie. Daarna blijft een nieuwe OTP nodig.
  De browserclient importeert ook geen impliciete sessie uit een URL-fragment.
- De ondertekende mailhook valideert bestemming en server-side branding vóór
  centrale transportaanmelding. Loginmails bevatten alleen de code; geen
  tokenhash of credentialdragende URL. Recovery vraagt om een nieuwe OTP en
  verstuurt geen herstelcredential. Bestaande receipt- en transportdeduplicatie
  en tracking-uit blijven behouden.
- De bootstrap geeft voor nieuwe platformadmins geen wachtwoord aan Auth mee. Bestaande
  accountidentiteiten worden niet gewijzigd. De bootstrap-workflow ontvangt
  daarvoor geen `FIELDGRID_ADMIN_PASSWORD` meer.

De browsercontrole vond een fout in de toegankelijke naam van het OTP-veld:
de hulptekst maakte deel uit van het label. `aria-labelledby` scheidt de naam
nu van de beschrijving. De herhaalde browserrun bevestigt echte OTP-login voor
management, platformbeheer en een klant zonder personeelslidmaatschap.
De bestaande standaarduitnodiging verwees nog naar wachtwoorden; migratie
`20261005075200` publiceert hiervoor een nieuwe immutable templateversie en
behoudt de historische versies en afleversnapshots.

## Klantactiviteit en tickets

Beoordeeld: migraties `20261005075000_customer_ticket_notifications.sql` en
`20261005075100_customer_activity.sql`, `activity-action.ts`, de uitbreidingen
van de snapshot en de concrete klantroutes.

- Een ticketmelding wordt uitsluitend voor de eigen melder gemaakt uit een
  openbare gebeurtenis door een andere actor. Interne notities, labels,
  berichtinhoud en medewerkersidentiteiten worden niet overgenomen.
- De bestaande centrale notificatie-engine blijft eigenaar van templates,
  kanalen, voorkeuren, beleid, outbox, retries en leesstatus. De nieuwe bron
  hercontroleert live account/contact/tenant/module/objectrechten, ook vlak
  voor een externe verzending. Er wordt geen tweede inbox gebouwd.
- De projectie controleert eerst de aangemelde sessie en het expliciete
  klantaccount. Elk bericht moet bovendien door de oorspronkelijke broncheck
  en de relatie met dit klantaccount komen. Dit geldt ook bij meerdere eigen
  klantaccounts. Doelpaden worden opnieuw opgebouwd uit toegestane bron-ID's.
- Individueel lezen gebruikt de verwachte versie. Alles-lezen selecteert
  uitsluitend de actuele toegestane berichten van dit klantaccount. Een
  opdracht-ID is gebonden aan actor, tenant, account en invoer; replay geeft
  geen extra mutatie en geen nieuwe bevoegdheid.
- Private helpers hebben geen publiek/anon/authenticated/service-role
  executegrant. De twee publieke projectie/commandopaden blijven via de
  bestaande sessie- en accountguards begrensd.

Uitgevoerd: `node --test scripts/test-customer-activity.mjs`, **7 geslaagd**.
De test gebruikt echte lokale databasefuncties met afzonderlijke
`authenticated`, `anon` en `service_role` rollen, en draait alle fictieve
gegevens terug. Bewezen: twee accounts van dezelfde gebruiker blijven
gescheiden; vreemde accounts/private helpers zijn geweigerd; interne en
eigen ticketgebeurtenissen worden niet verzonden; generieke contentsnapshot;
individuele versieconflicten; idempotent accountgebonden alles-lezen;
centrale beleidsstop; ingetrokken account sluit inbox en externe aflevering.
Een concrete bezoekmelding gebruikt de ondersteunde `appointments`-route met
het juiste account, object en bezoek. Een ander eigen account ziet deze melding
niet; intrekken van de bezoekpublicatie verwijdert ook de doellink.

## Beheer van klantaccounts

Onafhankelijk beoordeeld: `management-action.ts`, `management-model.ts` en
`components/fieldgrid/customers/portal-access.tsx`.

De invoer accepteert geen tenantoverride. Een server-side management-RPC en
een exacte tenant/klant/contactcontrole gaan vooraf aan globale Auth-lookups;
de creatiestap controleert die rechten opnieuw. Voor nieuwe Auth-gebruikers
geeft de applicatie uitsluitend een e-mailadres met `email_confirm: true` mee;
zij verstrekt geen wachtwoord, installeert geen sessie en geeft geen impliciete
rol. E-mailbezit is nog vereist om de OTP in te voeren. Bestaande
gebruikers worden niet aangepast. De laatste bind-RPC hercontroleert de
bevoegdheid en versie en geeft uitsluitend de expliciete mogelijkheden voor
dat klantaccount. Een mislukte bind kan een Auth-identiteit zonder nieuwe
toegangsrechten achterlaten; die identiteit wordt niet als succes gemeld.

De lokale GoTrue-versie maakt intern een willekeurig wachtwoord van 64 tekens
wanneer de admin-aanvraag geen wachtwoord meegeeft. Een niet-lege opgeslagen
hash betekent daarom niet dat Fieldgrid een gebruikerswachtwoord heeft
verstrekt. Zie de
[GoTrue v2.196.0-bron](https://github.com/supabase/auth/blob/v2.196.0/internal/api/admin.go#L408-L414).

## Overige lokale checks en operationele grens

De volledige lokale unitset telt **1.301 geslaagde tests**. Typecheck en lint
zijn geslaagd. De databasecontrole telt **398 geslaagde pgTAP-checks** en
**383 geslaagde Node-tests**; daarnaast zijn **10 echte lokale HTTP-controles**
voor Auth, Data API, Storage, Realtime en ClamAV geslaagd.

De definitieve browsercontrole gebruikt een productiebuild en de echte lokale
virusscanner: **59 van 59 Playwright-tests geslaagd in 6,4 minuten**, zonder
snapshotupdates. Dit omvat echte OTP-mails voor alle vier werkruimtes,
uitnodigingen zonder sessie-installatie, accountisolatie, provisioning met
daaropvolgende OTP en intrekking, het klantportaal op vijf schermbreedtes,
huisstijl, versieconflicten en de bestaande operationele werkstromen.
De nieuwe referentiebeelden zijn vooraf afzonderlijk visueel beoordeeld.

De hosted configuratie blijft een aparte grens: de naam-only inventaris bevat
de hook-signaturesecret en project-servicekey, maar geen Auth Management API
access-token; repositoryautomatisering wijzigt de hosted instellingen niet.
De eigenaar bevestigde tijdens deze release op 5 oktober opnieuw dat de Send
Email Hook uitgeschakeld is. Dit is actuele operatorbevestiging en geen
provider-API-inspectie. Voor echte gebrande OTP-bezorging zijn
de configuratie- en acceptatiestappen in
[`mail-hooks.md`](../deployment/mail-hooks.md) nog vereist.

De bovenstaande aantallen beschrijven de eerdere portaalrelease. De eigenaar
heeft daarna de juiste Send Email-hook aangemaakt, de staging-secret vervangen
en de verkeerde JWT-hook uitgeschakeld. De achtcijferige hosted OTP werd nog
door de oorspronkelijke zescijfercontrole geweigerd. De aanvullende correctie
en niet-schrijvende diagnose zijn vastgelegd in
[`auth-mail-diagnostics-2026-10-05.md`](auth-mail-diagnostics-2026-10-05.md).
