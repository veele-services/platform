# Fieldgrid component registry

| Contract      | Canonical implementation                                                              | Radix behavior | Allowed use                                                   | Variants             | Migration |
| ------------- | ------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------- | -------------------- | --------- |
| Button        | `artifacts/backoffice/src/components/ui/button.tsx`                                   | Slot           | all actions and links styled as actions                       | tone, size           | canonical |
| Alert dialog  | `artifacts/backoffice/src/components/ui/alert-dialog.tsx`                             | AlertDialog    | destructive or irreversible confirmation                      | default, destructive | canonical |
| Dialog        | `artifacts/backoffice/src/components/ui/dialog.tsx`                                   | Dialog         | modal forms and focused tasks                                 | size                 | canonical |
| Sheet/drawer  | `artifacts/backoffice/src/components/ui/sheet.tsx`, `drawer.tsx`                      | Dialog         | mobile actions and supporting panels                          | side, size           | canonical |
| Dropdown menu | `artifacts/backoffice/src/components/ui/dropdown-menu.tsx`                            | DropdownMenu   | compact action lists                                          | default              | canonical |
| Popover       | `artifacts/backoffice/src/components/ui/popover.tsx`                                  | Popover        | contextual controls and combobox surface                      | width                | canonical |
| Hover card    | `artifacts/backoffice/src/components/ui/hover-card.tsx`                               | HoverCard      | supplementary pointer/focus preview, never required-only data | side                 | canonical |
| Context menu  | `artifacts/backoffice/src/components/ui/context-menu.tsx`                             | ContextMenu    | optional pointer menu with keyboard-accessible alternatives   | inset, destructive   | canonical |
| Tooltip       | `artifacts/backoffice/src/components/ui/tooltip.tsx`                                  | Tooltip        | supplementary pointer/focus help, never required-only content | side                 | canonical |
| Select        | `artifacts/backoffice/src/components/ui/select.tsx`                                   | Select         | bounded single choice                                         | density              | canonical |
| Checkbox      | `artifacts/backoffice/src/components/ui/checkbox.tsx`                                 | Checkbox       | independent boolean or multi-choice                           | default              | canonical |
| Radio group   | `artifacts/backoffice/src/components/ui/radio-group.tsx`                              | RadioGroup     | one choice from a visible short set                           | default              | canonical |
| Switch        | `artifacts/backoffice/src/components/ui/switch.tsx`                                   | Switch         | immediate on/off setting                                      | size                 | canonical |
| Toggle/group  | `artifacts/backoffice/src/components/ui/toggle.tsx`, `toggle-group.tsx`               | Toggle/Group   | compact view or formatting mode                               | tone, size           | canonical |
| Tabs          | `artifacts/backoffice/src/components/ui/tabs.tsx`                                     | Tabs           | permission-aware local views                                  | density              | canonical |
| Accordion     | `artifacts/backoffice/src/components/ui/accordion.tsx`                                | Accordion      | progressive disclosure                                        | single, multiple     | canonical |
| Collapsible   | `artifacts/backoffice/src/components/ui/collapsible.tsx`                              | Collapsible    | one independently collapsible region                          | default              | canonical |
| Command       | `artifacts/backoffice/src/components/ui/command.tsx`                                  | Dialog adapter | global command/search palette                                 | dialog, popover      | canonical |
| Table         | `artifacts/backoffice/src/components/ui/table.tsx`                                    | semantic table | desktop data view                                             | density              | canonical |
| Form fields   | `field.tsx`, `form.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`                     | Label/Slot     | labeled form composition                                      | state, density       | canonical |
| Form grid     | `artifacts/backoffice/src/components/ui/form-grid.tsx`                                | n/a            | one-column-first responsive form layout                       | 1-4 columns          | canonical |
| Form actions  | `artifacts/backoffice/src/components/ui/form-actions.tsx`                             | n/a            | sticky save/cancel actions with safe-area and feedback         | status               | canonical |
| Time range    | `artifacts/backoffice/src/components/ui/time-range-field.tsx`                         | native time    | paired start/end input with duration and validation            | default              | canonical |
| Unsaved guard | `artifacts/backoffice/src/components/ui/unsaved-changes-guard.tsx`                    | AlertDialog    | before-unload and explicit in-product discard confirmation     | default              | canonical |
| Prompt dialog | `artifacts/backoffice/src/components/ui/prompt-dialog.tsx`                           | Dialog         | validated text input formerly handled by browser prompts       | 1-n fields           | canonical |
| Bulk actions  | `artifacts/backoffice/src/components/ui/bulk-action-bar.tsx`                          | n/a            | responsive selection summary and grouped actions               | default              | canonical |
| Feedback      | `alert.tsx`, `toast.tsx`, `sonner.tsx`, `progress.tsx`, `skeleton.tsx`, `spinner.tsx` | Toast/Progress | pending, success, error and loading state                     | tone                 | canonical |
| Status        | `status-badge.tsx`, `badge.tsx`                                                       | n/a            | text-plus-color status                                        | tone                 | canonical |

## Approved composition layer

The W04-W06 migration may add Fieldgrid-owned compositions for `PageHeader`, `FieldgridDataView`, `FilterBar`, `MutationFeedback`, `ResponsiveActionSheet` and planning controls. Every addition must be registered here before product routes adopt it.

## Exceptions

No permanent custom-interaction exception is approved at bootstrap. Native input exceptions follow the architecture document. Temporary pre-existing violations are tracked by the gate baseline and must be removed before strict completion.

All canonical controls use a 44px default target; compact 36px variants are
explicit desktop-density choices. Portalled layers use the semantic
`--z-dropdown`, `--z-overlay`, `--z-modal` and `--z-toast` tokens. Functional
motion has a `prefers-reduced-motion` fallback. Runtime tenant colors are paired
with a computed WCAG text-color fallback before they reach component tokens.
