# Fieldgrid UI/UX traceability

This file is generated from the canonical masterplan and `uiux-traceability.json` by `scripts/fieldgrid-uiux-traceability.mjs`.

| ID        | Requirement                                                                         | Work package              | Status | PR         | Tests | Evidence | Staging result | Notes |
| --------- | ----------------------------------------------------------------------------------- | ------------------------- | ------ | ---------- | ----- | -------- | -------------- | ----- |
| PB-001    | Planbord gebruikt werkelijke starttijd                                              | W01                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| PB-002    | Lopende bon eindigt dynamisch op “nu”                                               | W01                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| PB-003    | Afgeronde bon gebruikt werkelijke eindtijd                                          | W01                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| PB-004    | Geplande tijd blijft apart bewaard en zichtbaar                                     | W01                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| PB-005    | Personeelsplanning gebruikt dezelfde effectieve tijd                                | W01                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| PB-006    | Realtime managementrefresh na start/afronding                                       | W01                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| PB-007    | Minuutticker zonder DB-write                                                        | W01                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| PB-008    | Conflicten gebruiken actuele intervallen                                            | W01                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| PB-009    | Interesse-selectie maakt `assigned`-koppeling                                       | W01                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| PB-010    | Vereiste plaatsen gebruiken expliciet aantal én rollen                              | W01                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| PB-011    | Volledig bezet zet geldige bon op `scheduled`                                       | W01                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| PB-012    | Selectie is idempotent en concurrency-safe                                          | W01                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| PB-013    | Planbord en personeelsapp updaten na selectie                                       | W01                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| PB-014    | Reserve plant niet in                                                               | W01                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-001 | Architectuurdocument en canonieke component registry                                | W00/W04                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-002 | Eén `components/ui` primitive-laag; geen concurrerende componentbibliotheek         | W04/W15                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-003 | Dialogs en risicobevestigingen via Dialog/AlertDialog                               | W03/W04/W11               | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-004 | Sheets, dropdowns, popovers, tooltips en hovercards via Radix/shadcn                | W04/W06/W07/W08/W10/W11   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-005 | Selects, comboboxes, checkboxes, radio groups, switches en toggles via Radix/shadcn | W04/W06/W07/W11           | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-006 | Tabs, accordions en collapsibles via één toegankelijke Radix/shadcn-wrapper         | W04/W05/W08/W11           | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-007 | Overlays hebben focus trap/return, Escape, scroll lock en correcte modaliteit       | W04/W14                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-008 | Eén portal- en z-indexschaal zonder lokale z-index hacks                            | W04/W14                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-009 | Veilig `asChild`-gebruik zonder nested interactive elements                         | W04/W14                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-010 | Radix `data-state`-styling en reduced-motionconforme animaties                      | W04/W14                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-011 | Typed CVA-varianten voor size, tone, density en state                               | W04/W06                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-012 | Semantische design tokens; geen hardcoded canonieke merkkleuren                     | W04 en alle migratietaken | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-013 | Geen dubbele primitives of pagina-specifieke dialog/menu/select-implementaties      | W04/W15                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-014 | Platform raw controls migreren naar canonieke shadcn/Radix-components               | W11                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-015 | FieldgridDataView gebruikt shadcn Table en Radix-controls                           | W06/W07                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-016 | Formulierarchitectuur gebruikt shadcn fields en Radix-keuzecontrols                 | W03/W06/W11/W12           | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-017 | Planbordcontrols en ondersteunende overlays zijn Radix/shadcn-gebaseerd             | W10                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-018 | Command palette gebruikt shadcn Command + Radix Dialog/Popover                      | W05                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-019 | Visuele kwaliteitslat strak, sober, consistent en professioneel                     | W04/W09/W11/W12/W13       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| RADIX-020 | Component-, keyboard-, overlay- en visual-regressietests bewijzen compliance        | W14/W16                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-001    | Object-KPI-databronnen en labels corrigeren                                         | W02                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-002    | Formulieren op mobiel één kolom                                                     | W03                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-003    | Tabs zonder permissie/module verbergen                                              | W02                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-004    | Onvoltooide placeholders uit release-UI                                             | W02/W11                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-005    | Confirm-dialogs voor kritieke platformmutaties                                      | W03/W11                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-006    | Pending/success/error voor platformmutaties                                         | W03/W11                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-007    | Planbord zonder drag bedienbaar                                                     | W10                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-008    | Planbord keyboardbediening                                                          | W10                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-009    | Whitelabelcontrast automatisch veilig                                               | W04                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-010    | Mobiele bulkbars en drawers veilig                                                  | W03/W06                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-011    | Zoekveldverwachting klopt met gedrag                                                | W05                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-012    | Verborgen legacy- en `false`-markup verwijderen                                     | W02                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-013    | Tenantnavigatie groeperen                                                           | W05                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-014    | Platformnavigatie groeperen                                                         | W05/W11                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-015    | Kaart als Planning-weergave, niet hoofdmenu                                         | W05                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-016    | Help/Roadmap/Releases uit primaire tenantnav                                        | W05                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-017    | Onboarding en tabellen van platformdashboard                                        | W11                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-018    | Centrale routeconfig                                                                | W05                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-019    | Alle tenantpagina’s op gedeelde shell/header                                        | W06/W07/W08/W09           | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-020    | Eén gedeelde dataview                                                               | W06                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-021    | Filters en chips standaardiseren                                                    | W06/W07                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-022    | Detailtabs sticky en permission-aware                                               | W08                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-023    | Alleen actieve detailtab zwaar laden                                                | W08/W11                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-024    | Mobiele detailactiesheet                                                            | W08                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-025    | Personeelswidgets beter plaatsen                                                    | W07                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-026    | Personeel standaardkolommen verminderen                                             | W07                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-027    | Planbord werkdagvenster/zoom/dichtheid                                              | W10                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-028    | Open werkbonnenwachtrij zichtbaar                                                   | W10                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-029    | Optimistische planbordupdates + undo                                                | W10                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-030    | Platformtermen/statuswaarden vertalen                                               | W11/W13                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-031    | Hardcoded merkkleuren naar semantische tokens                                       | W04 en alle migratietaken | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-032    | Platform- en tenantcomponenten harmoniseren                                         | W04/W11                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-033    | Radius/spacing/densityschalen                                                       | W04                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-034    | Saved views                                                                         | W06/W07/W10               | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-035    | Kolomkeuze en tabeldichtheid                                                        | W06                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-036    | Globale commandopalette                                                             | W05                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-037    | Recent bekeken items/concepten                                                      | W09                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-038    | Betere empty states en skeletons                                                    | W06/W08/W13               | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-039    | Tabs tonen workflowstatus                                                           | W08                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-040    | Desktoplogin visueel rijker                                                         | W12                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-041    | Productbrede microcopyrichtlijnen                                                   | W13                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-042    | UX-analytics voor zoeken/filters/fouten                                             | W13                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-043    | Rolgestuurd tenantdashboard                                                         | W09                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-044    | Acties tonen eigenaar/wachttijd/SLA                                                 | W09                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-045    | “Doorgaan waar ik was”                                                              | W09                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-046    | Reistijd/buffer/beschikbaarheid op planbord                                         | W10                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-047    | Stabiele/verklaarde matchsortering                                                  | W10                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-048    | Sticky formulierfooter                                                              | W06                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-049    | Progressive disclosure in formulieren                                               | W06/W07                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-050    | Tijdvalidatie en duurfeedback                                                       | W06                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-051    | Unsaved-changesbescherming                                                          | W06/W08                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-052    | Klantdetailtabs hergroeperen                                                        | W08                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-053    | Platformtenanttabs hergroeperen                                                     | W11                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-054    | Login gebruikt dynamische viewport/touchtargets                                     | W12                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-055    | Status niet alleen met kleur                                                        | W04/W14                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-056    | Skeletons i.p.v. globale spinner                                                    | W13                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-057    | Nederlandse metadata en terminologie                                                | W13                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-058    | 320/430/1024/1280/1920 regressietests                                               | W14                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-059    | `aria-sort`, focus, labels en screenreaderflow                                      | W14                       | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
| UX-060    | Final release bevat geen horizontale overflow                                       | W14/W16                   | OPEN   | LOCAL_ONLY | —     | —        | NOT_RUN        | —     |
