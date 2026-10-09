# Fieldgrid V1 platform backoffice

Status: canonical implementation contract

Route: `/platform`

The platform backoffice is a tenant-neutral Fieldgrid workspace. It is not a
tenant dashboard and never receives an implicit tenant context. Access requires
an authenticated row in `platform_admins`; privileged tenant reads and writes
then use the server-side service role only after that check.

## Tenant onboarding

The six-step wizard records organisation identity, the first tenant
administrator, branding, enabled V1 modules, communication settings and a final
review. Provisioning is idempotent through `tenants.onboarding_key`. A new
tenant starts without operational data and without an automatic membership for
the platform administrator. The selected tenant administrator receives a
recoverable Supabase Auth invitation and an active tenant membership.

The default Fieldgrid palette is:

- primary: `#222C35`;
- secondary: `#41AC42`.

Existing custom tenant colours are preserved. Only the exact former Fieldgrid
default pair is migrated.

The two saved colours are brand **seeds**, not literal backgrounds for every UI
surface. `lib/branding/palette.ts` derives semantic screen colours from them:
neutral-dark navigation, tinted canvas/surfaces/borders, soft active states,
readable action/link colours, focus rings and a layered hero gradient. The hero
combines a light glow with static rings and fine lines; operational page headers
use a quiet light surface. Status/warning colours retain their semantic meaning.
Contrast tests cover light, dark and saturated inputs; invalid/incomplete preview
input falls back to Fieldgrid defaults, without changing the saved input.

Tenant backoffice, personnel screens and platform brand previews share these
tokens. Platform chrome always derives its own Fieldgrid-default palette, never
the selected tenant's palette. Both tenant settings and platform Huisstijl show
the derived palette live. No additional colour settings or migration are needed;
existing document and mail brand colours are unchanged.

The palette applies to the complete tenant workspace, including navigation,
page headers, controls, focus states and action accents. A tenant logo replaces
the textual brand lock-up; without a logo the tenant name is the fallback.
`tenant_settings.white_label_enabled` is a platform-managed entitlement. When
it is false, the sidebar retains a bottom-aligned `Powered by Fieldgrid`
attribution. Tenant roles cannot change this entitlement through the Data API.

## Module entitlements

The V1 module keys are `planning`, `personeel`, `rapportage`, `finance`, `tickets`
and `klantportaal`.
Facturatie depends on Planning and Rapportage; Rapportage depends on Planning.
Disabling Planning or Facturatie is rejected while conflicting operational data
is active.

Entitlements are enforced in four layers: navigation, server actions,
restrictive RLS policies and table triggers. The triggers also cover
security-definer RPCs, so a disabled module cannot be re-enabled or used through
the Data API. Only the trusted service role can change `enabled_services`.

## Communication templates

Each tenant owns four templates:

| Key | Channel | Runtime use |
| --- | --- | --- |
| `invoice` | E-mail | Definitive invoice with payment link and PDF |
| `quote` | E-mail | Price quote with one-time acceptance link |
| `workorder` | Push | Newly dispatched work order |
| `schedule` | Push | Material schedule change |

Every save creates a new immutable revision and audit event. Resetting creates a
new revision based on the Fieldgrid default. The platform editor validates the
allowed variables per template and provides an inert live preview. Actual
e-mail delivery produces HTML and plain text from the same revision and stores
the rendered content plus branding snapshot with the delivery record.

The e-mail logo is served through the controlled HTTPS branding endpoint. When
a logo exists, the header contains only that logo; otherwise the tenant name is
the header fallback. The tenant website remains available as an HTTPS link in
the footer. A tenant sender is used only after its tenant domain is verified;
that sender must also be activated in SendGrid. Otherwise the configured
Fieldgrid sender remains the operational fallback.

No secret, provider key or tenant-specific brand value belongs in this
configuration contract or in repository history.

### Portalen en e-mailhuisstijl — 6 oktober 2026

De eigenaar bevestigt dat dezelfde opgeslagen tenant-huisstijl ook geldt voor het
personeelsportaal, klantenportaal, hun overlays en tenantgebonden e-mails. De
vaste groene personeelsidentiteit vervalt. Tenantlogo of tenantnaam vervangt de
product-lock-up; contextuele technische support blijft functioneel beschikbaar.
Productattributie staat alleen klein onderaan sidebar/e-mail. De platformgestuurde
white-label-entitlement verwijdert ook die attributie. Historische afgeleverde
mail- en rapportbewijsversies blijven onveranderlijk.

## Modules en eigen domeinen (8 oktober 2026)

De reeds gebouwde klantomgeving is als zesde module `klantportaal` instelbaar in
platformbeheer, naast planning, personeel, rapportage, finance en tickets. De
expliciete eigenaaropdracht activeert deze module voor de actieve Veele Services
tenant in de afzonderlijke staging- en productiedatabases. Het inschakelen maakt
geen klantbindingen aan en verleent geen toegang tot andere klantaccounts.

Tenantinstellingen bevatten daarnaast een eigen werkruimtedomein met afzonderlijke
DNS-verificatie en activering volgens het [domeincontract](tenant-workspace-domains.md).
E-mailafzenderdomeinen blijven een afzonderlijk register.

## Platformnavigatie, cockpit en support (8 oktober 2026)

Alle platformroutes, inclusief supporttickets, supportinstellingen, notificaties,
voorkeuren en campagnes, gebruiken één platformlayout met dezelfde navigatie,
huisstijl en accountbediening. De beheerconsole blijft uitsluitend beschikbaar
voor platformbeheerders. Een afzonderlijk expliciet support- of notificatierecht
geeft toegang tot het bijbehorende werkgebied en geen algemene tenantinzage.

De cockpit toont opgeslagen configuratiegegevens: actieve en gepauzeerde
organisaties, actieve medewerkers, aangepaste communicatietemplates, uitnodigingen
in wachtrij of met een fout, en actieve klantportalen. Supportaantallen komen uit
de ingelogde ticket-RPC en tellen uitsluitend de toegestane supportscope.
Ontbrekend leesrecht wordt als ontbrekende toegang getoond, niet als nul tickets.

De expliciete eigenaaropdracht maakt platformbeheerders supportoperators.
De migratie legt daarvoor concrete `platform.support.read`, `.reply`, `.note`
en `.manage`-toekenningen vast. Bestaande beperkte scopes en ingetrokken rechten
blijven behouden. Verwijderen van de platformrol trekt bootstraprechten in;
hernieuwd toekennen van de rol herstelt geen eerder ingetrokken recht. Deze
rechten gelden uitsluitend voor bewust gedeelde `platform_support`-tickets,
nooit voor interne tenantgesprekken, HR-inhoud of tenantnotities.

Een supportoverzicht opent altijd de ticketlijst. Configuratie zonder leesrecht
toont een afgeschermde lege lijst met uitleg en een afzonderlijke instellingenlink.
De instellingen gebruiken aangesloten tabbladen en een responsief categorieraster
met vier kolommen op ruime schermen.

## Fieldgrid-supportteam (9 oktober 2026)

Platformbeheer krijgt `/platform/team` voor uitnodigen, wijzigen, intrekken en
bewust opnieuw uitnodigen van supportmedewerkers. Alleen een actuele
platformbeheerder beheert dit register; wijzigingen vereisen een recente echte
OTP-login. Supportmedewerkers zijn geen platformbeheerders en krijgen geen
tenantlidmaatschap. Hun profiel kent uitsluitend bestaande expliciete
`platform.support.read`, `.reply`, `.note` en `.manage`-rechten toe, voor alle
actieve tickettenants of een geselecteerde tenantlijst. Het centrale
rechtenregister blijft de ticketautorisatiebron; een ingetrokken teamprofiel
sluit ook achtergebleven supportgrants. Zelfwijziging en toevoegen van bestaande
platformbeheerders via deze beperkte route zijn uitgesloten.

Uitnodigingen zijn geregistreerde security-mails met een gewone platformloginlink.
Nieuwe accounts gebruiken dezelfde bevestigde OTP-accountvoorbereiding als het
managementproces; bestaande accounts worden niet gereset. Een servercontrole
vindt plaats vóór accountvoorbereiding en opnieuw direct vóór de provider.
Payloadgebonden opdrachtbewijzen, revisies en verzendstatussen voorkomen dubbele
uitnodigingen en bewaren onzekere provideruitkomsten. De platformlogin accepteert
ook actuele expliciete support-/notificatierechten en stuurt supportmedewerkers
naar hun eigen supportdesk. Iedere ticketactie blijft sessie-, scope- en
audiencegebonden. Tenant- en HR-notities worden niet gedeeld.

De supportcockpit biedt directe links naar reactie nodig, niet toegewezen en
verstreken termijnen. Personeel en klanten melden bij hun tenant; gecontroleerde
escalatie naar Fieldgrid en een expliciet te verzenden antwoordconcept houden
het oorspronkelijke gesprek en het supportgesprek gescheiden.
