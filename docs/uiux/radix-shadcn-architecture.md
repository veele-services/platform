# Radix-first shadcn/ui architecture

## Layering

1. Radix packages provide behavior, ARIA semantics, focus management and portals.
2. `artifacts/backoffice/src/components/ui` owns the current canonical local shadcn/ui-style primitive implementations.
3. Approved Fieldgrid composition components combine primitives for product patterns such as data views, page headers and mutation feedback.
4. Product routes consume the local primitive or approved composition layer and never import Radix directly.

The mockup sandbox is a development reference and is not a released component source. Components are promoted from it only by reviewing and placing an implementation in the canonical product layer.

## Import boundaries

- Allowed direct Radix imports: `**/components/ui/**` and explicitly documented adapter paths.
- Product routes and feature components import from their application alias, normally `@/components/ui/*`.
- Cross-application sharing belongs in `@workspace/shared-ui` only when the component has no application-specific routing, authorization or server dependency.
- Duplicate components with the same interaction contract are not allowed outside the registry.

## Overlay and portal contract

- Modal dialog and sheet content uses a Radix portal.
- Overlay z-index tokens are `--z-dropdown`, `--z-sticky`, `--z-overlay`, `--z-modal` and `--z-toast`; local numeric z-index escalation is not allowed.
- Modal overlays lock background scroll, trap focus, close with Escape unless a documented safety rule prevents it, and return focus to the trigger.
- Destructive confirmation uses `AlertDialog`.
- Non-modal contextual actions use `Popover` or `DropdownMenu`, selected according to content and keyboard behavior.

## `asChild`

`asChild` receives exactly one semantic interactive root. The child must forward its ref and props. Never nest a button in a button, a link in a link, or create an interactive descendant inside an interactive trigger.

## Variants, state and motion

- Shared visual variants use typed CVA definitions.
- State styling uses Radix `data-state`, `data-disabled`, `data-highlighted` and equivalent attributes.
- Motion respects `prefers-reduced-motion`.
- Product code uses semantic color, spacing, radius, density and elevation tokens rather than literal brand colors.

## Native controls

Native text, number, date, time, file and hidden inputs remain valid where native behavior is the accessible and reliable choice. Native select, checkbox, radio and switch controls require a recorded exception because canonical Radix/shadcn controls cover those interactions.

## Density

- `comfortable`: touch-first and ordinary tenant forms.
- `compact`: data-dense desktop overviews.
- `planning`: planboard controls and rows without reducing touch targets below 44 px on touch layouts.

## Migration

Migration state is tracked in `component-registry.md` and `uiux-traceability.json`. Existing violations may be recorded in the temporary baseline used by the master gate; final strict mode accepts no baseline violations.
