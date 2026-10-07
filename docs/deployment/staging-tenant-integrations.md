# Expliciete tenantintegraties in staging

Gebruik de workflow `staging-tenant-integrations.yml` uitsluitend op een
beoordeelde, gedeployde `staging`-promotie. De workflow controleert de exacte
publieke health-SHA, canonieke staging-origin en geïsoleerde Supabase-ref.
Alle credentials komen uit GitHub Environment `staging`; waarden, tokens,
adressen en klantgegevens worden niet gelogd.

Vul bewust de actieve `tenant_slug` in. Een globale Mollie-key is nooit
automatisch een tenantkoppeling. De operator kiest één van deze handelingen:

- `inspect`: verifieer de bestaande Mollie-testkey via `/v2/profiles/me`,
  vergelijk de verbinding, controleer het publieke logo en tel onvolledige of
  niet bevestigde object-, klant-, personeel- en vestigingsadressen.
- `repair`: koppel uitsluitend deze tenant expliciet aan het geverifieerde
  testprofiel en herstel uitsluitend exact herkende adressen via PDOK.
  Een afwijkend bestaand profiel wordt niet vervangen; de unieke actieve
  profielbinding voorkomt hergebruik door een andere tenant. Adressen worden
  alleen geschreven als hun bronwaarde intussen niet is gewijzigd.
- `acceptance`: maak een fictieve, duidelijk gelabelde klant met drie
  testfacturen (€ 1, € 2 en € 3). Auth genereert en verifieert een tijdelijke
  testsessie zonder een e-mail te sturen. Playwright controleert de echte
  Mollie-testcheckout op mobiel voor één factuur en op desktop voor twee
  facturen samen. Controleer providerprofiel, bedrag, terugkeer en webhook.
  De terugkeer vóór providerbevestiging moet € 0 betaald behouden; tweemaal
  herhalen van de webhook mag geen extra allocatie maken.

De acceptatie gebruikt uitsluitend `test_`-credentials en verandert geen
bestaande klantfacturen. Er worden geen browsertraces of screenshots met
authgegevens opgeslagen. Het fictieve account wordt afgesloten, de klant
gearchiveerd en de gelabelde betaalhistorie blijft als controlebewijs bestaan.
Bij een mislukte acceptatie is het resultaat geen GO: onderzoek de betrokken
stap en voer de gerichte acceptatie opnieuw uit na herstel.
