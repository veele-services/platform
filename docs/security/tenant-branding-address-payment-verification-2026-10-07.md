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

Lokale regressies: 1.475 unitchecks, 428 database-integratiechecks en 398
pgTAP-checks en 14 desktop/mobiel-browsertests slaagden. De complete CI en de afzonderlijke echte staging-Mollie
acceptatie blijven releasevoorwaarden; hun workflowresultaten leveren het
bewijs van de uiteindelijk gepromoveerde commit. Geen claim dat een provider
heeft betaald op grond van alleen een browserterugkeer of een lokale mock.
