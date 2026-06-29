# Fieldgrid branding-inventaris

Datum: 2026-06-29.

Deze inventaris classificeert gevonden branding- en naamgevingsverwijzingen in de gevraagde scope:

- `README.md`
- `replit.md`
- `docs/`
- `artifacts/backoffice/src`
- `artifacts/klant-pwa/src`
- `artifacts/personeel-pwa/src`
- `artifacts/api-server/src`
- `lib/db/src/schema/organization-settings.ts`
- e-mailtemplate helpers
- PDF-generatie
- notificatiecopy
- deploymentdocumentatie

Gebruikte zoektermen tijdens inspectie: `Veele`, `VEELE`, `veele`, `Fieldgrid`, `Replit`, `replit`, `logo`, `brand`, `pdf`, `e-mail`, `notificatie`, `deployment`, `deploy`, `demo`, `example`, `Acme`, `Schoonmaak`.

## 1. Platformbranding die naar Fieldgrid moet

| Pad | Zoekterm(en) | Aanbevolen vervolgactie |
| --- | --- | --- |
| `README.md` | `Veele`, `VEELE`, `veele` | Herschrijf productnaam, monorepo-beschrijving, servicepoorten, staging/productiepaden en deploycommando's naar Fieldgrid-conventies. |
| `replit.md` | `Veele Services Platform`, `Veele`, `VEELE`, `veele`, `Design tokens`, `Canon` | Maak dit het Fieldgrid-canonbestand: platformnaam, ontwerpprincipes, CSS-tokennaamgeving, domeinen en deploypaden vervangen. |
| `artifacts/backoffice/src/app/layout.tsx` | `Veele Backoffice`, `Veele` | Vervang metadata en app-titel door Fieldgrid Backoffice. |
| `artifacts/backoffice/src/app/(auth)/login/page.tsx` | `VEELE`, `Veele account` | Vervang statische login-branding door Fieldgrid; tenantnaam hoort pas na authenticatie zichtbaar te zijn. |
| `artifacts/backoffice/src/app/(auth)/wachtwoord-vergeten/page.tsx` | `VEELE` | Vervang reset-flow branding door Fieldgrid. |
| `artifacts/backoffice/src/app/(auth)/reset-wachtwoord/page.tsx` | `VEELE` | Vervang reset-flow branding door Fieldgrid. |
| `artifacts/backoffice/src/components/layout/Sidebar.tsx` | `VEELE`, `Veele`, `veele` | Hernoem logo-component/aria-labels naar Fieldgrid en behoud tenantcontext apart. |
| `artifacts/backoffice/src/components/layout/MobileHeader.tsx` | `VEELE`, `Veele` | Vervang mobiele backoffice-headerbranding door Fieldgrid. |
| `artifacts/backoffice/src/app/globals.css` | `Veele Palette`, `Veele Brand Colors`, `.veele-*` | Beslis of CSS-klassen compatibel blijven; vervang comments/tokens naar Fieldgrid en plan optionele class-rename-migratie. |
| `artifacts/klant-pwa/src/app/layout.tsx` | `Veele Klantportaal`, `Veele Services`, `Veele` | Vervang publieke metadata door Fieldgrid-klantportaal of dynamische tenantmetadata zodra beschikbaar. |
| `artifacts/klant-pwa/src/app/(auth)/login/page.tsx` | `Veele Klantportaal` | Vervang auth-schermbranding door Fieldgrid, omdat tenant nog niet betrouwbaar bekend is. |
| `artifacts/klant-pwa/src/components/MobileHeader.tsx` | `VeeleLogo`, `Veele Services home`, `VEELE` | Hernoem component en statisch logo naar Fieldgrid of maak later tenant-aware na login. |
| `artifacts/klant-pwa/src/components/DesktopSidebar.tsx` | `VeeleLogo` | Volg hernoeming uit `MobileHeader.tsx`; voorkom Veele-componentnamen in Fieldgrid-code. |
| `artifacts/personeel-pwa/src/app/layout.tsx` | `Veele Personeel`, `Veele` | Vervang metadata door Fieldgrid Personeel of dynamische tenantmetadata zodra beschikbaar. |
| `artifacts/personeel-pwa/src/app/(auth)/login/page.tsx` | `Veele`, `VEELE` | Vervang personeels-loginbranding door Fieldgrid. |
| `artifacts/personeel-pwa/src/components/MobileHeader.tsx` | `VeeleLogo`, `Veele Services home`, `VEELE` | Hernoem component en statisch logo naar Fieldgrid. |
| `artifacts/personeel-pwa/src/components/DesktopSidebar.tsx` | `Veele` | Vervang vaste sidebar-branding door Fieldgrid of tenantnaam op ingelogde schermen. |
| `artifacts/api-server/src/lib/email.ts` | `Veele <noreply@veele.nl>`, `https://veele.nl`, `Veele platform` | Vervang platformfallbacks door Fieldgrid-waarden; tenantafzender moet via instellingen kunnen overrulen. |
| `artifacts/klant-pwa/src/lib/email.ts` | `Veele <noreply@veele.nl>`, `https://veele.nl`, `Veele platform` | Vervang fallback-afzender, URL en template-header door Fieldgrid. |
| `artifacts/personeel-pwa/src/lib/email.ts` | `Veele <noreply@veele.nl>`, `https://veele.nl`, `Veele platform` | Vervang fallback-afzender, URL en template-header door Fieldgrid. |
| `artifacts/backoffice/src/lib/email.ts` | `Veele`, `VEELE`, `veele.nl` | Vervang generieke e-mailtemplatebranding naar Fieldgrid; koppel tenantlogo/-kleuren aan templatevarianten. |
| `artifacts/backoffice/src/lib/smtp-mailer.ts` | `Veele`, `veele` | Vervang SMTP-test/default-afzender en eventuele message-id/domain-fallbacks naar Fieldgrid. |
| `artifacts/backoffice/src/app/actions/settings.ts` | `Veele`, `Veele platform`, `Test SMTP-instellingen Veele`, `Veele-Test-2026!` | Vervang testmail- en notificatietemplatecopy door Fieldgrid en verwijder merknaam uit testwachtwoord. |
| `artifacts/api-server/src/lib/native-push.ts` | `veele_operations` | Hernoem FCM Android channel fallback naar Fieldgrid-conventie; let bestaande installs migreren met compatibele kanaalstrategie. |
| `artifacts/personeel-pwa/src/lib/native-push.ts` | `veele_operations`, `Veele meldingen` | Hernoem kanaal-id en kanaalnaam naar Fieldgrid; behoud oude id alleen als migratiepad nodig is. |
| `artifacts/personeel-pwa/src/lib/offline/work-order-queue.ts` | `veele-personeel-*`, `veele:*`, `VEELE_PROCESS_OFFLINE_QUEUE` | Hernoem storage keys/events/postMessage types naar Fieldgrid; maak migratie voor bestaande offline queues. |
| `artifacts/personeel-pwa/src/components/NativePushTokenSync.tsx` | `nl.veeleservices.personeel` | Vervang native app-id door Fieldgrid package-id; afstemmen met Capacitor/android releaseconfig. |

## 2. Tenantbranding die dynamisch moet worden

| Pad | Zoekterm(en) | Aanbevolen vervolgactie |
| --- | --- | --- |
| `lib/db/src/schema/organization-settings.ts` | `logoUrl`, `emailAfzender`, `emailTemplateBrandColor`, `emailTemplateAccentColor`, `Veele Services` | Gebruik deze tabel als bron voor tenantbranding; vervang defaults `Veele Services` door neutrale Fieldgrid/tenant placeholders of verplicht tenantseed-waarden. |
| `artifacts/backoffice/src/app/actions/settings.ts` | `logo`, `brandColor`, `accentColor`, `emailTemplateFooterText`, `emailTemplateSignature` | Breid instellingen door naar alle e-mail-, PDF-, portal- en notificatie-renderers; vermijd statische `Veele Services` in verzonden berichten. |
| `artifacts/backoffice/src/components/settings/OrganisatieForm.tsx` | `logo`, `e-mailafzender`, organisatiegegevens | Bevestig dat alle tenantvelden worden beheerd; voeg preview toe voor Fieldgrid-platformshell versus tenantmerk. |
| `artifacts/backoffice/src/components/settings/NotificatiesView.tsx` | `brand`, `template`, `notificatie`, `Veele` | Maak template-preview tenant-aware en vervang merknaam in voorbeeldcopy door organisatie-instellingen. |
| `artifacts/backoffice/src/components/settings/MailSettingsView.tsx` | `SMTP`, `afzender`, `testmail`, `Veele` | Testmail moet tenantafzender en tenantfooter gebruiken, met Fieldgrid alleen als technische fallback. |
| `artifacts/backoffice/src/lib/invoice-pdf.ts` | `VEELE`, `Veele Services`, `logo`, PDF-generatie | Maak factuur-PDF's tenant-aware: organisatiegegevens, logo, kleuren, footer en betaalomschrijving uit settings. |
| `artifacts/backoffice/src/app/api/invoices/batches/[id]/pdf/route.ts` | `VEELE`, `Veele Services - Verzamelfactuur` | Vervang statische batch-PDF-branding door tenantgegevens. |
| `artifacts/klant-pwa/src/lib/invoice-pdf.ts` | `VEELE`, `Veele Services - Bedankt voor uw opdracht` | Maak klantfactuur-PDF tenant-aware; klant ziet uitvoerende organisatie, niet Fieldgrid-platformmerk. |
| `artifacts/klant-pwa/src/app/api/verzamelfactuur/[id]/pdf/route.ts` | `VEELE`, `Veele Services - Verzamelfactuur` | Maak klant-verzamelfactuur-PDF tenant-aware. |
| `artifacts/backoffice/src/app/api/reports/[id]/pdf/route.ts` | `Veele Services`, `VEELE` | Rapportage-PDF moet tenantnaam/logo tonen als uitvoerder, niet hardcoded Veele. |
| `artifacts/backoffice/src/app/actions/customers.ts` | `Klantenlijst — Veele`, `VEELE` | Export-PDF/HTML moet tenant- of Fieldgrid-adminbranding gebruiken; bij klantgerichte export tenantbranding toepassen. |
| `artifacts/backoffice/src/app/actions/invoices.ts` | `Verzamelfactuur Veele Services` | Betaal-/factuuromschrijvingen moeten tenantnaam uit settings gebruiken. |
| `artifacts/klant-pwa/src/actions/payments.ts` | `Verzamelfactuur Veele Services` | Mollie/betaalomschrijving tenant-aware maken. |
| `artifacts/klant-pwa/src/actions/auth.ts` | `Neem contact op met Veele Services` | Foutmeldingen in tenantportaal moeten organisatie-/supportnaam dynamisch tonen of neutraal formuleren. |
| `artifacts/klant-pwa/src/actions/tickets.ts` | `CUSTOMER_VISIBLE_TENANT_AUTHOR = "Veele Services"` | Vervang door tenantnaam/organisatie-instelling voor zichtbare auteur. |
| `artifacts/personeel-pwa/src/actions/reports.ts` | `DEFAULT_PUBLIC_REPORT_AUTHOR = "Veele Services"` | Vervang door tenantnaam voor klantzichtbare rapportauteur. |
| `artifacts/backoffice/src/app/actions/quotes.ts` | `sourceLabel: "Veele Services"` | Offerte-/portaalnotificaties moeten tenantnaam gebruiken. |
| `artifacts/backoffice/src/app/actions/tickets.ts` | `Veele Services heeft gereageerd`, `sourceLabel: "Veele Services"` | Ticketnotificatiecopy dynamisch maken per tenant; fallback neutraal zoals `Uw dienstverlener`. |
| `artifacts/backoffice/src/app/actions/settings.ts` | `sourceLabel: "Veele Services"` | Handmatige/testnotificaties dynamisch maken met tenantnaam. |
| `artifacts/backoffice/src/app/(dashboard)/tickets/page.tsx` | `Actie Veele` | Label tenant-aware maken, bijvoorbeeld `Actie organisatie` of `Actie <tenantnaam>`. |
| `artifacts/klant-pwa/src/app/(app)/meldingen/tickets/TicketStatus.tsx` | `Actie Veele` | Klantstatuslabel tenant-aware maken. |
| `artifacts/personeel-pwa/src/app/(app)/berichten/TicketStatus.tsx` | `Actie Veele` | Personeelsstatuslabel tenant-aware maken. |
| `artifacts/backoffice/src/app/(dashboard)/tickets/[kind]/[id]/ReplyForm.tsx` | `Typ de reactie namens Veele Services` | Placeholder tenant-aware maken. |
| `artifacts/klant-pwa/src/app/(app)/page.tsx` | `Welkom terug bij Veele Services` | Klantdashboard begroeting tenant-aware maken. |
| `artifacts/klant-pwa/src/app/(app)/layout.tsx` | `Veele Services`, `profile?.name ?? "Veele Services"` | Header fallback vervangen door tenantnaam uit profiel/settings. |
| `artifacts/klant-pwa/src/components/MobileHeader.tsx` | `profile?.name ?? "Veele Services"` | Ingelogde klantheader tenant-aware maken. |
| `artifacts/klant-pwa/src/app/(app)/meer/page.tsx` | `contact opnemen met Veele Services` | Supportcopy tenant-aware maken. |
| `artifacts/klant-pwa/src/app/(app)/documenten/page.tsx` | `door Veele Services met u gedeeld` | Documentencopy tenant-aware maken. |
| `artifacts/klant-pwa/src/app/(app)/meldingen/tickets/page.tsx` | `richting Veele Services` | Ticketcopy tenant-aware maken. |
| `artifacts/klant-pwa/src/app/(app)/opdrachten/aanvragen/RequestAssignmentForm.tsx` | `Veele Services beoordeelt` | Aanvraagcopy tenant-aware maken. |
| `artifacts/personeel-pwa/src/components/PersonnelRealtimeOfflineProvider.tsx` | `Veele Services`, `VEELE_PUSH_NOTIFICATION`, `animate-veele-notification-slide-in` | Push/toast zichtbare merknaam tenant-aware maken; technische event/classnamen later naar Fieldgrid migreren. |

## 3. Historische/demo-data die voorlopig mag blijven

| Pad | Zoekterm(en) | Aanbevolen vervolgactie |
| --- | --- | --- |
| `docs/development/staging-demo-seed.md` | `demo`, `Veele`, `staging` | Mag blijven als historische seeddocumentatie; markeer bij volgende seed-refresh als Fieldgrid-demo met expliciete fictieve tenant. |
| `docs/customer-query-scope-audit-v1.md` | voorbeeldroutes voor factuur/verzamelfactuur-PDF | Geen directe merknaam in titel; inhoud is audit-historie. Alleen actualiseren als scope-audit opnieuw wordt uitgevoerd. |
| `docs/customer-visibility-audit-v1.md` | `Veele Services`, klantzichtbaarheid | Mag blijven als audit-snapshot, maar label als pre-Fieldgrid/Veele-historie. |
| `docs/personnel-query-scope-audit-v1.md` | `notificatie-ID`, auditvoorbeelden | Geen urgente merkactie; blijft audit-historie. |
| `docs/security-final-audit-v1.md` | `Veele`, auditbevindingen | Mag blijven als historische beveiligingsaudit; voeg eventueel bovenaan status `historisch`. |
| `docs/security/supabase-hardening-audit.md` | `Veele`, hardening-audit | Mag blijven als technische audit-historie. |
| `docs/storage-policy-upload-audit-v1.md` | auditvoorbeelden | Mag blijven als audit-historie; geen brandingblokker. |
| `docs/tenant-query-audit-v1.md` | tenant-audit | Mag blijven als historische tenant-scope audit. |
| `artifacts/backoffice/src/app/actions/settings.ts` | `Veele-Test-2026!` | Alleen voorlopig als testdata acceptabel; aanbevolen om snel te vervangen door merkloze gegenereerde testwaarde. |

## 4. Documentatie die later herschreven moet worden

| Pad | Zoekterm(en) | Aanbevolen vervolgactie |
| --- | --- | --- |
| `docs/canon-projectanalyse-2026-06-23.md` | `Veele Services Platform`, `Veele-identiteit`, `Veele notification` | Herschrijf als Fieldgrid productanalyse of archiveer als pre-rebrand canon. |
| `docs/handleiding-veele-platform-v1.0.md` | `Veele Services Platform`, `Veele Services` | Maak nieuwe Fieldgrid-handleiding met tenantneutrale terminologie en screenshots. |
| `docs/klanthandleiding-veele-platform-v1.0.md` | `Veele Services Platform`, `Veele Services` | Herschrijf als Fieldgrid klant-/tenanttemplate; klantgerichte passages moeten tenantnaam als variabele gebruiken. |
| `docs/veele-services-gebruikershandleiding.md` | `Veele Services`, `Veele` | Archiveer of herschrijf naar Fieldgrid gebruikershandleiding. |
| `docs/pdf-validation-v1.md` | `Veele Services`, PDF-validatie | Actualiseer zodra PDF-generatie tenant-aware is; validatiecriteria moeten Fieldgrid/tenantbranding expliciet toetsen. |
| `docs/deployment/capacitor-personeel.md` | `veele`, `Veele`, package-id | Herschrijf native deployment naar Fieldgrid package-id's, appnamen, pushkanalen en releaseflow. |
| `docs/deployment/self-hosted-runner.md` | `veele`, `deploy`, VPS-paden | Herschrijf runner/deploypaden naar Fieldgrid; behoud oude paden alleen als migratiehoofdstuk. |
| `docs/deployment/systemd-timers.md` | `veele`, `notification-worker`, `email-notifications`, `push-notifications` | Herschrijf timers/services naar Fieldgrid-namen; check backwards compatibility voor bestaande units. |
| `replit.md` | `Replit`, `Veele Services Platform`, `Veele` | Na code-rebrand herschrijven als actuele Fieldgrid architectuur- en deploycanon. |
| `README.md` | `Veele`, `veele`, deployinstructies | Na code-rebrand herschrijven als publieke/ontwikkelaars-README voor Fieldgrid. |
