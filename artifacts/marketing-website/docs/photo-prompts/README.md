# Veele Services — 8K fotopromptbibliotheek

Deze bibliotheek dekt alle fotografische beeldplaatsen op de 44 marketingroutes: 44 hero's en 179 inhoudelijke secties, samen 223 plaatsingen. Iedere productieprompt is geschreven voor gebruik met het officiële Veele-logo als meegestuurde beeldreferentie. Alleen inhoudelijk identieke secties mogen één masterbeeld delen; bij zo'n prompt staan alle routes waarop het beeld wordt gebruikt expliciet vermeld.

## Bestanden en routecoverage

| Bestand | Routes | Promptblokken | Beeldplaatsingen |
|---|---:|---:|---:|
| [`brand-local-conversion.md`](./brand-local-conversion.md) | Home, diensten, organisatie, conversie, portaal en 7 lokale pagina's | 75 | 81 |
| [`cleaning-security.md`](./cleaning-security.md) | Schoonmaak en beveiliging | 56 | 80 |
| [`facility-sectors.md`](./facility-sectors.md) | Facilitair en oplossingen per sector | 51 | 62 |
| **Totaal** | **44 routes** | **182** | **223** |

## Gebruik per prompt

1. Voeg één officieel Veele-logo als image reference toe:
   - `public/brand/veele-logo-inverse.svg` voor donker marine textiel, voertuigen of donkere signing;
   - `public/brand/veele-logo-primary.svg` voor lichte signing en witte achtergronden;
   - gebruik de icon-variant alleen wanneer de beschikbare fysieke merkdrager te klein is voor het woordmerk.
2. Kopieer de volledige prompt zonder delen weg te laten. Elke prompt is zelfstandig en bevat opnieuw de merk-, realism- en negatieve instructies.
3. Genereer eerst de exact bij de prompt genoemde 8K-master. Genereer een afzonderlijke verticale variant wanneer de prompt dit vraagt; forceer geen onnatuurlijke crop uit een liggende opname.
4. Controleer gezichten, handen, uniformdetails, reflecties, leesbare nooduitgangen en de exacte logogeometrie op 200–400% zoom.
5. Als het generatiemodel het logo ook maar minimaal vervormt: laat in de foto een fysiek geloofwaardig, perspectivisch passend leeg merkvlak staan en plaats daarna het originele SVG-logo als smart object in de nabewerking. Nooit een bijna-correct logo publiceren.

## Vaste productie- en exportregels

- **Master:** gebruik de afmeting in het promptblok; alle masters zijn minimaal 7680 px breed en dus geschikt voor een 8K-productieworkflow. Bewaar waar mogelijk een 16-bit bronbestand in Display P3 of Adobe RGB.
- **Desktop web:** gebruik de expliciete desktopcrop uit het promptblok; exporteer primair als AVIF met WebP-fallback en streef naar 220–420 kB.
- **Mobiel web:** gebruik de expliciete mobiele crop en safe zone uit het promptblok; exporteer als AVIF/WebP en streef naar 180–320 kB.
- **Extra varianten:** maak alleen de genoemde brede of secundaire crop; een per-prompt afmeting gaat altijd vóór een algemene exportvoorkeur.
- **Open Graph:** 2400×1260 px, 1.91:1; geen essentieel onderwerp of logo in de buitenste 12%.
- **Kleur:** natuurlijke huidtinten, gecontroleerde hooglichten, diepe Veele-navy schaduwen zonder dichtgelopen zwart, aqua alleen als merkaccent.
- **Verscherping:** uitsluitend voor het uiteindelijke exportformaat; geen crunchy HDR, halos of overmatige clarity.
- **Responsive safe area:** houd gezicht, handen en primaire handeling binnen de middelste 58% van de 8K-master. Laat aan minstens één zijde rustige negatieve ruimte voor webcopy.
- **Toegankelijkheid:** lever per beeld een feitelijke alttekst van maximaal circa 140 tekens; zet decoratieve crops op lege alttekst wanneer dezelfde informatie al in de paginakop staat.

## Merk- en juridische randvoorwaarden

- Gebruik uitsluitend de door de eigenaar aangeleverde Veele-logo's; geometrie, kleuren en onderlinge verhoudingen niet wijzigen.
- Geen zichtbare logo's van klanten, beveiligingspartners, voertuigen, kledingmerken, apparatuurmerken of locaties van derden.
- Geen kentekens, pasfoto's, bezoekerslijsten, beveiligingscodes, persoonsgegevens of herkenbare documenten.
- Voor herkenbare personen zijn modelrelease en productieconsent vereist. Voor herkenbaar privaat vastgoed is locatietoestemming vereist.
- Beelden mogen geen onbevestigde certificering, politierol, medische bevoegdheid of geweldsbevoegdheid suggereren.

## Plaatsing in de website

De prompts reserveren bestanden onder `public/images/generated/`. Gebruik in Next.js altijd `next/image`, correcte `sizes`, een vaste aspect-ratio en expliciete breedte/hoogte om layout shift te voorkomen. De huidige abstracte `ServiceVisual` en `TemplateVisual` blijven fallback totdat de gegenereerde beelden visueel, juridisch en inhoudelijk zijn goedgekeurd. Controleer de volledige dekking met `node scripts/verify-photo-prompts.mjs`.
