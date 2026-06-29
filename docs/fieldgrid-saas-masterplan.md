# Fieldgrid SaaS-masterplan

Dit document is canon voor alle vervolgtaken rondom de positionering, domeinstructuur, tenant-inrichting, isolatie, modules, sectoren, pakketten en facturatie van Fieldgrid.

## 1. Platformpositionering

Fieldgrid is het SaaS-platform. Alle functionele, technische en commerciële keuzes worden voortaan vanuit Fieldgrid als centraal platform benaderd.

Veele Services is geen apart platform en geen uitzonderingscase in de architectuur. Veele Services is een gewone tenant binnen Fieldgrid en moet op dezelfde manier behandeld worden als andere tenants.

## 2. Domeinstrategie

Het hoofddomein van het SaaS-platform wordt:

- `fieldgrid.nl`

De platform-admin komt op een apart platformdomein, bijvoorbeeld:

- `platform.fieldgrid.nl`

Tenants krijgen eigen subdomains binnen Fieldgrid. Custom domains kunnen later optioneel ondersteund worden, maar zijn geen vereiste voor de eerste fase.

Voorbeelden:

- `veele.fieldgrid.nl`
- `tenantnaam.fieldgrid.nl`

## 3. Tenantmodel en databasekeuze

Het gekozen model is één gedeelde database met sterke tenant-isolatie.

Dat betekent:

- alle tenants draaien binnen hetzelfde platformmodel;
- tenantdata wordt strikt gescheiden via tenant-identificatie en afdwingbare autorisatie;
- queries, policies en applicatielogica moeten tenant-isolatie expliciet respecteren;
- Veele Services volgt exact hetzelfde tenantmodel als andere tenants.

Een database-per-tenant of aparte applicatie-instantie per tenant is niet het gekozen standaardmodel.

## 4. Modules

Modules zijn tenant-specifiek aan of uit te zetten.

Dat betekent dat het platform globaal meerdere modules kan aanbieden, terwijl per tenant wordt bepaald welke modules beschikbaar zijn. Modulebeschikbaarheid hoort dus niet hardcoded per klant of per domein te zijn, maar beheerd te worden via tenantconfiguratie.

## 5. Sectoren

Sectoren blijven een globale catalogus met tenant-toewijzing.

Dat betekent:

- sectoren worden platformbreed beheerd als gedeelde catalogus;
- tenants kunnen aan één of meerdere sectoren gekoppeld worden;
- sectorspecifieke inrichting mag tenant-specifiek toegepast worden, maar de basisdefinitie van sectoren blijft globaal.

## 6. Eerste pakketten

De eerste commerciële pakketten zijn:

1. Starter
2. Professional
3. Enterprise

Deze pakketten vormen de initiële basis voor productpositionering, toegangsrechten, limieten en commerciële inrichting. Verdere pakketdetails kunnen later uitgewerkt worden, maar deze drie namen zijn de canonieke startindeling.

## 7. Betaling en facturatie

Automatische betaling komt later.

Voor de eerste fase is handmatige facturatie voldoende. De architectuur mag toekomstige automatische betaling niet blokkeren, maar automatische incasso, online checkout, payment-provider-integratie of self-service billing zijn geen vereisten voor de eerste implementatiefase.

## Canonieke uitgangspunten

Voor vervolgtaken gelden deze uitgangspunten als leidend:

- Fieldgrid is het SaaS-platform.
- Veele Services is een gewone tenant binnen Fieldgrid.
- `fieldgrid.nl` is het hoofddomein.
- Platform-admin draait op een apart platformdomein zoals `platform.fieldgrid.nl`.
- Tenants gebruiken subdomains en kunnen later eventueel custom domains krijgen.
- Eén database met sterke tenant-isolatie is het gekozen model.
- Modules zijn per tenant aan of uit te zetten.
- Sectoren blijven een globale catalogus met tenant-toewijzing.
- Starter, Professional en Enterprise zijn de eerste pakketten.
- Handmatige facturatie is eerst voldoende; automatische betaling volgt later.
