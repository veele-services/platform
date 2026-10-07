# Referentie voor verliesvrije mapping

Deze map is een hulpmiddel voor Codex. Er is geen Fieldgrid-endpoint, doelveld of authenticatie geïmplementeerd. De website in `../website/` importeert deze bestanden niet; haar live gedrag blijft ongewijzigd.

1. Onderzoek de echte Fieldgrid-repository en vul `mapping-worksheet.csv` in. Geen enkele standaardmapping wordt als bewezen aangeboden.
2. Valideer de voorgestelde `submission-envelope.schema.json` en het gekoppelde `../website/integration/inquiry.schema.json` (registreer zijn `$id` bij de validator). Voer aanvullende semantische validatie uit. De mapper vervangt die validatie niet.
3. Bouw expliciet geverifieerde mappingregels. Gebruik echte doelveldnamen. De `TEST_ONLY_*`-namen in tests zijn uitsluitend unit-testfixtures.
4. Roep `mapInquiry(envelope, {rules, existingNotes, maxNotesCharacters})` aan op de server. De retourwaarde bevat `nativeAssignments`, `extraNotes`, bronmetadata, een lijst overgebleven bronpaden en tellingen. Gebruik `existingNotes` alleen bij een bestaande aanvraag; retries mogen dit blok niet nogmaals toevoegen.
5. Schrijf assignments en extraNotes via de daadwerkelijke aanvraagservice. Controleer het échte tekstveld op codepoints/UTF-16/bytes zoals de doel-API dat vereist; de referentie meet Unicode-codepoints. Een helperresultaat is nooit een ontvangstbewijs.

Een regel bevat `verified: true`, een of meer volledige JSON Pointer-bronpaden, een geverifieerd doel en `convert(valuesBySourcePath)`. Alleen `{accepted: true, value: ...}` consumeert de volledige bronantwoorden. Zorg dat die functie aantoonbaar alle informatie bewaart; de mapper kan semantisch informatieverlies binnen zelfgeschreven conversies niet herkennen. Schrijf per echte transformatie een passende test. Als een veld/lijst deels niet past, retourneer `accepted: false`; dan blijft het volledige antwoord beschikbaar in extraNotes.

Vrije algemene opmerkingen (`inquiry.message`) gaan altijd mee in extraNotes. Bestaande opmerkingen worden ervoor behouden. Niet-gekoppelde tekst behoudt regeleinden; enumcodes worden naast Nederlandse uitleg getoond. Gedeelde servicebijzonderheden en bezoekers kunnen meermaals met dienstcontext worden vermeld, maar zijn één antwoord en worden nooit opgeteld.

Arrays zijn atomair. Een adres kan via een samengestelde regel uit straat en huisnummer worden gevormd. Dubbele doelvelden/bronverwerking worden geweigerd. De helper verricht geen browseractie of netwerkverzoek. Bij te lange opmerkingen wordt een `NotesCapacityError` geworpen zonder truncatie; de echte adapter moet het verliesvrije opslag- of foutpad verzorgen.

```sh
node --test fieldgrid-reference/map-inquiry.test.mjs
```

De tests gebruiken deels minimale mappingfixtures; die zijn geen complete voorbeelden voor de JSON-schema-validator. Het complete schema-gevalideerde voorbeeld staat in `../examples/submission-envelope.synthetic.json`.
