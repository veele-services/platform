# Directe taakprompt voor Codex Desktop/Cloud

Werk volledig autonoom verder aan deze Veele Services marketingwebsite. Lees eerst `README.md`, `AGENTS.md`, `content/website-content.json`, `content/media-manifest.json`, `docs/CLAIMS_VALIDATION.md` en bekijk `public/reference/homepage-reference.jpg`.

## Repositoryveiligheid
- Inspecteer eerst `git status`, branch en repository-instructies.
- Maak een aparte branch: `feat/veele-marketing-44-page-site`.
- Verwijder of overschrijf geen bestaande integraties zonder bewijs en expliciete noodzaak.
- Gebruik kleine, logisch gescheiden commits.

## Doel
Maak van dit starterpakket een volledig productieklare 44-pagina website in Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui en Motion. De homepage-referentie is de visuele north star: donker marine hero, aqua-accent, geloofwaardige fotografie, scherpe typografie, zwevende proof strip, witte contentzones en premium zakelijke rust.

## Parallelle uitvoering
Gebruik meerdere sub-agents:
1. **Design/UI-agent** — tokens, componenten, responsive detailniveau, motion, fotografiekaders, visuele regressies.
2. **Content/SEO-agent** — alle 44 routes, metadata, schema.org, interne links, lokale SEO Den Haag/Haaglanden, canonical/redirects.
3. **Forms/integratie-agent** — offerte/contact/sollicitatie, zod, anti-spam, rate limiting, CRM/mail-adapter, consent, foutafhandeling.
4. **QA-agent** — tests, a11y, performance, securityheaders, route inventory, broken links, reduced motion.
Eén lead-agent integreert het werk en bewaakt `AGENTS.md`.

## Eerst uitvoeren
1. Zet dependencyversies vast en genereer een lockfile.
2. Voer `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm build` uit en herstel alles tot groen.
3. Verifieer dat alle 44 slugs renderen en metadata correct is.
4. Vervang de generieke sectieopbouw door gevarieerde maar consistente templates: homepage, dienstoverzicht, detaildienst, sector, lokaal, content/cases, werken-bij, contact/offerte, portaalmarketing.
5. Implementeer een echte shadcn/ui setup waar nuttig; voorkom componenten om componenten.
6. Voeg hoogwaardige responsieve afbeeldingsslots toe. Gebruik placeholders totdat goedgekeurde foto’s beschikbaar zijn; verzin geen klantlogo’s of certificaten.
7. Maak Motion subtiel: reveal, stagger, hover en route transition; respecteer `prefers-reduced-motion`.
8. Maak de formulieren production-ready via adapters en `.env` placeholders. Nooit secrets hardcoden.
9. Voeg Playwright, axe en visuele smoke tests toe.
10. Documenteer alle vereiste variabelen en externe handelingen in `docs/INTEGRATION_CHECKLIST.md`.

## Kwaliteitscriteria
- Pixelzorgvuldig op 360, 390, 768, 1024, 1440 en 1920 px.
- WCAG 2.2 AA; focus states; semantische headings; goed contrast.
- Geen horizontale overflow, layout shift of zware niet-geoptimaliseerde media.
- SEO-copy natuurlijk; geen doorway pages of plaatsnaam-spam.
- Route-specifieke interne links en CTA’s.
- Portaalmarketing toont transparantie, maar bevat geen productie-auth of echte data.
- Nederlandse spelling, tone of voice: deskundig, menselijk, helder, niet schreeuwerig.

## Eindrapport
Rapporteer branch, commits, exacte eind-SHA, gewijzigde bestanden, screenshots, alle uitgevoerde gates, route-aantal, resterende externe blokkades en een expliciete lijst met secrets/variabelen die de eigenaar nog moet toevoegen. Push of merge alleen wanneer de omgeving en opdracht dit expliciet toestaan.
