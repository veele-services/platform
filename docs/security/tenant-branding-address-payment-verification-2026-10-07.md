# Tenantbranding, adreslocaties en Mollie-testcheckout

## Bron- en rechtencontrole

| Wijziging | Behouden grens en gecontroleerd bewijs |
| --- | --- |
| Login/page/brand en publiek emaillogo | Actieve tenant uitsluitend uit de door proxy gevalideerde hostname; geen browserkeuze, membership of accountinformatie in het publieke scherm. Logo blijft private Storage met scancontrole vóór en actuele tenant/logo-controle na I/O. WebP wordt begrensd naar PNG omgezet. Fieldgrid is de loginfallback. |
| Auth-loginactie, service-helper, nieuwe context-RPC's en private contexttabel | Service-only RPC/JWT, RLS en ingetrokken tabelrechten. Eén korte, gelockte context per actueel niet geblokkeerd account. Bestaande `email_auth_context` controleert lidmaatschap, uitnodiging of expliciete klantbinding vóór voorbereiding en opnieuw in de ondertekende webhook. Context is presentatie en geen toegang; geen OTP/body/token-opslag. Hostconflicten, andere webhook-ID's, onbekende tenant en revocatie falen gesloten. |
| Adres-HTTP-route | Zelfde origin en actuele sessie. Bestaande personeelrollen behouden toegang; klanten vereisen een actuele account in de resolved tenant, ook zonder eerste object. Account en sessie worden opnieuw gecontroleerd na provider-I/O. Vaste PDOK-endpoints, geen browser-URL. |
| Klantobject/profiel/onboardingacties en aangepaste RPC/DTO's | Dezelfde account, capability, exacte binding, bronversies, idempotente receipt, sessie- en tenantcontrole. Server vergelijkt geselecteerde adresdelen met verse PDOK-data en vervangt browsercoördinaten. Alleen eigen canonieke adressen worden geprojecteerd; geen nieuwe interne rapportvelden. Verse lookup-tijd verandert geen command-ID-inhoud. |
| Personeelsprofiel/onboarding en private normalizers | Bestaande eigen-personeel- en sessierechten. Zelfde serververificatie voor woon- en alternatief vertrekadres; afzonderlijke huisnummerdelen en coördinaten overleven beide normalisatiestappen. Handmatige wijziging behoudt geen oude locatie. |
| Integratieworkflow en twee operatorscripts | Alleen expliciete beoordeelde staging-SHA, canonieke health/Supabase/TLS-guard, GitHub Environment en bewuste tenantparameter. Alleen echte `test_`-key. Geen bestaande andere merchant vervangen, geen globaal automatische koppeling. Exacte adresmatch plus CAS. Checkoutacceptatie gebruikt eigen gelabelde fictieve records, verstuurt geen mail, bewaart geen authtraces en sluit het testaccount af. |
| Migratiemanifest en surface/reviewinventaris | 126 bestaande migratiehashes blijven inhoudelijk identiek. Drie nieuwe migraties zijn in een schone geïsoleerde lokale replay toegepast. Nieuwe tabellen/functies/grants en de gewijzigde entrypoints zijn afzonderlijk beoordeeld; het vastleggen van metadata verleent geen rechten. |

## Gericht bewijs

- `app/api/addresses/route.test.ts`: klant zonder membership, tenantaccount,
  revocatie tijdens I/O, sessierevocatie, personeel en cross-origin/geen sessie.
- `lib/addresses/form.test.ts`: verse providercoördinaten vervangen vervalsingen,
  oude bevestiging met gewijzigde huisnummerdelen wordt geweigerd en handmatige
  wijziging wist coördinaten en provider-ID's.
- `app/api/email/auth/route.test.ts`: ondertekende Auth-redirect naar platform
  behoudt uitsluitend de servervoorbereide tenantnaam, kleuren en logo-URL.
- `scripts/test-customer-portal.mjs`: contextvoorbereiding/resolutie met actuele
  klantrechten, conflicterende tenant/hook, platformfallback, privileges;
  gestructureerde locatie, huisnummersuffixen, verse-tijd retry, mismatch en
  handmatig wissen; personeel-normalisatie behoudt adresdelen/coördinaten.
- Bestaande Mollie single/bundle/concurrency-tests controleren bedrag, scope,
  merchant, reservering, afsluiting en herhaalde providerverwerking.
- `tests/e2e/login-branding.spec.ts`: alle drie loginlayouts én OTP op 390 en
  1440 px met echte lokale hostname-resolutie en WebP-naar-PNG logo.
- `tests/e2e/customer-portal.spec.ts`: eerste object zonder bestaande binding,
  mobiele autocomplete in native dialog, persistente huisnummerdelen en
  coördinaten, vijf breedtes, downloads en intrekken van toegang.
- Uitnodigingsmails zijn op 390 en 800 px visueel gecontroleerd; de nieuwe
  voorbeelden behouden de natuurlijke logoverhouding en bevatten uitsluitend
  een fictieve activatielink. De staging-betaalacceptatie vergelijkt na elke
  herhaalde webhook de volledige factuurstatus en betaalverdeling, gebruikt
  normale browsercookies en probeert alle afsluitacties onafhankelijk.
  Een gewone checkoutknop zoals `Pay` vervolgt de teststappen; uitsluitend
  de expliciete betaalstatus beëindigt de bevestigingsstap. Een nog niet
  beschikbare betaalbutton blokkeert de keuze van methode of bank niet.
- De adresinspectie meldt expliciet wanneer verouderde coördinaten nog niet
  zijn onderzocht. Een adres dat tijdens herstel verandert, telt als conflict
  en resterend controlepunt; het wordt niet als hersteld geboekt.
  Veilige redenaantallen onderscheiden onvolledigheid, niet ondersteunde landen,
  ontbrekende of ambigue matches, providerfouten en schrijffouten. Dezelfde
  inspectie maakt een ontbrekend tenantlogo en de gebruikte fallback expliciet.
- Echte PDOK-search en -lookup met openbare stationsadressen bevestigden
  `Den Haag` als alias voor de officiële BAG-woonplaats `'s-Gravenhage`.
  `lib/addresses/reconciliation.test.ts` controleert die expliciete alias
  met exact volledige straat, postcode, land en afzonderlijke huisnummerdelen.
  Andere straten, huisnummers, toevoegingen, postcodes en plaatsen blijven
  geweigerd; legacy straattekst wordt niet geraden of onnauwkeurig vergeleken.
- De bevestigde testbetaling maakt normaal ook een klantmail aan. Vóór
  factuur- en checkoutcreatie zet alleen het nieuw aangemaakte fictieve
  account zijn bestaande persoonlijke klantmailvoorkeur op `email=false`.
  De effectieve `customer.payment_received`-policy moet e-mail weigeren;
  anders stopt acceptatie. Een lokale rollbackcontrole bewees standaard
  e-mailtoestemming, deze accountgebonden weigering, behouden in-appmeldingen
  en ongewijzigde toestemming voor een tweede account. De acht bestaande
  klantbetalingstests, waaronder uitgestelde policy-intrekking, slaagden.
- Stagingacceptatie `37598014893` op `b87046f6` maakte een echte testcheckout
  aan en controleerde providerbedrag/merchant en de onbetaalde vroege retour.
  De bevestigingshelper faalde daarna; deze run bewijst geen betaalbevestiging.
  Mollie beschrijft een statuskeuze gevolgd door Continue en noemt de methode
  inmiddels `iDEAL | Wero`: [testflow](https://docs.mollie.com/docs/shopify-test-and-go-live),
  [naamwijziging](https://docs.mollie.com/changelog/ideal-logo-updated-to-ideal-wero).
  De herwerkte helper wacht begrensd op zichtbare actieve controls, submit
  alleen het formulier van de statuskeuze, ondersteunt providerframes en
  beide iDEAL-namen, en loopt na Paid door naar Continue en de tenantretour.
  Een documentgeneratie voorkomt dat dezelfde URL een volgende stap blokkeert.
  Diagnostiek gebruikt uitsluitend HTTP-status, vaste actie/fout/hostcategorieën
  en control-aantallen/booleans; URLs, DOM-tekst en provider-/authgegevens blijven
  buiten uitvoer. Acht browserfixtures bewijzen deze stappen, verborgen controls,
  vertraagd laden, herhaalde document-URLs, één klik bij onveranderd laden en
  weigering van een lookalike-host of retour zonder statuskeuze. Deze fictieve
  browserfixtures bewijzen op zichzelf geen providerbetaling. De operationele
  helper is expliciet aan de bronhashinventaris toegevoegd; de release-,
  account-, merchant-, bedrag-, mail- en ledgergrenzen blijven ongewijzigd.
- Echte stagingacceptatie `37606698308` op `095c047c` herkende iDEAL, bank
  en de Paid-radio, maar vond daarna geen verzendcontrol in het aanwezige
  statusformulier. Deze run bevestigt geen betaling en sloot het fictieve
  account succesvol af. De helper omvat nu ook een native `button` zonder
  `type`, uitsluitend binnen het formulier van de gekozen Paid-control.
  Zulke knoppen verzenden standaard hun formulier; de knoptekst is geen
  providercontract. De negende browserfixture controleert een onbekende
  knoptekst en weigert verborgen knoppen, `type="button"` en verzendknoppen
  van een ander formulier. Zie de [HTML-specificatie](https://html.spec.whatwg.org/multipage/form-elements.html#the-button-element).
- Echte stagingacceptatie `37614884819` op `bc2d8976` vond de native
  bevestigingsknop, maar de klik overschreed vijf seconden. Het oude schema
  onderscheidde actievoorwaarden niet van de navigatiewacht; ook deze run
  bevestigt geen betaling en sloot het fictieve account succesvol af.
  `click({ noWaitAfter: true })` laat nu de bestaande globale returndeadline
  de navigatie bewaken, terwijl de normale klikvoorwaarden behouden blijven.
  [Playwright click-documentatie](https://playwright.dev/docs/api/class-locator#locator-click).
  Vaste foutredenen verwerken alleen herkenbare progressmarkers nadat
  terminalopmaak is verwijderd; oorspronkelijke fouten, selectors, URLs en
  DOM-tekst worden nooit vastgelegd. Een afgeronde klik met onafgeronde
  navigatiewacht blijft uitsluitend diagnostiek, geen betalingsbewijs.
  Bij een fout wordt alleen de huidige volledig geverifieerde fictieve
  betaalpoging opnieuw uitgelezen met één begrensde provider-GET en één
  tenant-, klant- en poginggebonden ledgeraggregatie. Alleen bekende statussen,
  contractbooleans en bedragen/aantallen komen in uitvoer. Contractmismatch
  verbergt de providerstatus; diagnostiek wijzigt niets en behoudt de
  oorspronkelijke fout, fase en alle onafhankelijke afsluitacties.
  Twaalf geïsoleerde browserfixtures slagen, waaronder een native POST die
  acht seconden op de providerrespons wacht en precies één verzending doet,
  een afgedekte knop die geblokkeerd blijft, en gekleurde progresslogs met
  oude retryredenen. De vertraagde fixture gebruikt na de POST een aparte
  JS-navigatie: Playwright onderschept alleen het eerste verzoek van een
  nagebootste HTTP-redirectketen. Een volledig offline microbrowser bevestigde
  die beperking en de fixtureoplossing; dit verandert geen providerhostcheck.
  De huidige ledgeraggregatie is ook op de geïsoleerde lokale database
  uitgevoerd met niet-bestaande scopes; alle bedragen/aantallen bleven nul.

Lokale regressies: 1.475 unitchecks, 428 database-integratiechecks en 398
pgTAP-checks en 14 desktop/mobiel-browsertests slaagden. De complete CI en de afzonderlijke echte staging-Mollie
acceptatie blijven releasevoorwaarden; hun workflowresultaten leveren het
bewijs van de uiteindelijk gepromoveerde commit. Geen claim dat een provider
heeft betaald op grond van alleen een browserterugkeer of een lokale mock.
