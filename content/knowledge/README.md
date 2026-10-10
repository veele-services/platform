# Redactiebronnen van de Fieldgrid-kennisbank

Deze bestanden bevatten de beoordeelde **initiële** Nederlandstalige artikelen
voor platform, tenantbeheer, personeel en klanten. Gedeelde inhoud staat in
`common.mjs`; `index.mjs` verzamelt de 46 unieke artikelen. Ieder artikel heeft
minimaal 300 woorden en meerdere secties. De generator controleert unieke slugs,
minimumlengte en bestaande verwante slugs.

De inhoud is afgeleid van de huidige routes en domeinen in `app`, `components`
en `lib`, plus de contractspecificaties onder `docs/architecture`. De
[codebaseanalyse](../../docs/releases/codebase-analyse-2026-10-10.md) bevat
bronverwijzingen en expliciete productgrenzen. Artikelen beschrijven daadwerkelijk
aanwezige handelingen en noemen module-, rollen- en bindingsvoorwaarden. Er staan
geen klantgegevens, accountcodes, secrets of geplande functies als belofte in.

`node scripts/generate-knowledge-seed.mjs` genereert de eerste seedmigratie.
De runtime importeert deze bronnen niet; live inhoud komt uit de database.
De seed voegt alleen ontbrekende slugs toe. Latere deploys overschrijven de
platformredactie niet. Na release is de historische migratie onveranderlijk:
onderhoud via `/platform/kennisbank`, of voeg voor nieuwe initiële inhoud een
afzonderlijke beoordeelde voorwaartse migratie toe.

Opslaan maakt een concept; publiceren gebeurt apart. Een herstelde versie is
opnieuw een concept. Controleer bronfunctie, doelgroep, stappen, terminologie en
verwante links vóór publicatie. Support en andere portalen hebben geen redactie-
rechten. De inhoud is algemene Fieldgrid-uitleg, geen private tenantdocumentatie.
