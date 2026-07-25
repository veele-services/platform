# Fieldgrid UI/UX design decisions

Status: canonical for the UI/UX modernization program.

## Interaction architecture

- Radix UI is the canonical behavior and accessibility layer.
- Local shadcn/ui-style components are the canonical Fieldgrid component layer.
- Released product code consumes interactive primitives through `@/components/ui` or an approved Fieldgrid wrapper.
- Direct `@radix-ui/react-*` imports are restricted to shared primitive and adapter implementations.
- A custom interactive primitive requires a recorded exception with owner, rationale, keyboard contract, accessibility proof and removal/review date.

## Product truth

- Planned and actual work-order times remain separate.
- User-facing execution times use `Europe/Amsterdam`.
- Actual start and completion never overwrite the planned interval.
- Selecting an interested candidate atomically creates or restores the assignment.

## Visual language

- The current teal token remains the semantic interactive primary until an approved brand specification changes it.
- Official logo green is reserved for the brand mark and semantic success; it is not an alternative arbitrary CTA color.
- Platform and tenant applications share primitives and tokens, while platform views may use a denser information layout.
- Status always combines color with text, iconography or another non-color cue.
- Mobile planning uses agenda and explicit selection controls instead of shrinking the desktop Gantt.

## Change policy

Reversible implementation details may be selected autonomously when they preserve these decisions. Changes to product truth, authorization, tenant boundaries, public package identifiers, signing ownership or the primary brand require explicit product-owner approval.
