# Veele Services marketingwebsite — Codex handoff starter

Dit pakket is een **uitvoerbare Next.js-basis** voor de 44-pagina marketingwebsite. De gekozen homepage-showcase staat in `public/reference/homepage-reference.jpg` en is uitsluitend visuele referentie. Alle 44 pagina’s worden door de catch-all App Router-route opgebouwd uit `content/website-content.json`.

## Direct starten in de platformmonorepo

```bash
pnpm install
cp artifacts/marketing-website/.env.example artifacts/marketing-website/.env.local
pnpm --filter @workspace/marketing-website dev
```

Daarna: `http://localhost:3000`.

De volledige kwaliteitscontrole draait vanuit de repositoryroot met:

```bash
pnpm --filter @workspace/marketing-website check
pnpm --filter @workspace/marketing-website test:e2e
```

## Belangrijk

- Dependencyversies zijn vastgezet in het centrale `pnpm-lock.yaml`; gebruik uitsluitend de pnpm-versie uit de repositoryroot.
- Formulier-API’s geven alleen een veilige stub-response. Koppel pas na een privacy- en securityreview aan mail/CRM.
- Claims, cijfers, certificeringen, logo’s en referenties moeten vóór publicatie schriftelijk gevalideerd worden.
- De fotografie in `public/images` zijn placeholders. Gebruik gelicenseerde of eigen beelden conform `content/media-manifest.json`.
- De portaalpagina is marketing/demo. Integreer authenticatie en klantdata niet in dit publieke project zonder expliciete architectuurbeslissing.

## 44 routes

01. `/` — Home
02. `/diensten` — Diensten
03. `/schoonmaak` — Schoonmaak overzicht
04. `/schoonmaak/kantoorschoonmaak` — Kantoorschoonmaak
05. `/schoonmaak/vve-vastgoed` — VvE- en vastgoedschoonmaak
06. `/schoonmaak/winkels` — Winkelschoonmaak
07. `/schoonmaak/horeca` — Horecaschoonmaak
08. `/schoonmaak/glasbewassing` — Glasbewassing
09. `/schoonmaak/specialistisch-oplevering` — Specialistische en opleveringsschoonmaak
10. `/beveiliging` — Beveiliging overzicht
11. `/beveiliging/objectbeveiliging` — Objectbeveiliging
12. `/beveiliging/mobiele-surveillance` — Mobiele surveillance
13. `/beveiliging/winkelbeveiliging` — Winkelbeveiliging
14. `/beveiliging/evenementen` — Evenementenbeveiliging
15. `/beveiliging/horeca` — Horecabeveiliging
16. `/beveiliging/receptie-toegangscontrole` — Receptie en toegangscontrole
17. `/beveiliging/persoonsbeveiliging` — Persoonsbeveiliging
18. `/beveiliging/chauffeursdiensten` — Chauffeursdiensten
19. `/facilitair` — Facilitaire diensten overzicht
20. `/facilitair/receptie-gastvrijheid` — Receptie en gastvrijheid
21. `/facilitair/evenementenpersoneel` — Evenementenpersoneel
22. `/facilitair/horeca-bar` — Horeca- en bardiensten
23. `/facilitair/sanitaire-service` — Sanitaire service
24. `/oplossingen` — Sectoren overzicht
25. `/oplossingen/kantoren` — Kantoren en bedrijfsverzamelgebouwen
26. `/oplossingen/vve-vastgoed` — VvE en vastgoedbeheer
27. `/oplossingen/retail` — Retail
28. `/oplossingen/horeca-hotels` — Horeca en hotels
29. `/oplossingen/evenementen` — Evenementen en locaties
30. `/oplossingen/zorg-onderwijs` — Zorg en onderwijs
31. `/over-ons` — Over Veele Services
32. `/cases` — Cases
33. `/kennis` — Kennis
34. `/werken-bij` — Werken bij
35. `/contact` — Contact
36. `/offerte` — Offerte aanvragen
37. `/portaal` — Portaal login en help
38. `/den-haag` — Dienstverlening Den Haag
39. `/scheveningen` — Dienstverlening Scheveningen
40. `/rijswijk` — Dienstverlening Rijswijk
41. `/voorburg-leidschendam` — Dienstverlening Voorburg en Leidschendam
42. `/wassenaar` — Dienstverlening Wassenaar
43. `/delft` — Dienstverlening Delft
44. `/zoetermeer` — Dienstverlening Zoetermeer

## Meegeleverd

- Next.js App Router + TypeScript + Tailwind CSS v4-opzet
- shadcn/ui-compatibele primitives
- Motion scroll-reveals
- Alle 44 contentrecords, metadata en FAQ’s
- sitemap, robots, JSON-LD en canonical metadata
- Responsive header/footer, hero, cards, proces, FAQ, CTA en formulieren
- Referentieafbeeldingen, complete PDF en webcopy
- `AGENTS.md`, `CODEX_PROMPT.md`, checklist en claimvalidatie
