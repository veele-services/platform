# AGENTS.md — Veele Services marketingwebsite

## Missie
Lever een productieklare, snelle, toegankelijke en premium marketingwebsite voor Veele Services. De visuele referentie in `public/reference/homepage-reference.jpg` is leidend voor sfeer en hiërarchie, niet voor het letterlijk kopiëren van pixels of eventuele foutieve tekst.

## Niet-onderhandelbaar
1. Behoud alle 44 routes en alle inhoud uit `content/website-content.json`.
2. Geen onbevestigde claims publiceren. Raadpleeg `docs/CLAIMS_VALIDATION.md`.
3. Geen secrets, persoonsgegevens of klantdata in Git, logs, screenshots of fixtures.
4. Publieke marketing en geauthenticeerd klantenportaal blijven securitymatig gescheiden.
5. WCAG 2.2 AA, toetsenbordbediening, reduced motion en semantische HTML.
6. Core Web Vitals en mobiel ontwerp zijn releasegates.
7. Geen stockfoto’s met onduidelijke licentie. Houd bron/licentie/consent bij.
8. Minimal-diff commits, één logisch onderwerp per commit, geen destructieve repositoryacties.

## Werkwijze met sub-agents
Gebruik parallelle sub-agents voor: (A) design system/UI, (B) content+SEO, (C) forms/integraties, (D) QA/accessibility/performance. Laat één lead-agent integreren en conflicten oplossen. Agents mogen geen gedeelde kernbestanden gelijktijdig aanpassen zonder afstemming.

## Verplichte gates
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- route inventory: exact 44 marketingroutes
- Playwright smoke tests voor desktop + mobiel
- axe accessibility scan op home, diensten, offerte, contact, portaal
- Lighthouse/CWV budgetten
- security review van forms, headers, CSP, rate limiting en PII logging
- visuele regressies voor home, dienstpagina, locatiepagina en formpagina

## Definitie van klaar
Geen TODO’s met P0/P1, alle gates groen, claims gevalideerd of verwijderd, productie-assets gelicenseerd, formulieren end-to-end getest, analytics consent-aware, redirect- en SEO-migratieplan goedgekeurd.
