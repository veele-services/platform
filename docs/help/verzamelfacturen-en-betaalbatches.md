# Verzamelfacturen en betaalbatches

## Twee verschillende resultaten

**Verzamelfactuur maken** zet meerdere goedgekeurde uitvoeringsbronnen van één
klant op één nieuwe factuur met één nummer en één PDF. **Betaallink bundelen**
laat een klant meerdere al bestaande facturen in één checkout betalen. De
factuurnummers en PDF's blijven bij een betaalbatch afzonderlijk bestaan.

## Een verzamelfactuur maken

1. Open Facturen en kies **Factureerbaar werk**.
2. Filter op uitvoeringsdatum, object, contract en discipline. De server past de
   filters vóór paginering toe.
3. Selecteer bronnen van één klant.
4. Kies **Verzamelfactuur maken**.
5. Controleer klant, werkbonnummers, objecten, uitvoeringsdatums, taak-,
   meerwerk- en materiaalregels, btw-groepen en totaal.
6. Finaliseer éénmaal.

De server leest prijs, btw, rapportversie en resterende hoeveelheid opnieuw.
Een requestretry met dezelfde genormaliseerde bronnen levert dezelfde factuur;
dezelfde sleutel met een andere bron of hoeveelheid wordt geweigerd.

De PDF en het klantportaal tonen veilige broncontext zonder personeelsnamen of
interne notities. Een klantcontact moet toegang hebben tot alle bronobjecten.
Anders moet finance een bevoegd contact kiezen of de facturatie splitsen.

## Een betaalbatch maken

1. Selecteer definitieve openstaande facturen van één klant.
2. Kies **Betaallink bundelen**.
3. Controleer de actuele restbedragen en kopieer of verstuur de nieuwe link via
   de bestaande factuurflow.
4. Bij een retry roteert Fieldgrid het bearer-token en trekt de oude actieve
   link in; groep en factuurselectie blijven dezelfde atomaire opdracht.

Klantportaal en externe link bepalen beide opnieuw de actieve, geverifieerde
tenant-Mollieontvanger. Profiel en test/live-modus worden op de poging
vastgelegd en tegen het providerantwoord gecontroleerd.

## Statussen juist lezen

- **Gereserveerd:** bedrag is voor een poging vastgezet; nog niet betaald.
- **In behandeling:** de provider verwerkt de poging.
- **Onzeker:** eerst reconciliëren; geen tweede poging starten.
- **Mislukt/geannuleerd/verlopen:** telt niet als geboekte betaling.
- **Bevestigd betaald:** alleen deze allocatie verhoogt `paid_cents`.

Een browserreturn is geen betalingsbewijs. Webhook- en reconciliatieverwerking
controleren poging, merchantprofiel, modus, bedrag, valuta en allocaties en zijn
eenmalig toepasbaar. Een reeds correct bevestigde historische betaling kan nog
worden verwerkt wanneer de link later vervalt; dat verleent geen nieuwe
checkouttoegang.
