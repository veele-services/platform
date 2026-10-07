# Veele Services — aangeleverde Frame-website

Bron: de door de opdrachtgever geselecteerde Frame v5-overdracht, vastgelegd
in `SOURCE.json`. Alle oorspronkelijke 99 hashes zijn bij ontvangst gecontroleerd.
De aangeleverde fontlicenties blijven bij de assets.

De snapshot is aangepast voor echte Fieldgrid-intake, privacytekst, huidige
tenant-origin, portaalingangen, nonce-CSP en review-motion. De aangeleverde
vormgeving is behouden. Onderhoud `assets/`, `src/` en de Python-generator.
`pnpm build` genereert de 28 pagina’s en kopieert de assets naar de publieke
namespace. Het genegeerde `dist/` is uitsluitend lokale generatoruitvoer.

`reference/` bevat de meegeleverde mapper en tests plus de nu ingevulde
veldmapping. Dit is een referentiecontract; de echte serveradapter en
database-authoriteit staan in de Fieldgrid-code. Zie
`docs/architecture/veele-public-website.md` voor runtime, mapping en deployment.
