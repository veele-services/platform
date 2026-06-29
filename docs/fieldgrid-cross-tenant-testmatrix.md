# Fieldgrid cross-tenant testmatrix

Deze matrix documenteert de testdata en verwachte autorisatie-uitkomsten voor de cross-tenant permissietests.

## Testidentiteiten

| Sleutel | Omschrijving |
| --- | --- |
| `user-x` | Backoffice/API-gebruiker die aan twee tenants gekoppeld is. |
| `tenant-a` | Tenant waarin `user-x` managementrechten heeft. |
| `tenant-b` | Tenant waarin `user-x` alleen-lezen rechten heeft. |

## Tenantrollen

| User | Tenant | Rol | Status | Verwachte permissies |
| --- | --- | --- | --- | --- |
| `user-x` | `tenant-a` | Management | active | Lezen, schrijven, verwijderen en beheeracties op de geteste backoffice resources. |
| `user-x` | `tenant-b` | Alleen-lezen | active | Alleen `read` op de geteste backoffice resources; geen `write`, `delete` of beheeracties. |

## Scenario's

| # | Scenario | Resource/action | Tenant | Verwachting |
| --- | --- | --- | --- | --- |
| 1 | User X heeft Management in tenant A | `customers:write` | `tenant-a` | Toegestaan. |
| 2 | User X heeft Alleen-lezen in tenant B | `customers:read` | `tenant-b` | Toegestaan. |
| 3 | In tenant A mag user X schrijven | `customers:write` | `tenant-a` | Toegestaan. |
| 4 | In tenant B mag user X niet schrijven | `customers:write` | `tenant-b` | Geweigerd. |
| 5 | API-permissies respecteren tenant | `customers:write` | `tenant-a` / `tenant-b` | `tenant-a` geeft HTTP 200, `tenant-b` geeft HTTP 403. |
| 6 | Backoffice server actions respecteren tenant | `customers:write` | `tenant-a` / `tenant-b` | `tenant-a` slaagt, `tenant-b` gooit `Forbidden`. |
| 7 | Tenant switcher verandert permissions correct | `customers:write`, `customers:read` | switch van `tenant-a` naar `tenant-b` | Schrijfrecht verdwijnt na switch naar `tenant-b`; leesrecht blijft aanwezig. |

## Belangrijke invariant

Permissies worden altijd bepaald uit de combinatie van `userId` én actieve `tenantId`. Een rol of permission uit een andere tenant mag nooit doorsijpelen naar de actieve tenantcontext.
Datum: 29 juni 2026  
Scope: cross-tenant isolatie, directe objecttoegang en entitlement-controles voor Fieldgrid-modules.

## Doel

Deze testmatrix beschrijft minimale testdata en acceptatietests om te bewijzen dat tenants, portalen, storage-objecten, modules en sector-entitlements strikt van elkaar geïsoleerd zijn. De matrix is bedoeld voor handmatige QA, geautomatiseerde end-to-end tests en regressietests na wijzigingen in autorisatie, RLS, storage policies of server actions/API-routes.

## Testdata

Gebruik voorspelbare namen en bewaar alle technische id's, slugs en storage paths in het testrapport. Waar `tenant A` staat, gebruik tenant `demo-a`; waar `tenant B` staat, gebruik tenant `demo-b`.

| Ref | Testdata | Minimale inrichting |
| --- | --- | --- |
| T0 | Tenant `veele` | Platform-/managementtenant met support- en backofficefuncties. Geen klant- of planningsdata van `demo-a` of `demo-b` als tenant-eigen data aanmaken. |
| T1 | Tenant `demo-a` | Actieve tenant met customer, assignment, planning, documenten, facturen/PDF's en storage-objecten. Modules en sectoren expliciet vastleggen. |
| T2 | Tenant `demo-b` | Actieve tenant met eigen customer, assignment, planning, documenten, facturen/PDF's en storage-objecten. Gebruik vergelijkbare namen als `demo-a` om path- en id-verwarring te testen. |
| U1 | User alleen in tenant A | Backofficegebruiker met uitsluitend lidmaatschap in `demo-a`; geen record of rol in `demo-b`. |
| U2 | User alleen in tenant B | Backofficegebruiker met uitsluitend lidmaatschap in `demo-b`; geen record of rol in `demo-a`. |
| U3 | Multi-tenant backoffice user | Backofficegebruiker met lidmaatschap in `demo-a` en `demo-b`; moet alleen data zien van de actief geselecteerde tenant. |
| U4 | Platform support user | Supportgebruiker gekoppeld aan tenant `veele` met platform-supportrechten; toegang moet expliciet geaudit en alleen via supportflows toegestaan zijn. |
| U5 | Klantgebruiker tenant A | Klantportaalgebruiker gekoppeld aan een customer in `demo-a`; geen `customer_users`-koppeling naar `demo-b`. |
| U6 | Personeelsgebruiker tenant A | Personeelsappgebruiker gekoppeld aan een personnel-record in `demo-a`; geen personnel-record of planningstoegang in `demo-b`. |

### Entiteiten per tenant

Maak minimaal de volgende records aan en noteer de technische id's:

| Tenant | Customer | Assignment | Planning | Document | Factuur/PDF | Storage object |
| --- | --- | --- | --- | --- | --- | --- |
| `demo-a` | `A-Customer-01` | `A-Assignment-01` | `A-Planning-01` | `A-Document-01` | `A-Invoice-01.pdf` | `demo-a/.../A-Document-01` |
| `demo-b` | `B-Customer-01` | `B-Assignment-01` | `B-Planning-01` | `B-Document-01` | `B-Invoice-01.pdf` | `demo-b/.../B-Document-01` |

## Verwachte standaarduitkomsten

- Cross-tenant lees- of schrijfpogingen door reguliere gebruikers leveren `403 Forbidden`, `404 Not Found`, een lege dataset of een applicatiespecifieke autorisatiefout op. Kies per endpoint één consistente verwachte status en leg die vast in de geautomatiseerde test.
- De response mag geen velden, bestandsnamen, signed URLs, metadata, aantallen of foutmeldingen bevatten waarmee het bestaan van data in een andere tenant bevestigd kan worden.
- Mutaties buiten tenantcontext mogen geen records, auditregels, notificaties, storage-objecten of side effects aanmaken.
- Een multi-tenant backoffice user mag tenant B-data alleen zien nadat de actieve tenantcontext aantoonbaar naar `demo-b` is gezet.
- Platform support access moet expliciet herkenbaar zijn in logging/auditing en mag reguliere tenantisolatie niet impliciet omzeilen.

## Testcases

### FG-XTEN-001 — Tenant A user probeert tenant B customer te lezen

**Actor:** U1, user alleen in tenant A.  
**Doel:** Valideren dat customer-detailroutes en customer-API's niet op alleen `customer.id` vertrouwen.

1. Log in als U1 en selecteer tenant `demo-a`.
2. Open een legitieme customer uit `demo-a` en bevestig dat deze zichtbaar is.
3. Vervang in de URL, server action payload of API-call de customer-id door de id van `B-Customer-01`.
4. Herhaal voor lijstfilters, zoekparameters en eventuele contactpersoon-subresources.

**Verwacht:** U1 krijgt geen inhoud van `B-Customer-01`; er worden geen B-contactpersonen, objecten, documenten, aantallen of metadata gelekt.

### FG-XTEN-002 — Tenant A user probeert tenant B assignment te lezen

**Actor:** U1, user alleen in tenant A.  
**Doel:** Valideren dat assignment-detail, werkbonnen, gekoppelde objecten en statusinformatie tenant-scoped zijn.

1. Log in als U1 binnen `demo-a`.
2. Open `A-Assignment-01` en bevestig normale toegang.
3. Roep de detailroute/API aan met de id van `B-Assignment-01`.
4. Test ook gekoppelde endpoints zoals planningregels, toegewezen personeel, documenten, urenregels en statusgeschiedenis.

**Verwacht:** U1 ziet geen assignmentdata van `demo-b`; gekoppelde subresources geven eveneens geen data of bestaanserkenning terug.

### FG-XTEN-003 — Tenant A klant probeert tenant B klantportaaldata te lezen

**Actor:** U5, klantgebruiker tenant A.  
**Doel:** Valideren dat het klantportaal zowel op tenant als op customer-koppeling is afgeschermd.

1. Log in als U5 in het klantportaal.
2. Bevestig toegang tot eigen klantdata, objecten, tickets, offertes, rapportages, documenten en facturen van `demo-a`.
3. Vervang routeparameters, queryparameters of request bodies door ids van tenant B, waaronder `B-Customer-01`, `B-Assignment-01`, `B-Document-01` en `B-Invoice-01.pdf`.
4. Herhaal voor download- en previewroutes die signed URLs of PDF-streams teruggeven.

**Verwacht:** U5 krijgt geen tenant B-klantportaaldata, geen signed URL en geen PDF-stream van `demo-b`.

### FG-XTEN-004 — Tenant A personeel probeert tenant B planning te lezen

**Actor:** U6, personeelsgebruiker tenant A.  
**Doel:** Valideren dat planning, open diensten en assignmentdetails in de personeelsapp niet buiten de eigen tenant of personnel-koppeling uitleesbaar zijn.

1. Log in als U6 in de personeelsapp.
2. Bevestig toegang tot eigen planning of open diensten binnen `demo-a`.
3. Roep planning-, assignment- en dienstdetailroutes aan met ids uit `demo-b`, waaronder `B-Planning-01` en `B-Assignment-01`.
4. Test ook media, rapportages, urenregistratie en notificaties die via planning of assignment bereikbaar zijn.

**Verwacht:** U6 krijgt geen planning of assignmentcontext van `demo-b`; directe ids leveren geen details of afgeleide metadata op.

### FG-XTEN-005 — Direct-ID access op documenten

**Actoren:** U1, U3 met actieve tenant `demo-a`, U5 en U6.  
**Doel:** Valideren dat documentrecords en documentdownloads niet via document-id of gekoppelde entity-id buiten scope toegankelijk zijn.

1. Noteer de document-id van `B-Document-01`.
2. Probeer als elke actor het documentdetail, metadata-endpoint en downloadendpoint rechtstreeks aan te roepen.
3. Probeer dezelfde document-id te combineren met een toegestane tenant A customer-, assignment-, object- of personnel-id.
4. Probeer lijstendpoints te manipuleren met filters zoals `document_id`, `entity_id`, `assignment_id`, `customer_id` of `tenant_id=demo-b`.

**Verwacht:** Geen actor met actieve tenant A-context krijgt documentmetadata, bestandsnaam, mimetype, storage path, preview of downloadlink van `demo-b`.

### FG-XTEN-006 — Direct-ID access op facturen/PDF's

**Actoren:** U1, U3 met actieve tenant `demo-a` en U5.  
**Doel:** Valideren dat factuurdetails, PDF-rendering en PDF-downloads tenant- en customer-scoped zijn.

1. Noteer de invoice-id en PDF-route van `B-Invoice-01.pdf`.
2. Roep factuurdetailroutes direct aan met de tenant B invoice-id.
3. Roep PDF-preview, PDF-download, payment en statusroutes direct aan met tenant B ids.
4. Controleer of redirects, cache headers, bestandsnamen en foutmeldingen geen tenant B-informatie lekken.

**Verwacht:** Er wordt geen PDF, signed URL, paymentstatus of factuurmetadata van `demo-b` teruggegeven.

### FG-XTEN-007 — Storage object path guessing

**Actoren:** U1, U5 en U6.  
**Doel:** Valideren dat storage policies niet alleen vertrouwen op voorspelbare paden of client-side checks.

1. Verzamel geldige storage paths voor tenant A en tenant B.
2. Probeer tenant B-paden te raden door in tenant A-paden `demo-a` te vervangen door `demo-b`.
3. Probeer varianten met URL-encoding, hoofd-/kleine letters, dubbele slashes, relatieve segmenten en bekende bucketnamen.
4. Probeer direct objectdownload, preview, upload overwrite en delete als de UI/API die acties ondersteunt.

**Verwacht:** Tenant B-objecten zijn niet leesbaar, overschrijfbaar of verwijderbaar. Foutmeldingen onthullen geen bucketstructuur buiten wat publiek gedocumenteerd is.

### FG-XTEN-008 — Module uit maar URL/API direct aanroepen

**Actoren:** U1, U3 en U5, afhankelijk van de module.  
**Doel:** Valideren dat module-entitlements server-side worden afgedwongen en niet alleen menu-items verbergen.

1. Zet een module uit voor `demo-a`, bijvoorbeeld planning, facturen, documenten of klantportaalfunctionaliteit.
2. Log in als actor die normaal toegang zou hebben als de module aan stond.
3. Navigeer direct naar de module-URL en roep onderliggende API-routes/server actions direct aan.
4. Test lezen, aanmaken, wijzigen, downloaden en exporteren binnen de uitgeschakelde module.
5. Herhaal met `demo-b` waar de module wel aan staat om te bevestigen dat de testdata functioneel is.

**Verwacht:** Voor `demo-a` blokkeert de server alle moduleacties ondanks directe URL/API-aanroep; voor `demo-b` blijft toegang alleen mogelijk voor correct geautoriseerde gebruikers binnen die tenant.

### FG-XTEN-009 — Sector buiten entitlement aanmaken of wijzigen

**Actoren:** U1 en U3 met actieve tenant `demo-a`.  
**Doel:** Valideren dat sector-entitlements niet alleen in formulieren worden gefilterd, maar ook bij server-side mutaties worden gecontroleerd.

1. Leg vast welke sectoren voor `demo-a` toegestaan zijn en welke sector alleen voor `demo-b` of helemaal niet toegestaan is.
2. Maak via de normale UI een record aan met een toegestane sector om de happy flow te bevestigen.
3. Manipuleer daarna de create-payload naar een sector buiten de entitlement.
4. Manipuleer een update-payload van een bestaand record naar een sector buiten de entitlement.
5. Herhaal voor relevante domeinen zoals customer, object, assignment, template, product/dienst of rapportageconfiguratie als die sector-afhankelijk zijn.

**Verwacht:** Create en update worden server-side geweigerd; bestaande records blijven ongewijzigd en er ontstaan geen afgeleide records met de verboden sector.

## Regressiecriteria

Een release slaagt alleen voor deze matrix als:

1. Alle cross-tenant directe-id tests aantoonbaar geblokkeerd zijn.
2. Portaalgebruikers nooit data buiten hun eigen customer/personnel-koppeling kunnen lezen.
3. Storage paths niet bruikbaar zijn als alternatieve autorisatieroute.
4. Uitgeschakelde modules server-side ontoegankelijk zijn.
5. Sectoren buiten entitlement niet via gemanipuleerde requests kunnen worden aangemaakt of gewijzigd.
6. Support- en multi-tenant toegang expliciet tenantcontext, logging en auditbaarheid behouden.
