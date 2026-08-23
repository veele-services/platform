# Dossier 360 — vervolgwerk na de veilige foundation-release

De foundation kan met onderstaande Object Security-flags op `false` veilig naar staging. De onafgemaakte toegangspaden zijn niet zichtbaar en serveracties falen gesloten.

## Releaseflags

- `FIELDGRID_OBJECT_SECURITY_MANAGEMENT_ACCESS_ENABLED=false`
- `FIELDGRID_OBJECT_SECURITY_LEGACY_BACKFILL_ENABLED=false`

Activeer geen van beide flags voordat de bijbehorende checklist volledig groen is.

## P0/P1-vervolg

- [ ] Maak een duurzame, databasegebonden policyrevisie en trek challenges/unlocks atomisch in bij role-, permission-, account- en policywijzigingen.
- [ ] Implementeer het personeels-pad met alle assignment-, object-, status-, tijdvenster-, kwalificatie-, e-mail- en sessievoorwaarden bij unlock én iedere read.
- [ ] Implementeer het klant-pad met expliciete klantcontact-/objectscope, versiebeheer en optionele managementgoedkeuring.
- [ ] Implementeer break-glass met afzonderlijke bevoegdheid, reden/incidentreferentie, verse OTP, zeer korte geldigheid, melding en reviewaudit.
- [ ] Voeg browser-/concurrencytests toe voor replay, intrekking, herplanning, permission revoke/regrant, e-maildeverificatie en secretrotatie tijdens een open sessie.
- [ ] Maak een tweefasenpromotie: eerst rollback-compatibele code uitrollen en valideren; pas in een volgende release legacywaarden versleuteld backfillen en wissen.
- [ ] Voeg een staging dry-run en reconciliationrapport toe voor de legacybackfill voordat `FIELDGRID_OBJECT_SECURITY_LEGACY_BACKFILL_ENABLED=true` wordt gezet.
- [ ] Maak en registreer drie afzonderlijke stagingsecrets: encryptie-keyring, actieve keyversie en OTP-pepper; roteerbare keyversies moeten behouden blijven voor historische decryptie.
- [ ] Zet managementtoegang pas aan na authenticated UAT op 320–1920 px en bevestigde no-cache/no-offline/no-prefetch-evidence.

## Bestaande stagingkoppeling

De GitHub staging environment bevat al `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY`. Deze vervangen de Object Security-keyring en OTP-pepper niet.
