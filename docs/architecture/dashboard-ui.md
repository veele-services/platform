# Shared dashboard UI

The tenant backoffice, platform console, staff app and customer portal use the
same visual primitives. Tenant colors come from `brandThemeStyle` and cross DOM
portals through `TenantThemeProvider`; components must not infer the tenant from
another element's styles or duplicate its display name beside a configured logo.

## Components

- `PageHeading`: uppercase eyebrow, title and adjacent help, with the page action
  toolbar aligned to the title. Put primary create actions last in the toolbar.
- `ActionIcon` / `ActionLink`: accessible labeled square controls. Use a plus for
  creation, a view/edit icon for row actions, and a shared dropdown for overflow.
  File downloads remain native anchors with the same `fg-action-icon` class.
- `ContentTabs`: keyboard-operable tabs attached to their content surface. Use
  `fg-tabbed-content` with real links for tabs that navigate to another URL.
  Keep scrolling inside the tab row, not the page. `DossierNavigation` uses
  `dossier-tabbed-content` and `dossier-tab-surface` for the same attached frame
  around route-driven customer, personnel, object and work-order dossiers.
- `ContentSection`: titled section and bordered body. A list whose active tab
  already supplies its title uses `panel resource-table-panel` directly, without
  repeating the tab title above the table.
- `EmptyState`: magnifier, concise title and a next-step description. A filtered
  empty list should suggest adjusting filters; an unconfigured list should
  explain its relevant first step.
- `ListPagination`: count and page summary, page-size selection and direct page
  selection. Render it outside the table's bordered container. Client pagination
  is only valid for a complete authorized collection.
- `AccountMenu`, shared Radix dropdown/popover/dialog wrappers: one menu frame,
  themed focus/hover treatment and consistent typography. Preserve accessible
  names even when the visible control is icon-only.
- `SessionLoading` / `RouteLoading`: tenant logo or name fallback plus progress,
  including server route transitions. Keep account/session boundaries intact.

## Tables and forms

Use a `table-scroll` wrapper inside the list panel. Column headers fill the frame
and use uppercase labels; body cells use regular case. Clickable record titles
are semibold. Sort controls must change the complete result set through the
existing server query or sort the entire loaded collection before pagination.
Expose the active direction using `aria-sort`; never add decorative sorting that
only rearranges a single server page.

`app/dashboard-system.css` owns shared frames, table typography, input focus,
icon controls and overlay appearance. Module CSS should supply module layout,
not compete with these primitives using more-specific selectors. Text inputs
have one subtle focus treatment; composite fields put it on their wrapper.
Keyboard focus for buttons, links and tabs remains visible.

## Verification

The browser checks cover desktop/mobile overflow, subtitle/title order, header
alignment, grouped search keyboard navigation and header control dimensions.
Existing module suites cover modal behavior, permissions, unsaved form state,
customer payment selection, downloads and staff planning. Review screenshot
changes as part of a visual change; passing a newly captured baseline alone is
not evidence of correct appearance.
