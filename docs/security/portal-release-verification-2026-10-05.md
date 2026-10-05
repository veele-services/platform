# Klantportaal, OTP en huisstijl — integratiecontrole

Deze review betreft de wijzigingsset na `1f47c7b8621c18cd2a70b570a2ea0cda275154ad`.
De uiteindelijke commit en de resultaten van de verplichte releasegates staan
in de bijbehorende pull request en GitHub Actions. Lokale verificatie is geen
bewijs van hosted providerconfiguratie of stagingacceptatie.

## Review en aanvullende grenzen

De integratie is beoordeeld met afzonderlijke controles op
[klantprojecties en domeinacties](customer-portal-verification-2026-10-05.md),
[OTP en activiteit](otp-activity-verification-2026-10-05.md) en
[huisstijl, klantbeheer en bezoekacties](branding-management-verification-2026-10-05.md).
De reviewers hebben elkaars betaal- en accountbeheerwijzigingen gecontroleerd.
Bevindingen over hybride rapportrollen, notificatierechten, merchantbinding,
versiecontrole en intrekking tijdens lockwachten zijn hersteld en krijgen
expliciete regressiedekking.

De integratiereview controleerde bovendien:

- `payment-action.ts`, `merchant.ts`, `provider-result.ts` en migraties
  `66000`–`66400`: uitsluitend expliciet gebonden, geverifieerde tenantmerchant;
  integer-centen, gelijke valuta/modus/profiel/metadata; begrensde checkout-URL;
  geen private betaalrij als browserantwoord; herautorisatie na provider-I/O;
  vrijgeven van de providerlease ook bij fouten. De bestaande webhook blijft
  eigenaar van geverifieerde settlement. Een return-URL bevestigt geen betaling.
- De gedeelde factuurlockvolgorde en reservering: een tweede klantbundel,
  extern betaalpakket of handmatige betaling kan een lopende reservering niet
  dubbel toewijzen. Exact dezelfde bundel kan hervatten. Afgesloten pogingen
  blijven historie; een nieuw expliciet verzoek kan een nieuwe poging maken.
- De betaalmogelijkheid in de browser vereist naast Finance een actieve,
  expliciet geverifieerde merchantbinding. De projectie geeft alleen deze
  boolean door; profiel-ID en sleutelreferentie blijven privé. De daadwerkelijke
  checkout controleert bovendien de runtimeconfiguratie en provideridentiteit.
- Rapport- en betaalmeldingen leggen bij de bronovergang alleen hun exacte
  ontvangers, kanaalonderdrukking en relevante beleids-/voorkeurrevisies vast.
  De bestaande worker maakt de berichten later aan onder de centrale
  notificatielock; betaling en rapportgoedkeuring nemen die lock niet onder
  hun bronlocks. Gewijzigde relevante voorkeuren onderdrukken conservatief
  oude berichten. Beide reviewers controleerden de behouden enginepaden,
  private helperrechten, live bronautorisatie, TTL en accountgebonden links.
  De gerichte rapport-/betaallifecycle passeert **28 tests**, inclusief
  OFF→ON, ON→OFF→ON, replay en intrekking. De activiteitroute passeert
  **7 tests**, inclusief de gecorrigeerde link naar `appointments`.
- `management-action.ts`: strikt invoerschema, actuele management- en
  contactcontrole vóór globale Auth-lookup, begrensde server-only paginering,
  bestaande identiteiten onveranderd, nieuwe identiteit zonder wachtwoord of
  sessie. De finale geautoriseerde bind-RPC bepaalt alle klantrechten.
  De aanvraag levert geen wachtwoord aan. GoTrue genereert daarbij intern een
  onbekend willekeurig wachtwoord; een lege `encrypted_password` is dus geen
  geldig testcontract. Dit is bevestigd in de
  [bron van de lokaal gebruikte GoTrue v2.196.0](https://github.com/supabase/auth/blob/v2.196.0/internal/api/admin.go#L408-L414).
  De browserregressie controleert geen uitgegeven sessie, afwijzing van een
  bekend fictief wachtwoord en daaropvolgende echte OTP-login en intrekking.
- Het centrale typebestand is opnieuw gegenereerd uit de lokale migraties;
  het is geen aparte bron van autorisatie.
- `bootstrap-platform-admin.ts` en de bijbehorende handmatige workflow
  behouden hun staging-projectcontrole en vragen geen beheerderswachtwoord
  meer. Bestaande gebruikers worden niet gereset. De gewone stagingworkflow,
  runnergrenzen, backup, attestatie en expliciete branchpromotie blijven staan.
- `supabase/config.toml` is uitsluitend lokale Auth-configuratie. De hogere
  lokale mailcapaciteit dient geïsoleerde echte OTP-tests; hosted limieten
  wijzigen niet. Uitnodiging en herstel gebruiken de bijgehouden veilige
  templates. De browserclient accepteert geen sessie uit een URL-fragment.
- `vitest.config.mts` breidt de gevonden tests uit naar alle app-tests.
  `package.json` neemt de nieuwe databasecontroles op en voert de scripts
  serieel uit wegens de bestaande globale notificatielock. Er is geen
  productiecontrole verwijderd en geen nieuwe dependency toegevoegd.
- Het migratiemanifest bewaart de bestaande inhoudshashes exact. Nieuwe
  hashes zijn uit een schone lokale replay opgenomen. `db:verify-manifest`
  valideert 109 hashes en bewaart alle 57 reeds gedeployde hashes exact.
  De CI herhaalt de schone replay en drie historische upgradecontroles.

## Uitgevoerde lokale verificatie

- Volledige ESLint en TypeScript-controle: geslaagd.
- Volledige Vitest-run: **1.301 tests geslaagd**. Latere kleine aanvullingen
  worden in de finale CI nogmaals volledig uitgevoerd.
- Betaalprovider/merchant en accountbeheer: gerichte unitregressies geslaagd.
- Echte PostgreSQL-concurrency: **4 tests geslaagd**, met aantoonbaar wachtende
  sessies en intrekking van account, objectbinding en merchant.
- Volledige databasegate na de laatste schone replay: **398 pgTAP-asserties en
  383 Node-tests geslaagd**.
- Volledige Playwright-run op de laatste build: **59 scenario's geslaagd** in
  6,4 minuten, zonder snapshotupdates. De vooraf vernieuwde beelden zijn
  afzonderlijk visueel beoordeeld. Dit omvat alle vijf portaalbreedtes,
  werkelijke OTP-login, klantaccountbeheer en intrekking, downloads, tickets,
  factuurdetail zonder merchant en ingetrokken betaalconfiguratie in een open
  dialoog, centrale huisstijl en de bestaande personeels-/backofficeflows.
- Echte lokale Auth, Data API, Storage en Realtime: **10 tests geslaagd**.
- Database-lint: geen errors; bestaande en niet-blokkerende waarschuwingen
  blijven zichtbaar. Security-advisor: geen issues.
- De structuurcontrole en reviewledger dekken **982 autorisatieonderdelen**;
  alle 15 aanvullende wijzigingen voor de laatste meldings- en betaalcorrecties
  zijn afzonderlijk herbeoordeeld en aan concreet testbewijs gekoppeld.
- Standalone artifact ingepakt, uitgepakt en gestart; statische inhoud wordt
  geserveerd. Browserbundels bevatten geen herkende geprivilegieerde credentials.
  De CI bouwt opnieuw vanaf de definitieve commit.
- Broncontrole: geen herkende credentialformaten gevonden. Deze controle
  dekt geen onbekende secretformaten of Git-historie.

De CI-, migratie-upgrade-, artifact- en staginggates moeten de definitieve
commit nog bevestigen en herhalen de volledige lokale suites. De reviewstatus van een
autorisatieoppervlak beschrijft de bron-/resourcecontrole en regressiedekking;
zij vervangt geen van die verplichte releasegates.

## Externe acceptatie

Stagingconfiguratie komt uitsluitend uit GitHub Environment `staging`.
Secretwaarden zijn niet opgevraagd of vastgelegd. Werkelijke Supabase
Auth-hook/template-instellingen en een tenantmerchant vereisen expliciete
providerconfiguratie volgens het runbook. De applicatie kan die configuratie
niet uit het bestaan van een omgevingssleutel afleiden. Deze review claimt
geen echte externe mailbezorging of echte betaling.
