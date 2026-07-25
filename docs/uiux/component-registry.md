# Fieldgrid component registry

| Contract      | Canonical implementation                                                              | Radix behavior | Allowed use                                                   | Variants             | Migration |
| ------------- | ------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------- | -------------------- | --------- |
| Button        | `artifacts/backoffice/src/components/ui/button.tsx`                                   | Slot           | all actions and links styled as actions                       | tone, size           | canonical |
| Alert dialog  | `artifacts/backoffice/src/components/ui/alert-dialog.tsx`                             | AlertDialog    | destructive or irreversible confirmation                      | default, destructive | canonical |
| Dialog        | `artifacts/backoffice/src/components/ui/dialog.tsx`                                   | Dialog         | modal forms and focused tasks                                 | size                 | canonical |
| Sheet/drawer  | `artifacts/backoffice/src/components/ui/sheet.tsx`, `drawer.tsx`                      | Dialog         | mobile actions and supporting panels                          | side, size           | canonical |
| Dropdown menu | `artifacts/backoffice/src/components/ui/dropdown-menu.tsx`                            | DropdownMenu   | compact action lists                                          | default              | canonical |
| Popover       | `artifacts/backoffice/src/components/ui/popover.tsx`                                  | Popover        | contextual controls and combobox surface                      | width                | canonical |
| Tooltip       | `artifacts/backoffice/src/components/ui/tooltip.tsx`                                  | Tooltip        | supplementary pointer/focus help, never required-only content | side                 | canonical |
| Select        | `artifacts/backoffice/src/components/ui/select.tsx`                                   | Select         | bounded single choice                                         | density              | canonical |
| Checkbox      | `artifacts/backoffice/src/components/ui/checkbox.tsx`                                 | Checkbox       | independent boolean or multi-choice                           | default              | canonical |
| Switch        | `artifacts/backoffice/src/components/ui/switch.tsx`                                   | Switch         | immediate on/off setting                                      | size                 | canonical |
| Tabs          | `artifacts/backoffice/src/components/ui/tabs.tsx`                                     | Tabs           | permission-aware local views                                  | density              | canonical |
| Accordion     | `artifacts/backoffice/src/components/ui/accordion.tsx`                                | Accordion      | progressive disclosure                                        | single, multiple     | canonical |
| Collapsible   | `artifacts/backoffice/src/components/ui/collapsible.tsx`                              | Collapsible    | one independently collapsible region                          | default              | canonical |
| Command       | `artifacts/backoffice/src/components/ui/command.tsx`                                  | Dialog adapter | global command/search palette                                 | dialog, popover      | canonical |
| Table         | `artifacts/backoffice/src/components/ui/table.tsx`                                    | semantic table | desktop data view                                             | density              | canonical |
| Form fields   | `field.tsx`, `form.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`                     | Label/Slot     | labeled form composition                                      | state, density       | canonical |
| Feedback      | `alert.tsx`, `toast.tsx`, `sonner.tsx`, `progress.tsx`, `skeleton.tsx`, `spinner.tsx` | Toast/Progress | pending, success, error and loading state                     | tone                 | canonical |
| Status        | `status-badge.tsx`, `badge.tsx`                                                       | n/a            | text-plus-color status                                        | tone                 | canonical |

## Approved composition layer

The W04-W06 migration may add Fieldgrid-owned compositions for `PageHeader`, `FieldgridDataView`, `FilterBar`, `BulkActionBar`, `MutationFeedback`, `ResponsiveActionSheet`, `UnsavedChangesGuard` and planning controls. Every addition must be registered here before product routes adopt it.

## Exceptions

No permanent custom-interaction exception is approved at bootstrap. Native input exceptions follow the architecture document. Temporary pre-existing violations are tracked by the gate baseline and must be removed before strict completion.
